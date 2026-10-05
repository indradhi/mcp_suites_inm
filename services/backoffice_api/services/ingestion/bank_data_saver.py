import hashlib
import json
import logging
import re
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from services.vector_store import vector_store
from models.knowledge_source import KnowledgeSource, KnowledgeDocument
from services.graph.graph_builder import graph_builder
from services.llm_service import llm_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool-call result cache helpers
# ---------------------------------------------------------------------------

def _make_cache_key(source_id: int, arguments: Dict[str, Any]) -> str:
    """Deterministic cache key from source_id + sorted arguments."""
    canon = json.dumps({"source_id": source_id, "args": arguments}, sort_keys=True, default=str)
    return hashlib.md5(canon.encode("utf-8")).hexdigest()


def get_cached_tool_result(
    source_id: int,
    arguments: Dict[str, Any],
    ttl_minutes: int
) -> Tuple[Optional[Any], bool]:
    """
    Check ChromaDB for a valid cached tool call result.

    Returns:
        (data, is_stale):
            - data=None, is_stale=False → cache miss (must call live API)
            - data=<value>, is_stale=False → fresh cache hit
            - data=<value>, is_stale=True  → stale hit (serve + refresh async)
    """
    try:
        cache_key = _make_cache_key(source_id, arguments)
        chunk_id = f"cache_{source_id}_{cache_key}"

        coll = vector_store.get_collection()
        result = coll.get(ids=[chunk_id], include=["metadatas", "documents"])

        if not result or not result.get("ids") or not result["ids"]:
            return None, False  # miss

        metas = result.get("metadatas", [{}])
        docs = result.get("documents", [""])
        if not metas or not docs:
            return None, False

        meta = metas[0]
        raw_doc = docs[0]

        cached_at_str = meta.get("cached_at")
        if not cached_at_str:
            return None, False

        try:
            cached_at = datetime.fromisoformat(cached_at_str.replace("Z", "+00:00"))
        except Exception:
            return None, False

        now_utc = datetime.now(timezone.utc)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age_minutes = (now_utc - cached_at).total_seconds() / 60.0
        is_stale = age_minutes > ttl_minutes

        try:
            data = json.loads(raw_doc)
        except Exception:
            data = raw_doc

        logger.info(
            f"Cache {'STALE' if is_stale else 'HIT'} for source {source_id} "
            f"(age={age_minutes:.1f}min, ttl={ttl_minutes}min)"
        )
        return data, is_stale

    except Exception as e:
        logger.warning(f"Error reading tool call cache: {e}")
        return None, False


def save_tool_cache_entry(
    source: KnowledgeSource,
    arguments: Dict[str, Any],
    raw_data: Any,
    db=None
) -> None:
    """
    Persist a tool call result into ChromaDB as a cache entry.
    Uses a deterministic chunk ID — re-inserting the same key overwrites
    the previous entry via ChromaDB's upsert behaviour.
    """
    try:
        cache_key = _make_cache_key(source.id, arguments)
        chunk_id = f"cache_{source.id}_{cache_key}"

        serialized = json.dumps(raw_data, ensure_ascii=False, default=str)

        meta = {
            "source_id": source.id,
            "source_name": source.name,
            "source_type": source.source_type,
            "is_cache_entry": True,
            "cache_key": cache_key,
            "cached_at": datetime.utcnow().isoformat() + "Z",
            "arguments_hash": cache_key,
        }

        coll = vector_store.get_collection()
        # Upsert: delete old entry then add fresh one
        try:
            coll.delete(ids=[chunk_id])
        except Exception:
            pass
        coll.add(
            documents=[serialized[:20000]],  # cap at 20 KB
            metadatas=[meta],
            ids=[chunk_id]
        )
        logger.info(f"Cache SAVED for source '{source.name}' (key={cache_key[:8]})")
    except Exception as e:
        logger.warning(f"Error saving tool call cache entry: {e}")


