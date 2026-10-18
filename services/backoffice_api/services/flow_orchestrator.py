import re
import json
import logging
import time
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from models.orchestration_flow import OrchestrationFlow
from models.knowledge_source import KnowledgeSource

logger = logging.getLogger(__name__)

TOOL_TARGET_ALIASES = {
    "api_dukcapil_lookup": "data_orang_dukcapil",
    "dukcapil": "data_orang_dukcapil",
    "siak": "data_orang_dukcapil",
    "db_bpn_sertifikat_search": "cari_tanah_bpn",
    "bpn": "cari_tanah_bpn",
    "tanah": "cari_tanah_bpn",
    "api_ahu_kemenkumham": "db_sikap_pemilik_usaha",
    "ahu": "db_sikap_pemilik_usaha",
    "sikap": "db_sikap_pemilik_usaha",
    "spse": "db_spse_tender_pengumuman",
    "tender": "db_spse_tender_pengumuman",
    "rup": "db_rup_paket_penyedia_terumumkan"
}

DEFAULT_GOLDEN_FLOWS = [
    {
        "name": "Alur Profiling NIK & Verifikasi Identitas Terpadu",
        "description": "Alur acuan baku untuk pengecekan data identitas kependudukan Dukcapil (Otoritatif Primer), penelusuran jaringan relasi keluarga, dan pencarian berkas arsip pendukung.",
        "prompt_pattern": "(?:siapa|profil|cari|identitas|cek|data).*?(?:nik|ktp|dukcapil|penduduk|nama)",
        "intent_category": "profiling",
        "trigger_keywords": ["nik", "ktp", "dukcapil", "profil", "kependudukan", "identitas", "nama", "keluarga"],
        "validity_priority_rule": "PRIORITIZE_HIGHEST_VALIDITY",
        "steps": [
            {
                "step_order": 1,
                "title": "Verifikasi Identitas Resmi Kependudukan",
                "action_type": "tool_call",
                "target": "data_orang_dukcapil",
                "priority": "MANDATORY",
                "description": "Ambil data profil kependudukan SIAK Dukcapil langsung sebagai sumber Otoritatif Primer (Tingkat 1 - Skor 95).",
                "parameters_mapping": {"nik": "{extracted_nik}", "nama": "{extracted_name}"}
            },
            {
                "step_order": 2,
                "title": "Eksplorasi Jaringan Relasi Keluarga & Afiliasi",
                "action_type": "graph_traversal",
                "target": "neo4j_entity_network",
                "priority": "REQUIRED",
                "description": "Petakan hubungan keluarga, pasangan hidup, dan entitas terkait di graf pengetahuan Neo4j.",
                "parameters_mapping": {"depth": 2}
            },
            {
                "step_order": 3,
                "title": "Pencarian Berkas & Dokumen Terkait",
                "action_type": "vector_search",
                "target": "chromadb_vector_store",
                "priority": "OPTIONAL",
                "description": "Ambil dokumen pendukung, laporan telaah, atau arsip riwayat dalam basis data vektor ChromaDB.",
                "parameters_mapping": {"top_k": 5}
            },
            {
                "step_order": 4,
                "title": "Sintesis & Resolusi Konflik Tingkat Validitas",
                "action_type": "synthesis_rule",
                "target": "validity_ranking",
                "priority": "MANDATORY",
                "description": "Menangkan data Otoritatif Dukcapil (Tingkat 1) jika terdapat perbedaan nama/status pada dokumen sekunder.",
                "parameters_mapping": {"rule": "AUTHORITATIVE_FIRST"}
            }
        ]
    },
    {
        "name": "Alur Penelusuran Aset Pertanahan & Kepemilikan Properti",
        "description": "Alur acuan baku untuk pencarian sertifikat hak milik/HGB di database BPN ATR, analisis jejaring kepemilikan aset, dan verifikasi deklarasi LHKPN.",
        "prompt_pattern": ".*?(?:tanah|sertifikat|bpn|properti|hgb|hak milik|lahan|persil).*",
        "intent_category": "aset",
        "trigger_keywords": ["tanah", "bpn", "sertifikat", "hgb", "hak milik", "lokasi", "persil", "luas", "properti", "lhkpn"],
        "validity_priority_rule": "PRIORITIZE_HIGHEST_VALIDITY",
        "steps": [
            {
                "step_order": 1,
                "title": "Pencarian Sertifikat di Basis Data BPN ATR",
                "action_type": "tool_call",
                "target": "cari_tanah_bpn",
                "priority": "MANDATORY",
                "description": "Query langsung ke database pertanahan BPN ATR (Tingkat 1 - Skor 95) untuk nomor sertifikat, luas, dan batas koordinat.",
                "parameters_mapping": {"nama": "{subject_name}", "lokasi": "{extracted_location}"}
            },
            {
                "step_order": 2,
                "title": "Pemetaan Graf Kepemilikan Aset & Penguasaan",
                "action_type": "graph_traversal",
                "target": "neo4j_entity_network",
                "priority": "REQUIRED",
                "description": "Visualisasikan hubungan antara subjek, perusahaan terafiliasi, dan objek tanah di graf Neo4j.",
                "parameters_mapping": {"relation_types": ["OWNS", "LOCATED_IN", "TRANSFERRED_TO"]}
            },
            {
                "step_order": 3,
                "title": "Verifikasi Dokumen Akta & Laporan LHKPN",
                "action_type": "vector_search",
                "target": "chromadb_vector_store",
                "priority": "REQUIRED",
                "description": "Cari salinan akta jual beli, warkah ukur, atau pengumuman deklarasi LHKPN tervalidasi.",
                "parameters_mapping": {"top_k": 4}
            },
            {
                "step_order": 4,
                "title": "Resolusi Konflik & Validitas Sertifikat",
                "action_type": "synthesis_rule",
                "target": "validity_ranking",
                "priority": "MANDATORY",
                "description": "Data resmi sertifikat aktif BPN wajib dimenangkan di atas klaim dokumen pengakuan tak bersertifikat.",
                "parameters_mapping": {"rule": "BPN_GROUND_TRUTH"}
            }
        ]
    },
    {
        "name": "Alur Investigasi Jaringan Afiliasi Korporasi & Rekening",
        "description": "Alur acuan penelusuran pemilik manfaat (beneficial ownership), struktur kepemilikan saham PT/CV, hubungan rekening bank, dan entitas cangkang.",
        "prompt_pattern": ".*?(?:perusahaan|korporasi|pt|cv|saham|afiliasi|direktur|komisaris|pemilik manfaat).*",
        "intent_category": "relasi",
        "trigger_keywords": ["perusahaan", "korporasi", "pt", "cv", "saham", "afiliasi", "direktur", "komisaris", "pemilik", "ahu"],
        "validity_priority_rule": "PRIORITIZE_HIGHEST_VALIDITY",
        "steps": [
            {
                "step_order": 1,
                "title": "Eksplorasi Jejaring Afiliasi di Graf Neo4j",
                "action_type": "graph_traversal",
                "target": "neo4j_entity_network",
                "priority": "MANDATORY",
                "description": "Jalankan algoritma graf untuk menemukan hubungan kepemilikan saham, direksi silang, dan klaster korporasi.",
                "parameters_mapping": {"max_depth": 3}
            },
            {
                "step_order": 2,
                "title": "Pemeriksaan Profil Vendor & Pemilik Usaha (SIKAP)",
                "action_type": "tool_call",
                "target": "db_sikap_pemilik_usaha",
                "priority": "REQUIRED",
                "description": "Verifikasi data profil penyedia, NPWP, dan susunan pemilik usaha di SIKAP / AHU (Tingkat 1 - Skor 95).",
                "parameters_mapping": {"nama_pt": "{company_name}"}
            },
            {
                "step_order": 3,
                "title": "Pencarian Laporan Audit & Rekam Jejak Transaksi",
                "action_type": "vector_search",
                "target": "chromadb_vector_store",
                "priority": "OPTIONAL",
                "description": "Cari berkas audit keuangan, BAP perkara, atau laporan transaksi mencurigakan.",
                "parameters_mapping": {"top_k": 5}
            },
            {
                "step_order": 4,
                "title": "Validitas Data Badan Usaha & Pengurus Aktif",
                "action_type": "synthesis_rule",
                "target": "validity_ranking",
                "priority": "MANDATORY",
                "description": "Sajikan susunan pengurus berdasarkan akta notaris perubahan terakhir yang sah di AHU.",
                "parameters_mapping": {"rule": "LATEST_AHU_DEED"}
            }
        ]
    },
    {
        "name": "Alur Penelusuran Pengadaan Barang & Jasa (PBJ), Tender SPSE & RUP Paket",
        "description": "Alur acuan penelusuran paket rencana pengadaan (RUP), data pengumuman lelang SPSE, verifikasi peserta/pemenang tender, dan profiling penyedia usaha.",
        "prompt_pattern": ".*?(?:tender|pengadaan|spse|rup|paket|lelang|penyedia|kontrak|hps|pemenang|satker).*",
        "intent_category": "pengadaan",
        "trigger_keywords": ["tender", "pengadaan", "spse", "rup", "paket", "penyedia", "lelang", "kontrak", "hps", "satker", "klpd"],
        "validity_priority_rule": "PRIORITIZE_HIGHEST_VALIDITY",
        "steps": [
            {
                "step_order": 1,
                "title": "Pencarian Rencana Umum Pengadaan & Paket Terumumkan",
                "action_type": "tool_call",
                "target": "db_rup_paket_penyedia_terumumkan",
                "priority": "MANDATORY",
                "description": "Query paket RUP terumumkan (Tingkat 1 - Skor 95) untuk identifikasi pagu anggaran, nama paket, dan satuan kerja pelaksana.",
                "parameters_mapping": {"nama_paket": "{package_name}", "tahun_anggaran": "{budget_year}"}
            },
            {
                "step_order": 2,
                "title": "Verifikasi Pengumuman Tender & Peserta Lelang SPSE",
                "action_type": "tool_call",
                "target": "db_spse_tender_pengumuman",
                "priority": "REQUIRED",
                "description": "Panggil database SPSE untuk status tender, nilai HPS, dan riwayat peserta penawaran lelang.",
                "parameters_mapping": {"nama_tender": "{tender_name}"}
            },
            {
                "step_order": 3,
                "title": "Pemeriksaan Profil Penyedia & Pemilik Usaha",
                "action_type": "tool_call",
                "target": "db_sikap_pemilik_usaha",
                "priority": "REQUIRED",
                "description": "Validasi profil vendor penyedia terdaftar, nomor NPWP, dan susunan pemilik usaha di SIKAP.",
                "parameters_mapping": {"nama_penyedia": "{vendor_name}"}
            },
            {
                "step_order": 4,
                "title": "Eksplorasi Jaringan Afiliasi Perusahaan di Graf Neo4j",
                "action_type": "graph_traversal",
                "target": "neo4j_entity_network",
                "priority": "REQUIRED",
                "description": "Telusuri hubungan kepemilikan silang antara penyedia pemenang dengan pejabat/panitia pengadaan.",
                "parameters_mapping": {"depth": 2}
            },
            {
                "step_order": 5,
                "title": "Sintesis Transparansi Pengadaan & Rekonsiliasi",
                "action_type": "synthesis_rule",
                "target": "validity_ranking",
                "priority": "MANDATORY",
                "description": "Rekonsiliasi data pagu RUP, penawaran SPSE, dan legalitas vendor SIKAP secara terpadu.",
                "parameters_mapping": {"rule": "PBJ_COMPREHENSIVE_AUDIT"}
            }
        ]
    },
    {
        "name": "Alur Telaah Regulasi Hukum, SOP & Pedoman Operasional",
        "description": "Alur acuan pencarian pasal undang-undang, telaah hierarki perundang-undangan, dan kepatuhan standar operasional prosedur organisasi.",
        "prompt_pattern": ".*?(?:kebijakan|regulasi|undang-undang|uu|sop|peraturan|pedoman|pasal|hukum).*",
        "intent_category": "regulasi",
        "trigger_keywords": ["kebijakan", "regulasi", "uu", "undang-undang", "peraturan", "sop", "pedoman", "pasal", "hukum", "perkara"],
        "validity_priority_rule": "PRIORITIZE_HIGHEST_VALIDITY",
        "steps": [
            {
                "step_order": 1,
                "title": "Pencarian Semantik Pasal & Dokumen Regulasi",
                "action_type": "vector_search",
                "target": "chromadb_vector_store",
                "priority": "MANDATORY",
                "description": "Ambil pasal-pasal relevan dan pertimbangan hukum dari teks resmi undang-undang / SOP.",
                "parameters_mapping": {"top_k": 6}
            },
            {
                "step_order": 2,
                "title": "Analisis Hubungan & Hierarki Peraturan di Graf",
                "action_type": "graph_traversal",
                "target": "neo4j_entity_network",
                "priority": "REQUIRED",
                "description": "Telusuri hubungan hierarki (mencabut, mengubah, atau merujuk aturan lain).",
                "parameters_mapping": {"relation_types": ["AMENDS", "REPEALS", "REFERENCES"]}
            },
            {
                "step_order": 3,
                "title": "Resolusi Status Keberlakuan Regulasi",
                "action_type": "synthesis_rule",
                "target": "validity_ranking",
                "priority": "MANDATORY",
                "description": "Pastikan hanya aturan yang masih berlaku yang disimpulkan sebagai pedoman utama.",
                "parameters_mapping": {"rule": "ACTIVE_LAW_FIRST"}
            }
        ]
    }
]

