import re
import json
import logging
import time
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from models.orchestration_flow import OrchestrationFlow
from models.knowledge_source import KnowledgeSource

logger = logging.getLogger(__name__)

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
                "target": "api_dukcapil_lookup",
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
                "target": "db_bpn_sertifikat_search",
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
                "title": "Pemeriksaan Akta Notaris & Legalitas AHU",
                "action_type": "tool_call",
                "target": "api_ahu_kemenkumham",
                "priority": "REQUIRED",
                "description": "Verifikasi data legalitas badan usaha resmi Kemenkumham AHU (Tingkat 1 - Skor 95).",
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
        "name": "Alur Telaah Regulasi Hukum, SOP & Pedoman Operasional",
        "description": "Alur acuan pencarian pasal undang-undang, telaah hierarki perundang-undangan, dan kepatuhan standar operasional prosedur KPK.",
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
    def seed_default_flows(self, db: Session) -> int:
        """
        Seeds default golden orchestration flows if the table is empty or missing them.
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
            if created > 0:
                db.commit()
                logger.info(f"Successfully seeded {created} default orchestration flows.")
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
                try:
                    if re.search(pattern, q_lower, re.IGNORECASE):
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
                        # Extract simple arguments from query
                        args = {}
                        for p in cfg.get("parameters", []):
                            pname = p.get("name", "")
                            if pname:
                                args[pname] = q_clean

                        if matched_s.source_type == "database":
                            res = database_ingester.execute_tool_call_sync(cfg, args)
                        else:
                            res = api_ingester.execute_tool_call_sync(cfg, args)
                        result_entry["details"] = {
                            "source_name": matched_s.name,
                            "validity_tier": cfg.get("validity_tier", "authoritative"),
                            "validity_score": cfg.get("validity_score", 95),
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