def refresh_cache_async(
    source: KnowledgeSource,
    arguments: Dict[str, Any],
    exec_fn,
    db=None
) -> None:
    """
    Fire-and-forget background refresh: calls exec_fn(), then saves the result.
    exec_fn must be a zero-argument callable that returns the execution result dict.
    """
    def _refresh():
        try:
            result = exec_fn()
            if result.get("success") and result.get("data") is not None:
                save_tool_cache_entry(source, arguments, result["data"], db)
                save_tool_records_to_bank_data(source, arguments, result["data"], db)
                logger.info(f"Background cache refresh completed for source '{source.name}'")
        except Exception as e:
            logger.warning(f"Background cache refresh failed for source '{source.name}': {e}")

    t = threading.Thread(target=_refresh, daemon=True)
    t.start()


def normalize_tool_data(raw_data: Any) -> List[Dict[str, Any]]:
    """
    Normalizes any API or database response into a flat list of dict records.
    Handles:
    - List of dicts: [ {...}, {...} ]
    - Dict with 'combinedResults': BPN API style [{'pemilik': [...], 'result': [...]}]
    - Dict with 'data', 'results', 'items', 'rows', 'records'
    - Single dict: {...}
    """
    if not raw_data:
        return []
    if isinstance(raw_data, list):
        return [r for r in raw_data if isinstance(r, dict)]
    if not isinstance(raw_data, dict):
        return []

    # Filter out upstream errors, failure messages, and not-found responses
    msg = str(raw_data.get("message", "")).lower()
    err = str(raw_data.get("error", "")).lower()
    st = str(raw_data.get("status", "")).lower()
    if "execution failed" in msg or "tidak ditemukan" in msg or "not found" in msg or st in ["error", "fail", "failed", "not_found"] or (err and err not in ["none", "false", "0"]):
        return []

    # Flatten common wrappers
    if 'data' in raw_data and isinstance(raw_data['data'], dict):
        raw_data = raw_data['data']
    elif 'result' in raw_data and isinstance(raw_data['result'], dict):
        raw_data = raw_data['result']

    # 1. BPN-style combinedResults (Land certificates with owner info)
    if 'combinedResults' in raw_data and isinstance(raw_data['combinedResults'], list):
        records = []
        for cr in raw_data['combinedResults']:
            owners = cr.get('pemilik', [])
            results = cr.get('result', [])
            
            # Extract owner(s) dict
            owner_fields = {}
            if owners and isinstance(owners, list):
                if len(owners) == 1 and isinstance(owners[0], dict):
                    for ok, ov in owners[0].items():
                        if ov is not None and str(ov).strip() and str(ov).strip() != '-':
                            owner_fields[f"pemilik_{ok}"] = ov
                else:
                    all_owner_names = []
                    for idx_o, o in enumerate(owners):
                        if isinstance(o, dict):
                            o_nama = o.get('nama')
                            if o_nama:
                                all_owner_names.append(str(o_nama))
                            for ok, ov in o.items():
                                if ov is not None and str(ov).strip() and str(ov).strip() != '-':
                                    owner_fields[f"pemilik_{idx_o+1}_{ok}"] = ov
                    if all_owner_names:
                        owner_fields["pemilik_nama"] = "; ".join(all_owner_names)

            if results and isinstance(results, list):
                for res in results:
                    if isinstance(res, dict):
                        rec = {}
                        # Apply owner fields
                        rec.update(owner_fields)

                        for rk, rv in res.items():
                            if rk == 'Polygon':
                                # Indicate spatial polygon availability without polluting text embeddings with huge coordinate arrays
                                if rv and isinstance(rv, dict) and rv.get('coordinates'):
                                    rec['polygon_bidang'] = 'Tersedia (GeoJSON Polygon)'
                                continue
                            if rk == 'catatan' and isinstance(rv, list):
                                cat_strs = []
                                for c in rv:
                                    if isinstance(c, dict):
                                        prosedur = c.get('prosedur') or ''
                                        tgl = c.get('tanggal') or ''
                                        pemegang = c.get('pemeganghak') or ''
                                        cat_part = f"{prosedur} ({tgl}) - {pemegang}" if (prosedur or tgl or pemegang) else ""
                                        
                                        tgllahir = c.get('tgllahir')
                                        if tgllahir and str(tgllahir).strip():
                                            cat_part += f" (Tgl Lahir: {tgllahir})"

                                        akta = c.get('akta')
                                        if isinstance(akta, dict):
                                            akta_parts = []
                                            if akta.get('Nomor'):
                                                akta_parts.append(f"No: {akta.get('Nomor')}")
                                            if akta.get('Tanggal'):
                                                akta_parts.append(f"Tgl: {akta.get('Tanggal')}")
                                            if akta.get('Pembuat'):
                                                akta_parts.append(f"PPAT: {akta.get('Pembuat')}")
                                            if akta.get('Nilai'):
                                                akta_parts.append(f"Nilai: {akta.get('Nilai')}")
                                            if akta.get('BPHTB'):
                                                akta_parts.append(f"BPHTB: {akta.get('BPHTB')}")
                                            if akta_parts:
                                                cat_part += f" [Akta: {', '.join(akta_parts)}]"
                                                
                                        if cat_part.strip():
                                            cat_strs.append(cat_part.strip())
                                if cat_strs:
                                    rec['riwayat_catatan'] = '; '.join(cat_strs)
                            else:
                                rec[rk] = rv
                        records.append(rec)
            elif owner_fields:
                records.append(owner_fields)
        if records:
            return records

    # 2. Common list-holding container keys
    for key in ['data', 'results', 'items', 'rows', 'records']:
        if key in raw_data and isinstance(raw_data[key], list):
            return [r for r in raw_data[key] if isinstance(r, dict)]

    # 3. Single record dictionary (guard against bare metadata or error objects)
    data_keys = set(raw_data.keys()) - {'message', 'status', 'error', 'code', 'respon_code', 'success'}
    if not data_keys:
        return []
    return [raw_data]


