import hashlib
import json
import logging
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from services.vector_store import vector_store
from models.knowledge_source import KnowledgeSource, KnowledgeDocument

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

    # 3. Single record dictionary
    return [raw_data]


def save_tool_records_to_bank_data(
    source: KnowledgeSource,
    query_args: Dict[str, Any],
    records: Any,
    db = None
) -> int:
    """
    Automatically ingests query-by-parameter results into ChromaDB vector store
    and registers them into KnowledgeDocument as cumulative 'Bank Data'.
    Idempotent: Prevents duplication via content-based hashing.
    """
    norm_records = normalize_tool_data(records)
    if not norm_records:
        return 0

    texts_to_index = []
    metas_to_index = []
    ids_to_index = []

    for r_idx, record in enumerate(norm_records[:100]):
        if not isinstance(record, dict):
            continue

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

    if texts_to_index:
        try:
            vector_store.add_chunks(texts_to_index, metas_to_index, ids_to_index)
            logger.info(f"Successfully cached {len(texts_to_index)} record(s) from '{source.name}' into ChromaDB Bank Data.")

            # Update document record and source timestamp if db session is provided
            if db:
                try:
                    coll = vector_store.get_collection()
                    existing = coll.get(where={"source_id": source.id})
                    actual_count = len(existing.get("ids", [])) if existing else len(texts_to_index)
                except Exception:
                    actual_count = len(texts_to_index)

                doc_title = f"Bank Data: {source.name} (Hasil Query On-Demand)"
                doc = db.query(KnowledgeDocument).filter(
                    KnowledgeDocument.source_id == source.id,
                    KnowledgeDocument.title == doc_title
                ).first()

                if not doc:
                    doc = KnowledgeDocument(
                        source_id=source.id,
                        title=doc_title,
                        file_type="bank_data",
                        chunk_count=actual_count,
                        status="processed"
                    )
                    db.add(doc)
                else:
                    doc.chunk_count = actual_count

                source.last_synced_at = datetime.utcnow()
                db.commit()

            return len(texts_to_index)
        except Exception as e:
            logger.error(f"Failed to cache tool records into Bank Data: {e}")

    return 0