class FlowOrchestrator:
    def resolve_tool_target(self, target: str) -> str:
        """
        Resolves generic or legacy tool target names to active system tool dispatch names.
        """
        if not target:
            return ""
        return TOOL_TARGET_ALIASES.get(target.strip().lower(), target.strip())

    def seed_default_flows(self, db: Session) -> int:
        """
        Seeds default golden orchestration flows if missing and updates existing flow steps
        to keep tool targets aligned with the active tool catalog.
        """
        created = 0
        try:
            for item in DEFAULT_GOLDEN_FLOWS:
                existing = db.query(OrchestrationFlow).filter(OrchestrationFlow.name == item["name"]).first()
                if not existing:
                    flow = OrchestrationFlow(
                        name=item["name"],
                        description=item["description"],
                        prompt_pattern=item["prompt_pattern"],
                        intent_category=item["intent_category"],
                        trigger_keywords=item["trigger_keywords"],
                        validity_priority_rule=item["validity_priority_rule"],
                        steps=item["steps"],
                        is_active=True,
                        execution_count=0
                    )
                    db.add(flow)
                    created += 1
                else:
                    # Synchronize steps, keywords, and patterns to maintain target tool accuracy
                    existing.steps = item["steps"]
                    existing.trigger_keywords = item["trigger_keywords"]
                    existing.prompt_pattern = item["prompt_pattern"]
                    existing.validity_priority_rule = item["validity_priority_rule"]
                    created += 1
            if created > 0:
                db.commit()
                logger.info(f"Successfully synchronized {created} orchestration flows.")
        except Exception as e:
            db.rollback()
            logger.warning(f"Notice while seeding default orchestration flows: {e}")
        return created

    def match_flow_for_prompt(self, query: str, db: Session) -> Dict[str, Any]:
        """
        Evaluates active orchestration flows against a user prompt and returns the best matching flow.
        Uses pattern regex matching, keyword Jaccard overlap, and token scoring.
        """
        if not query or not query.strip():
            return {"matched": False, "flow": None, "confidence": 0.0, "match_reasons": []}

        q_clean = query.strip()
        q_lower = q_clean.lower()
        q_tokens = set(re.findall(r'\w+', q_lower))

        flows = db.query(OrchestrationFlow).filter(OrchestrationFlow.is_active == True).all()
        if not flows:
            self.seed_default_flows(db)
            flows = db.query(OrchestrationFlow).filter(OrchestrationFlow.is_active == True).all()

        best_flow = None
        best_score = 0.0
        best_reasons = []

        for flow in flows:
            score = 0.0
            reasons = []

            # 1. Regex / Wildcard Pattern Match
            pattern = flow.prompt_pattern
            if pattern:
                # Strip JavaScript-style regex delimiters (e.g. /pattern/gi)
                clean_pattern = pattern
                if clean_pattern.startswith('/') and '/' in clean_pattern[1:]:
                    parts = clean_pattern.rsplit('/', 1)
                    if len(parts) == 2:
                        clean_pattern = parts[0][1:]
                
                # Convert JS-style named capture groups `(?<name>...)` to Python `(?P<name>...)`
                clean_pattern = clean_pattern.replace('(?<', '(?P<')
                
                try:
                    if re.search(clean_pattern, q_lower, re.IGNORECASE):
                        score += 0.55
                        reasons.append(f"Mencocokkan pola prompt: '{pattern}'")
                except Exception:
                    pass

            # 2. Trigger Keywords Overlap
            keywords = flow.trigger_keywords or []
            matched_kws = [kw for kw in keywords if kw.lower() in q_lower]
            if matched_kws:
                kw_score = min(0.35, len(matched_kws) * 0.12)
                score += kw_score
                reasons.append(f"Mencocokkan kata kunci acuan: {matched_kws}")

            # 3. Intent Category Boost
            intent = (flow.intent_category or "").lower()
            if intent == "profiling" and any(w in q_lower for w in ["nik", "siapa", "profil", "ktp"]):
                score += 0.15
            elif intent == "aset" and any(w in q_lower for w in ["tanah", "bpn", "sertifikat", "aset", "properti"]):
                score += 0.15
            elif intent == "relasi" and any(w in q_lower for w in ["perusahaan", "pt", "saham", "hubungan", "afiliasi"]):
                score += 0.15
            elif intent == "regulasi" and any(w in q_lower for w in ["pasal", "undang", "uu", "sop", "aturan"]):
                score += 0.15

            if score > best_score:
                best_score = score
                best_flow = flow
                best_reasons = reasons

        # Normalize score to max 1.0
        final_confidence = round(min(1.0, best_score), 2)
        is_matched = final_confidence >= 0.50

        if is_matched and best_flow:
            flow_dict = best_flow.to_dict()
            steps_desc = " -> ".join([
                f"Langkah {s.get('order') or s.get('step') or s.get('step_number') or (i+1)}: {s.get('target') or s.get('target_name') or s.get('description', '')[:30]} ({s.get('action') or s.get('action_type')})"
                for i, s in enumerate(best_flow.steps or [])
            ])
            return {
                "matched": True,
                "confidence": final_confidence,
                "match_score": final_confidence,
                "flow": flow_dict,
                "flow_id": best_flow.id,
                "flow_name": best_flow.name,
                "intent_category": best_flow.intent_category,
                "steps": best_flow.steps,
                "validity_priority_rule": best_flow.validity_priority_rule,
                "procedural_guidance": steps_desc,
                "match_reasons": best_reasons,
                "recommended_instruction": (
                    f"Ikuti alur retrieval '{best_flow.name}' ({len(best_flow.steps)} langkah terdaftar: {steps_desc}). "
                    f"Prioritaskan pemanggilan tool primer dan terapkan aturan validitas data."
                )
            }

        return {
            "matched": False,
            "confidence": final_confidence,
            "match_score": final_confidence,
            "flow": None,
            "flow_id": None,
            "flow_name": None,
            "procedural_guidance": None,
            "match_reasons": []
        }

    def execute_flow(self, flow_id: int, query: str, db: Session) -> Dict[str, Any]:
        """
        Executes a registered orchestration flow step-by-step for a given test query.
        Returns execution telemetry for each step and consolidated results.
        """
        flow = db.query(OrchestrationFlow).filter(OrchestrationFlow.id == flow_id).first()
        if not flow:
            raise ValueError(f"Orchestration flow with ID {flow_id} not found.")

        start_time = time.time()
        flow.execution_count = (flow.execution_count or 0) + 1
        db.commit()

        steps_results = []
        q_clean = query.strip()

        for step in (flow.steps or []):
            step_order = step.get("step_order", 1)
            title = step.get("title", f"Langkah {step_order}")
            action = step.get("action_type", "unknown")
            target = step.get("target", "")
            step_start = time.time()

            result_entry = {
                "step": step_order,
                "order": step_order,
                "step_order": step_order,
                "title": title,
                "action": action,
                "action_type": action,
                "target": target,
                "status": "completed",
                "elapsed_ms": 0,
                "details": {}
            }

            try:
                if action == "tool_call":
                    from services.ingestion.api_ingester import api_ingester
                    from services.ingestion.database_ingester import database_ingester
                    
                    # Find tool source matching target
                    source = db.query(KnowledgeSource).filter(
                        KnowledgeSource.is_active == True,
                        KnowledgeSource.source_type.in_(["api", "database"])
                    ).all()

                    matched_s = None
                    for s in source:
                        cfg = s.config or {}
                        t_name = cfg.get("tool_name") or f"{'db_' if s.source_type == 'database' else 'api_'}{s.name.replace(' ', '_').lower()}"
                        clean_tname = "".join(c if c.isalnum() or c == "_" else "_" for c in t_name).lower()
                        if target in [clean_tname, s.name, str(s.id)]:
                            matched_s = s
                            break

                    if matched_s:
                        cfg = matched_s.config or {}
                        # Extract smart arguments from query
                        args = {}
                        for p in cfg.get("parameters", []):
                            pname = p.get("name", "")
                            if not pname:
                                continue
                            p_lower = pname.lower()
                            if p_lower in ["nama", "name", "person_name", "nama_orang"]:
                                m = re.search(r'(?:atas\s+nama|dengan\s+nama|orang\s+bernama|bernama|nama\s*[:=]?)\s+([a-zA-Z\s\.\,\'\-]+)', q_clean, re.IGNORECASE)
                                if m:
                                    clean_val = m.group(1).strip()
                                    clean_val = re.sub(r'[\?\.\,]+$', '', clean_val).strip()
                                    args[pname] = clean_val
                                else:
                                    filler = {'cari', 'data', 'profil', 'tanah', 'sertifikat', 'cek', 'lihat', 'tolong', 'atau', 'dari', 'orang', 'tentang'}
                                    tokens = [w for w in q_clean.split() if w.lower() not in filler]
                                    args[pname] = ' '.join(tokens) if tokens else q_clean
                            elif p_lower in ["nik", "no_ktp", "ktp"]:
                                m = re.search(r'\b(\d{16})\b', q_clean)
                                args[pname] = m.group(1) if m else q_clean
                            else:
                                args[pname] = q_clean

                        ttl_minutes = matched_s.cache_ttl_minutes  # None = no cache

                        # ── Cache lookup ─────────────────────────────────────
                        cache_hit = False
                        res = None
                        if ttl_minutes and ttl_minutes > 0:
                            from services.ingestion.bank_data_saver import (
                                get_cached_tool_result, save_tool_cache_entry, refresh_cache_async
                            )
                            cached_data, is_stale = get_cached_tool_result(matched_s.id, args, ttl_minutes)
                            if cached_data is not None:
                                cache_hit = True
                                res = {"success": True, "data": cached_data, "from_cache": True, "cache_stale": is_stale}
                                if is_stale:
                                    if matched_s.source_type == "database":
                                        refresh_cache_async(
                                            matched_s, args,
                                            lambda: database_ingester.execute_tool_call_sync(cfg, args),
                                            db
                                        )
                                    else:
                                        refresh_cache_async(
                                            matched_s, args,
                                            lambda: api_ingester.execute_tool_call_sync(cfg, args),
                                            db
                                        )

                        # ── Live call ─────────────────────────────────────────
                        if not cache_hit:
                            if matched_s.source_type == "database":
                                res = database_ingester.execute_tool_call_sync(cfg, args)
                            else:
                                res = api_ingester.execute_tool_call_sync(cfg, args)

                        # ── Persist result (bank data + cache entry) ──────────
                        if res.get("success") and res.get("data") and not cache_hit:
                            try:
                                from services.ingestion.bank_data_saver import (
                                    save_tool_records_to_bank_data, save_tool_cache_entry
                                )
                                save_tool_records_to_bank_data(matched_s, args, res.get("data"), db)
                                if ttl_minutes and ttl_minutes > 0:
                                    save_tool_cache_entry(matched_s, args, res.get("data"), db)
                            except Exception as save_err:
                                logger.warning(f"Notice auto-saving tool bank data in flow: {save_err}")

                        result_entry["details"] = {
                            "source_name": matched_s.name,
                            "validity_tier": cfg.get("validity_tier", "authoritative"),
                            "validity_score": cfg.get("validity_score", 95),
                            "arguments_used": args,
                            "success": res.get("success", False),
                            "row_count": len(res.get("data", [])) if isinstance(res.get("data"), list) else (1 if res.get("data") else 0),
                            "data_preview": res.get("data")[:3] if isinstance(res.get("data"), list) else res.get("data")
                        }
                    else:
                        result_entry["details"] = {
                            "message": f"Tool '{target}' siap dijalankan saat query mengandung parameter spesifik.",
                            "target": target
                        }

                elif action == "graph_traversal":
                    from services.graph.neo4j_client import neo4j_client
                    words = [w.strip().lower() for w in re.findall(r'\w+', q_clean) if len(w) >= 3]
                    entities_found = []
                    if words:
                        cypher = """
                        MATCH (e:Entity)
                        WHERE any(w in $words WHERE toLower(e.name) CONTAINS w)
                        OPTIONAL MATCH (e)-[r]-(target:Entity)
                        RETURN e.name AS name, e.type AS type, count(r) AS degree
                        LIMIT 5
                        """
                        records = neo4j_client.execute_read(cypher, {"words": words})
                        entities_found = [dict(r) for r in records]
                    result_entry["details"] = {
                        "matched_nodes_count": len(entities_found),
                        "entities": entities_found
                    }

                elif action == "vector_search":
                    from services.vector_store import vector_store
                    hits = vector_store.query_similarity(query=q_clean, n_results=3)
                    result_entry["details"] = {
                        "chunks_found": len(hits),
                        "top_hits": [
                            {
                                "id": h.get("id"),
                                "source": h.get("metadata", {}).get("source_name", "KB"),
                                "score": round(float(h.get("score", 0)), 4),
                                "preview": vector_store.extract_snippet(h.get("content", ""), q_clean, max_chars=400)
                            }
                            for h in hits[:3]
                        ]
                    }

                elif action == "synthesis_rule":
                    result_entry["details"] = {
                        "rule_applied": flow.validity_priority_rule or "PRIORITIZE_HIGHEST_VALIDITY",
                        "instruction": "Data dari sumber Otoritatif Tingkat 1 (Dukcapil/BPN) wajib dimenangkan di atas data sekunder."
                    }

            except Exception as step_err:
                result_entry["status"] = "failed"
                result_entry["error"] = str(step_err)

            result_entry["elapsed_ms"] = int((time.time() - step_start) * 1000)
            steps_results.append(result_entry)

        total_elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "flow_id": flow.id,
            "flow_name": flow.name,
            "intent_category": flow.intent_category,
            "query": q_clean,
            "total_steps": len(steps_results),
            "total_elapsed_ms": total_elapsed_ms,
            "steps": steps_results
        }

flow_orchestrator = FlowOrchestrator()