# ---------------------------------------------------------------------------
# Structured Network Entity & Relationship Extraction
# ---------------------------------------------------------------------------

def _clean_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    if not s or s in ['-', '--', 'null', 'None', 'undefined', 'NULL', 'nan']:
        return None
    return re.sub(r'\s+', ' ', s)


def _get_field(rec: Dict[str, Any], *candidates: str) -> Optional[str]:
    """Case-insensitive dictionary lookup matching any candidate key."""
    for cand in candidates:
        if cand in rec:
            val = _clean_str(rec[cand])
            if val:
                return val
    lower_map = {k.lower(): v for k, v in rec.items()}
    for cand in candidates:
        cand_l = cand.lower()
        if cand_l in lower_map:
            val = _clean_str(lower_map[cand_l])
            if val:
                return val
    return None


def extract_structured_entities_and_relations(
    record: Dict[str, Any],
    source: KnowledgeSource,
    query_args: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extracts canonical domain entities and semantic network relationships from a tool result record.
    Covers:
      - Persons (Dukcapil, BPN, corporate, generic)
      - Documents / Identifiers (NIK, KK, NPWP, Paspor, SIM, Akta, SK)
      - Assets (Sertifikat Hak Atas Tanah, NIB, Kendaraan / Nopol, Rekening Bank)
      - Organizations (PT, CV, Bank, Instansi, Kantor Pertanahan)
      - Locations (Alamat, Kelurahan, Kecamatan, Kota/Kabupaten, Provinsi)
      - Family relationships (Ayah, Ibu, Anak, Pasangan)
      - Professional / Corporate roles (Direktur, Komisaris, Pemegang Hak, Nasabah)
    """
    entities: List[Dict[str, Any]] = []
    relationships: List[Dict[str, Any]] = []

    # 1. Identify Person or Primary Individual
    raw_person = _get_field(
        record,
        'NAMA_LGKP', 'NAMA', 'NAMA_LENGKAP', 'pemilik_nama', 'pemilik',
        'pemegang_hak', 'pemeganghak', 'nama_pemilik', 'nama_nasabah',
        'direktur', 'komisaris', 'name', 'full_name', 'client_name', 'employee_name'
    )

    person_name: Optional[str] = None
    org_from_person: Optional[str] = None

    if raw_person:
        upper_p = raw_person.upper()
        if any(upper_p.startswith(pfx) for pfx in ['PT ', 'PT.', 'CV ', 'CV.', 'UD ', 'YAYASAN ', 'KOPERASI ', 'KSP ', 'PERUM ', 'DINAS ', 'KEMENTERIAN ']):
            org_from_person = raw_person
        else:
            person_name = raw_person
            entities.append({
                "name": person_name,
                "type": "PERSON",
                "description": f"Individu tercatat pada {source.name}"
            })

    # 2. Identify Corporate / Organization
    raw_org = _get_field(
        record,
        'nama_perusahaan', 'perusahaan', 'pt', 'cv', 'instansi',
        'kantor', 'nama_kantor', 'kantor_pertanahan', 'lembaga',
        'company', 'organization', 'company_name'
    ) or org_from_person

    org_name: Optional[str] = None
    if raw_org:
        org_name = raw_org
        entities.append({
            "name": org_name,
            "type": "ORGANIZATION",
            "description": f"Organisasi / Instansi tercatat pada {source.name}"
        })

        if person_name:
            if _get_field(record, 'direktur'):
                relationships.append({"source": person_name, "relation": "DIREKTUR_DI", "target": org_name})
            elif _get_field(record, 'komisaris'):
                relationships.append({"source": person_name, "relation": "KOMISARIS_DI", "target": org_name})
            elif _get_field(record, 'pemegang_saham'):
                relationships.append({"source": person_name, "relation": "PEMEGANG_SAHAM_DI", "target": org_name})
            else:
                relationships.append({"source": person_name, "relation": "TERAFILIASI_DENGAN", "target": org_name})

    # 3. Identify Documents & Identification
    # NIK
    nik_val = _get_field(record, 'NIK', 'nik', 'pemilik_nik', 'nik_pemilik', 'no_ktp', 'ktp')
    doc_nik: Optional[str] = None
    if nik_val and len(re.sub(r'\D', '', nik_val)) >= 6:
        doc_nik = f"NIK: {nik_val}"
        entities.append({
            "name": doc_nik,
            "type": "DOCUMENT",
            "description": f"Nomor Induk Kependudukan ({person_name or 'Individu'})"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "MEMILIKI_NIK", "target": doc_nik})

    # NO_KK
    kk_val = _get_field(record, 'NO_KK', 'no_kk', 'nomor_kk', 'nkk')
    doc_kk: Optional[str] = None
    if kk_val and len(re.sub(r'\D', '', kk_val)) >= 6:
        doc_kk = f"KK: {kk_val}"
        entities.append({
            "name": doc_kk,
            "type": "DOCUMENT",
            "description": "Nomor Kartu Keluarga"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "TERDAFTAR_DALAM_KK", "target": doc_kk})
        if doc_nik:
            relationships.append({"source": doc_nik, "relation": "TERCATAT_DALAM_KK", "target": doc_kk})

    # NPWP
    npwp_val = _get_field(record, 'NPWP', 'npwp', 'nomor_npwp')
    if npwp_val:
        doc_npwp = f"NPWP: {npwp_val}"
        entities.append({
            "name": doc_npwp,
            "type": "DOCUMENT",
            "description": "Nomor Pokok Wajib Pajak"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "MEMILIKI_NPWP", "target": doc_npwp})
        elif org_name:
            relationships.append({"source": org_name, "relation": "MEMILIKI_NPWP", "target": doc_npwp})

    # PASPOR
    paspor_val = _get_field(record, 'nomor_paspor', 'paspor', 'passport')
    if paspor_val:
        doc_paspor = f"PASPOR: {paspor_val}"
        entities.append({
            "name": doc_paspor,
            "type": "DOCUMENT",
            "description": "Dokumen Paspor Resmi"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "MEMILIKI_PASPOR", "target": doc_paspor})

    # SIM
    sim_val = _get_field(record, 'nomor_sim', 'sim', 'no_sim')
    if sim_val:
        doc_sim = f"SIM: {sim_val}"
        entities.append({
            "name": doc_sim,
            "type": "DOCUMENT",
            "description": "Surat Izin Mengemudi"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "MEMILIKI_SIM", "target": doc_sim})

    # 4. Identify Assets (Land / Vehicles / Bank Accounts)
    # Land / Sertifikat Hak Atas Tanah / NIB
    hak_val = _get_field(record, 'nomor_hak', 'nomorhak', 'nomor_sertifikat', 'nib', 'no_hak', 'no_sertifikat')
    asset_tanah: Optional[str] = None
    if hak_val:
        jenis_hak = _get_field(record, 'jenis_hak', 'jenishak', 'tipe_hak', 'tipe') or 'Hak Atas Tanah'
        asset_tanah = f"{jenis_hak.upper()} NO: {hak_val}"
        luas = _get_field(record, 'luas')
        luas_desc = f" (Luas {luas} m2)" if luas else ""
        entities.append({
            "name": asset_tanah,
            "type": "ASSET",
            "description": f"Sertifikat {jenis_hak} BPN{luas_desc}"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "MEMEGANG_HAK", "target": asset_tanah})
        elif org_name:
            relationships.append({"source": org_name, "relation": "MEMEGANG_HAK", "target": asset_tanah})

    # Kendaraan Bermotor
    nopol_val = _get_field(record, 'nomor_polisi', 'nopol', 'no_polisi', 'police_no')
    if nopol_val:
        merk = _get_field(record, 'merk', 'merek', 'brand') or ''
        tipe = _get_field(record, 'tipe', 'model') or ''
        asset_ranmor = f"NOPOL: {nopol_val.upper()}"
        entities.append({
            "name": asset_ranmor,
            "type": "ASSET",
            "description": f"Kendaraan Bermotor {merk} {tipe}".strip()
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "PEMILIK_KENDARAAN", "target": asset_ranmor})

    # Rekening Bank
    rek_val = _get_field(record, 'nomor_rekening', 'no_rekening', 'rekening', 'account_number')
    if rek_val:
        bank_name = _get_field(record, 'nama_bank', 'bank', 'bank_name') or 'BANK'
        bank_org = bank_name.upper()
        asset_rek = f"REKENING: {bank_org} - {rek_val}"
        entities.append({
            "name": asset_rek,
            "type": "ASSET",
            "description": f"Rekening pada {bank_name}"
        })
        entities.append({
            "name": bank_org,
            "type": "ORGANIZATION",
            "description": f"Institusi Perbankan {bank_org}"
        })
        relationships.append({"source": asset_rek, "relation": "DIKELOLA_OLEH", "target": bank_org})
        if person_name:
            relationships.append({"source": person_name, "relation": "PEMILIK_REKENING", "target": asset_rek})
        elif org_name:
            relationships.append({"source": org_name, "relation": "PEMILIK_REKENING", "target": asset_rek})

    # 5. Identify Location / Address
    alamat_val = _get_field(record, 'ALAMAT', 'alamat', 'address', 'pemilik_alamat')
    rt_val = _get_field(record, 'NO_RT', 'rt')
    rw_val = _get_field(record, 'NO_RW', 'rw')
    kel_val = _get_field(record, 'KEL_NAME', 'kelurahan', 'desa')
    kec_val = _get_field(record, 'KEC_NAME', 'kecamatan')
    kab_val = _get_field(record, 'KAB_NAME', 'kabupaten', 'kota', 'city')
    prop_val = _get_field(record, 'PROP_NAME', 'provinsi', 'province')

    loc_parts = []
    if alamat_val:
        loc_parts.append(alamat_val)
    if rt_val or rw_val:
        rt_str = f"RT {rt_val}" if rt_val else ""
        rw_str = f"RW {rw_val}" if rw_val else ""
        loc_parts.append(f"{rt_str} {rw_str}".strip())
    if kel_val:
        loc_parts.append(f"Kel. {kel_val}")
    if kec_val:
        loc_parts.append(f"Kec. {kec_val}")
    if kab_val:
        loc_parts.append(kab_val)
    if prop_val:
        loc_parts.append(prop_val)

    if loc_parts:
        loc_str = ", ".join(loc_parts)
        loc_ent = f"LOKASI: {loc_str}"
        entities.append({
            "name": loc_ent,
            "type": "LOCATION",
            "description": f"Wilayah: {loc_str}"
        })
        if person_name:
            relationships.append({"source": person_name, "relation": "BERALAMAT_DI", "target": loc_ent})
        if asset_tanah:
            relationships.append({"source": asset_tanah, "relation": "BERLOKASI_DI", "target": loc_ent})

    # 6. Family Relationships (Dukcapil)
    # Ayah
    ayah_val = _get_field(record, 'NAMA_LGKP_AYAH', 'NAMA_AYAH', 'AYAH', 'ayah')
    if ayah_val and person_name and ayah_val.upper() != person_name.upper():
        entities.append({
            "name": ayah_val,
            "type": "PERSON",
            "description": f"Ayah dari {person_name}"
        })
        relationships.append({"source": person_name, "relation": "ANAK_DARI", "target": ayah_val})
        relationships.append({"source": ayah_val, "relation": "ORANG_TUA_DARI", "target": person_name})

        nik_ayah = _get_field(record, 'NIK_AYAH', 'nik_ayah')
        if nik_ayah and len(re.sub(r'\D', '', nik_ayah)) >= 6:
            nik_ayah_ent = f"NIK: {nik_ayah}"
            entities.append({
                "name": nik_ayah_ent,
                "type": "DOCUMENT",
                "description": f"NIK Ayah ({ayah_val})"
            })
            relationships.append({"source": ayah_val, "relation": "MEMILIKI_NIK", "target": nik_ayah_ent})
        if doc_kk:
            relationships.append({"source": ayah_val, "relation": "TERDAFTAR_DALAM_KK", "target": doc_kk})

    # Ibu
    ibu_val = _get_field(record, 'NAMA_LGKP_IBU', 'NAMA_IBU', 'IBU', 'ibu')
    if ibu_val and person_name and ibu_val.upper() != person_name.upper():
        entities.append({
            "name": ibu_val,
            "type": "PERSON",
            "description": f"Ibu dari {person_name}"
        })
        relationships.append({"source": person_name, "relation": "ANAK_DARI", "target": ibu_val})
        relationships.append({"source": ibu_val, "relation": "ORANG_TUA_DARI", "target": person_name})

        nik_ibu = _get_field(record, 'NIK_IBU', 'nik_ibu')
        if nik_ibu and len(re.sub(r'\D', '', nik_ibu)) >= 6:
            nik_ibu_ent = f"NIK: {nik_ibu}"
            entities.append({
                "name": nik_ibu_ent,
                "type": "DOCUMENT",
                "description": f"NIK Ibu ({ibu_val})"
            })
            relationships.append({"source": ibu_val, "relation": "MEMILIKI_NIK", "target": nik_ibu_ent})
        if doc_kk:
            relationships.append({"source": ibu_val, "relation": "TERDAFTAR_DALAM_KK", "target": doc_kk})

    if ayah_val and ibu_val and ayah_val.upper() != ibu_val.upper():
        relationships.append({"source": ayah_val, "relation": "PASANGAN_DARI", "target": ibu_val})

    # 7. BPN Catatan / Akta PPAT
    riwayat_cat = _get_field(record, 'riwayat_catatan', 'catatan')
    if riwayat_cat:
        ppat_m = re.search(r'PPAT:\s*([^,\]]+)', riwayat_cat, re.IGNORECASE)
        akta_m = re.search(r'No:\s*([^,\]]+)', riwayat_cat, re.IGNORECASE)

        akta_ent = None
        if akta_m:
            akta_no = akta_m.group(1).strip()
            if akta_no and akta_no != '-':
                akta_ent = f"AKTA: {akta_no}"
                entities.append({
                    "name": akta_ent,
                    "type": "DOCUMENT",
                    "description": "Akta Peralihan Hak PPAT"
                })
                if asset_tanah:
                    relationships.append({"source": akta_ent, "relation": "MENCATAT_PERALIHAN", "target": asset_tanah})

        if ppat_m:
            ppat_name = ppat_m.group(1).strip()
            if ppat_name and ppat_name != '-':
                ppat_ent = f"PPAT: {ppat_name}"
                entities.append({
                    "name": ppat_ent,
                    "type": "ORGANIZATION",
                    "description": "Pejabat Pembuat Akta Tanah"
                })
                if akta_ent:
                    relationships.append({"source": ppat_ent, "relation": "MENERBITKAN_AKTA", "target": akta_ent})

    # 8. Deduplicate entities by name (case-insensitive) and relationships
    unique_entities = []
    seen_ent_names = set()
    for ent in entities:
        norm = ent["name"].strip().upper()
        if norm and norm not in seen_ent_names:
            seen_ent_names.add(norm)
            unique_entities.append(ent)

    unique_relationships = []
    seen_rels = set()
    for rel in relationships:
        key = (rel["source"].strip().upper(), rel["relation"], rel["target"].strip().upper())
        if key[0] and key[2] and key[0] != key[2] and key not in seen_rels:
            seen_rels.add(key)
            unique_relationships.append(rel)

    return unique_entities, unique_relationships


def _enrich_narrative_graph_async(source_id: int, source_name: str, narrative_chunks: List[str]):
    """
    Background daemon thread to asynchronously extract nuanced semantic entities
    and relationships using LLM without holding up live chat or API responses.
    """
    def _worker():
        from database import SessionLocal
        db = None
        try:
            db = SessionLocal()
            for chunk in narrative_chunks:
                try:
                    res = llm_service.extract_entities_and_relations(chunk, db)
                    ents = res.get("entities", [])
                    rels = res.get("relationships", [])
                    if ents:
                        graph_builder.upsert_entities(ents, source_id, source_name)
                    if rels:
                        graph_builder.upsert_relationships(rels, source_id)
                except Exception as chunk_err:
                    logger.debug(f"Narrative enrichment chunk notice: {chunk_err}")

            # Update entities count after background enrichment
            try:
                actual_ent_count = graph_builder.get_entity_count_by_source(source_id)
                doc_title = f"Bank Data: {source_name} (Hasil Query On-Demand)"
                doc = db.query(KnowledgeDocument).filter(
                    KnowledgeDocument.source_id == source_id,
                    KnowledgeDocument.title == doc_title
                ).first()
                if doc:
                    doc.entities_count = actual_ent_count
                    db.commit()
            except Exception:
                pass

            logger.info(f"Background narrative graph enrichment completed for source '{source_name}' ({source_id})")
        except Exception as e:
            logger.warning(f"Background narrative graph enrichment failed for source '{source_name}': {e}")
        finally:
            if db:
                db.close()

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


def save_tool_records_to_bank_data(
    source: KnowledgeSource,
    query_args: Dict[str, Any],
    records: Any,
    db = None
) -> int:
    """
    Automatically ingests query-by-parameter results into ChromaDB vector store
    and registers them into KnowledgeDocument as cumulative 'Bank Data'.
    Also extracts and saves network entities and relationships into Neo4j Knowledge Graph.
    Idempotent: Prevents duplication via content-based hashing.
    """
    norm_records = normalize_tool_data(records)
    if not norm_records:
        return 0

    texts_to_index = []
    metas_to_index = []
    ids_to_index = []

    # 1. Extract structured entities and relations for Knowledge Graph
    all_extracted_entities = []
    all_extracted_relations = []
    narrative_chunks = []

    for r_idx, record in enumerate(norm_records[:100]):
        if not isinstance(record, dict):
            continue

        # Extract graph entities & relations from structured fields
        try:
            ents, rels = extract_structured_entities_and_relations(record, source, query_args)
            all_extracted_entities.extend(ents)
            all_extracted_relations.extend(rels)
        except Exception as ext_err:
            logger.warning(f"Notice during structured graph extraction for record {r_idx}: {ext_err}")

        # Check for narrative text for background LLM enrichment
        for nk in ['riwayat_catatan', 'catatan', 'keterangan', 'deskripsi', 'kronologi', 'notes', 'memo']:
            nval = record.get(nk)
            if nval and isinstance(nval, str) and len(nval.strip()) > 60:
                narrative_chunks.append(f"Sumber: {source.name}\n{nk}: {nval.strip()}")

        fields = [f"Sumber Data: {source.name} ({source.source_type.upper()})"]
        if query_args:
            args_str = ", ".join(f"{k}={v}" for k, v in query_args.items() if v)
            if args_str:
                fields.append(f"Parameter Query: {args_str}")

        clean_rec = {}
        for k, v in record.items():
            if v is not None and str(v).strip():
                val_str = str(v).strip()
                # Avoid polluting vector search text with giant base64 image strings
                if len(val_str) > 500 and (
                    val_str.startswith('/9j/') or 
                    val_str.startswith('data:image') or
                    val_str.startswith('iVBORw0KGgo') or
                    val_str.startswith('R0lGOD') or
                    val_str.startswith('UklGR')
                ):
                    clean_rec[k] = "[FOTO_ATTACHED]"
                    fields.append(f"{k}: [FOTO_ATTACHED]")
                else:
                    clean_rec[k] = val_str
                    fields.append(f"{k}: {val_str[:2500]}")

        chunk_text = "\n".join(fields)
        if not chunk_text.strip():
            continue

        # Generate unique deterministic ID using source_id and record hash
        rec_hash = hashlib.md5(json.dumps(clean_rec, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:12]
        chunk_id = f"bank_src_{source.id}_{rec_hash}"

        metadata = {
            "source_id": source.id,
            "source_name": source.name,
            "source_type": source.source_type,
            "is_bank_data": True,
            "queried_at": datetime.utcnow().isoformat()
        }

        texts_to_index.append(chunk_text)
        metas_to_index.append(metadata)
        ids_to_index.append(chunk_id)

    # Deduplicate entities before upsert
    dedup_entities = []
    seen_names = set()
    for ent in all_extracted_entities:
        nm = ent["name"].strip().upper()
        if nm and nm not in seen_names:
            seen_names.add(nm)
            dedup_entities.append(ent)

    dedup_relations = []
    seen_rel_keys = set()
    for rel in all_extracted_relations:
        rk = (rel["source"].strip().upper(), rel["relation"], rel["target"].strip().upper())
        if rk[0] and rk[2] and rk[0] != rk[2] and rk not in seen_rel_keys:
            seen_rel_keys.add(rk)
            dedup_relations.append(rel)

    ent_upserted = 0
    rel_upserted = 0
    if dedup_entities:
        try:
            ent_upserted = graph_builder.upsert_entities(dedup_entities, source.id, source.name)
            logger.info(f"Auto Bank Data: Upserted {ent_upserted} entities to Neo4j for source '{source.name}'")
        except Exception as ge_err:
            logger.warning(f"Notice upserting entities to Neo4j for source '{source.name}': {ge_err}")

    if dedup_relations:
        try:
            rel_upserted = graph_builder.upsert_relationships(dedup_relations, source.id)
            logger.info(f"Auto Bank Data: Upserted {rel_upserted} relationships to Neo4j for source '{source.name}'")
        except Exception as gr_err:
            logger.warning(f"Notice upserting relationships to Neo4j for source '{source.name}': {gr_err}")

    # Launch background async LLM enrichment for narrative text if present
    if narrative_chunks:
        _enrich_narrative_graph_async(source.id, source.name, narrative_chunks[:5])

    if texts_to_index:
        try:
            vector_store.add_chunks(texts_to_index, metas_to_index, ids_to_index)
            logger.info(f"Successfully cached {len(texts_to_index)} record(s) from '{source.name}' into ChromaDB Bank Data.")

            # Update document record, entities count, and source timestamp in MySQL
            own_db_session = False
            active_db = db
            if active_db is None:
                try:
                    from database import SessionLocal
                    active_db = SessionLocal()
                    own_db_session = True
                except Exception:
                    active_db = None

            if active_db:
                try:
                    coll = vector_store.get_collection()
                    existing = coll.get(where={"source_id": source.id})
                    actual_count = len(existing.get("ids", [])) if existing else len(texts_to_index)
                except Exception:
                    actual_count = len(texts_to_index)

                try:
                    actual_entities = graph_builder.get_entity_count_by_source(source.id)
                    if actual_entities == 0:
                        actual_entities = ent_upserted

                    doc_title = f"Bank Data: {source.name} (Hasil Query On-Demand)"
                    doc = active_db.query(KnowledgeDocument).filter(
                        KnowledgeDocument.source_id == source.id,
                        KnowledgeDocument.title == doc_title
                    ).first()

                    if not doc:
                        doc = KnowledgeDocument(
                            source_id=source.id,
                            title=doc_title,
                            file_type="bank_data",
                            chunk_count=actual_count,
                            entities_count=actual_entities,
                            status="processed"
                        )
                        active_db.add(doc)
                    else:
                        doc.chunk_count = actual_count
                        doc.entities_count = actual_entities

                    source_in_db = active_db.query(KnowledgeSource).filter(KnowledgeSource.id == source.id).first()
                    if source_in_db:
                        source_in_db.last_synced_at = datetime.utcnow()

                    active_db.commit()
                    logger.info(f"Auto Bank Data: Updated KnowledgeDocument for '{source.name}' (chunks={actual_count}, entities={actual_entities})")
                except Exception as doc_err:
                    logger.warning(f"Error updating KnowledgeDocument in Bank Data: {doc_err}")
                finally:
                    if own_db_session and active_db:
                        active_db.close()

            return len(texts_to_index)
        except Exception as e:
            logger.error(f"Failed to cache tool records into Bank Data: {e}")

    return 0
