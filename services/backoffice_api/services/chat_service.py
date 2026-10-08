import os
import time
import re
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
from services.vector_store import vector_store
from services.graph.neo4j_client import neo4j_client
from services.llm_service import llm_service
from services.personality_service import personality_service
from services.context_rot_guard import context_rot_guard

logger = logging.getLogger(__name__)


class ChatService:
    def get_graph_entities(self, query_text: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Extracts entities from Neo4j matching keywords in the query text,
        retrieving both direct connections (1-hop) and multi-hop relationship paths (2-hop).
        """
        words = [w.strip().lower() for w in re.findall(r'\w+', query_text) if len(w) >= 3]
        if not words:
            return []

        cypher = """
        MATCH (e:Entity)
        WHERE any(w in $words WHERE toLower(e.name) CONTAINS w OR toLower(coalesce(e.description, '')) CONTAINS w)
        WITH e LIMIT $limit
        OPTIONAL MATCH (e)-[r]-(target:Entity)
        WITH e, 
             collect(DISTINCT {
                 relation: type(r), 
                 target: target.name, 
                 target_type: coalesce(target.type, 'ENTITY')
             })[0..12] AS direct_rels
        OPTIONAL MATCH (e)-[r1]-(mid:Entity)-[r2]-(hop2:Entity)
        WHERE hop2 <> e AND NOT (e)--(hop2)
        WITH e, direct_rels,
             collect(DISTINCT {
                 path_desc: e.name + ' -[' + type(r1) + ']-> ' + mid.name + ' -[' + type(r2) + ']-> ' + hop2.name + ' (' + coalesce(hop2.type, 'ENTITY') + ')'
             })[0..6] AS multi_hop_paths
        RETURN e.name AS name,
               e.type AS type,
               e.description AS description,
               direct_rels,
               multi_hop_paths
        """
        try:
            records = neo4j_client.execute_read(cypher, {"words": words, "limit": limit})
            entities_list = []
            for row in records:
                name = row.get("name")
                if not name:
                    continue
                direct_rels = row.get("direct_rels", [])
                conns = []
                for d in direct_rels:
                    rel = d.get("relation")
                    target = d.get("target")
                    ttype = d.get("target_type", "ENTITY")
                    if rel and target:
                        conns.append(f"{rel} -> {target} ({ttype})")

                multi_hops = []
                for m in row.get("multi_hop_paths", []):
                    p_desc = m.get("path_desc")
                    if p_desc and p_desc not in multi_hops:
                        multi_hops.append(p_desc)

                entities_list.append({
                    "name": name,
                    "type": row.get("type", "ENTITY"),
                    "description": row.get("description", ""),
                    "connections": conns,
                    "multi_hop_paths": multi_hops
                })

            return entities_list
        except Exception as e:
            logger.warning(f"Error querying graph entities for chat: {e}")
            return []

    def chat_with_knowledge(
        self,
        message: str,
        image_base64: Optional[str] = None,
        uploaded_document: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict[str, str]]] = None,
        source_id: Optional[int] = None,
        source_ids: Optional[List[int]] = None,
        backend_id: Optional[int] = None,
        model_name: Optional[str] = None,
        include_graph: bool = True,
        top_k: int = 20,
        db: Any = None,
        liked_examples: Optional[List[Dict[str, str]]] = None,
        dislike_notes: Optional[List[str]] = None,
        strict_mode: bool = True,
        temperature: Optional[float] = None,
        # ── OpenAI standard parameters ──────────────────────────────
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        seed: Optional[int] = None,
        stop: Optional[Any] = None,
        max_tokens: Optional[int] = None,
        max_completion_tokens: Optional[int] = None,
        logprobs: Optional[bool] = None,
        top_logprobs: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None,
        user: Optional[str] = None,
        n: Optional[int] = None,
        stream_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Executes hybrid RAG:
        1. Retrieves vector chunks from ChromaDB (optionally filtered by source_ids).
        2. Retrieves relevant entities and relationships from Neo4j.
        3. Formulates a grounded context prompt.
        4. Calls LLM backend and generates response with citations and metadata.
        """
        start_time = time.time()
        history = history or []

        # Dynamic Personality Activation via Greeting (e.g. "Hello Jarvis")
        active_personality_override = None
        if not history and db:
            greeting_match = re.match(r'^(?:hello|halo|hai|hey|hi|panggil)\s+([a-zA-Z0-9_\s]+?)[!.,\?]*\s*(.*)$', message, re.IGNORECASE)
            if greeting_match:
                target_name = greeting_match.group(1).strip().lower()
                all_pers = personality_service.get_all_available_personalities(db)
                for p in all_pers:
                    p_name = (p.get("name") or "").lower()
                    if target_name in p_name or target_name == str(p.get("preset_id")).lower():
                        active_personality_override = p
                        # Optionally strip the greeting from the message, or leave it so the AI sees it
                        # message = greeting_match.group(2).strip() or message
                        logger.info(f"Dynamically activated personality '{p.get('name')}' via greeting trigger.")
                        break

        # Consolidate source_ids
        active_source_ids = []
        if source_ids:
            active_source_ids = [int(sid) for sid in source_ids if sid is not None]
        elif source_id is not None:
            active_source_ids = [int(source_id)]

        # Check if selected sources include AI Tools or vector sources
        selected_tool_names = []
        selected_vector_source_ids = []
        is_only_tools_selected = False
        is_single_tool_selected = False
        single_selected_tool_name = None

        if active_source_ids and db:
            try:
                from models.knowledge_source import KnowledgeSource
                selected_sources = db.query(KnowledgeSource).filter(
                    KnowledgeSource.id.in_(active_source_ids),
                    KnowledgeSource.is_active == True
                ).all()
                for sel_s in selected_sources:
                    if sel_s.source_type in ["mcp", "mcp_server"]:
                        mcp_tools = (sel_s.config or {}).get("tools", [])
                        prefix = f"mcp_{sel_s.name.replace(' ', '_').lower()}_"
                        for t in mcp_tools:
                            if t.get("enabled", True):
                                raw_name = t.get("name", "tool")
                                tool_slug = "".join(c if c.isalnum() or c == "_" else "_" for c in f"{prefix}{raw_name}").lower()
                                selected_tool_names.append(tool_slug)
                        if not mcp_tools:
                            tool_slug = "".join(c if c.isalnum() or c == "_" else "_" for c in f"mcp_{sel_s.name}").lower()
                            selected_tool_names.append(tool_slug)
                    elif (sel_s.config or {}).get("is_tool") or (sel_s.config or {}).get("parameters"):
                        prefix = "db_" if sel_s.source_type == "database" else "api_"
                        raw_name = (sel_s.config or {}).get("tool_name") or f"{prefix}{sel_s.name.replace(' ', '_').lower()}"
                        tool_slug = "".join(c if c.isalnum() or c == "_" else "_" for c in raw_name).lower()
                        selected_tool_names.append(tool_slug)
                    else:
                        selected_vector_source_ids.append(sel_s.id)

                if selected_tool_names and not selected_vector_source_ids:
                    is_only_tools_selected = True
                if len(selected_tool_names) == 1 and not selected_vector_source_ids:
                    is_single_tool_selected = True
                    single_selected_tool_name = selected_tool_names[0]
            except Exception as e:
                logger.warning(f"Error checking selected sources: {e}")

        # 1. Vector Retrieval from ChromaDB (skip if ONLY AI tools were selected)
        retrieved_chunks = []
        if not is_only_tools_selected:
            filter_meta = None
            if selected_vector_source_ids:
                if len(selected_vector_source_ids) == 1:
                    filter_meta = {"source_id": selected_vector_source_ids[0]}
                else:
                    filter_meta = {"source_id": {"$in": selected_vector_source_ids}}
            elif active_source_ids and not selected_tool_names:
                if len(active_source_ids) == 1:
                    filter_meta = {"source_id": active_source_ids[0]}
                else:
                    filter_meta = {"source_id": {"$in": active_source_ids}}
            elif db:
                try:
                    from models.knowledge_source import KnowledgeSource
                    active_sources = db.query(KnowledgeSource.id).filter(
                        KnowledgeSource.is_active == True
                    ).all()
                    active_ids = [s[0] for s in active_sources]
                    if active_ids:
                        if len(active_ids) == 1:
                            filter_meta = {"source_id": active_ids[0]}
                        else:
                            filter_meta = {"source_id": {"$in": active_ids}}
                    else:
                        filter_meta = {"source_id": -999999}
                except Exception as e:
                    logger.warning(f"Error filtering active sources for vector retrieval: {e}")

            # Expand retrieval budget for multi-record requests or default to 20
            is_family_or_kk_query = bool(re.search(r'\b(?:kk|kartu\s+keluarga|no_kk)\b', message, re.IGNORECASE) or re.search(r'\b\d{16}\b', message))
            effective_top_k = max(top_k or 20, 20) if is_family_or_kk_query else (top_k or 20)

            try:
                retrieved_chunks = vector_store.query_similarity(
                    query=message,
                    n_results=effective_top_k,
                    filter_meta=filter_meta
                )
                if retrieved_chunks and db:
                    try:
                        from models.knowledge_source import KnowledgeSource
                        sources_map = {s.id: s for s in db.query(KnowledgeSource).all()}
                        active_ids_set = set(sid for sid, s in sources_map.items() if s.is_active)
                        scored_chunks = []
                        for c in retrieved_chunks:
                            sid = c.get("metadata", {}).get("source_id")
                            if sid is not None and sid not in active_ids_set:
                                continue
                            s_obj = sources_map.get(sid)
                            cfg = (s_obj.config or {}) if s_obj else {}

                            # Validity tier hierarchy defaults
                            default_tier = "authoritative" if s_obj and s_obj.source_type in ["database", "api", "mcp", "mcp_server"] and (cfg.get("is_tool") or cfg.get("parameters") or s_obj.source_type in ["mcp", "mcp_server"]) else ("verified" if s_obj and s_obj.source_type in ["database", "file"] else "secondary")
                            default_score = 95 if default_tier == "authoritative" else (85 if default_tier == "verified" else 65)

                            v_tier = cfg.get("validity_tier") or default_tier
                            v_score = int(cfg.get("validity_score", default_score)) if cfg.get("validity_score") is not None else default_score
                            v_notes = cfg.get("validity_notes") or ""

                            sim_score = float(c.get("score", 0.0))
                            # Hybrid score: 70% semantic relevance + 30% authority validity score
                            effective_score = round(sim_score * 0.7 + (v_score / 100.0) * 0.3, 4)

                            c["validity_tier"] = v_tier
                            c["validity_score"] = v_score
                            c["validity_notes"] = v_notes
                            c["effective_score"] = effective_score
                            scored_chunks.append(c)

                        # Sort chunks by effective score (high validity outranks lower validity when similarity is comparable)
                        scored_chunks.sort(key=lambda x: x.get("effective_score", 0.0), reverse=True)
                        retrieved_chunks = scored_chunks
                    except Exception as e:
                        logger.warning(f"Error evaluating validity scoring for chunks: {e}")

                # Anti-Rot Vector Filtering: Filter out cross-entity contaminated chunks belonging to different individuals
                target_person_name = context_rot_guard.extract_target_subject_name(message)
                if target_person_name and retrieved_chunks:
                    target_tokens = set(w for w in target_person_name.upper().split() if len(w) >= 3)
                    filtered_chunks = []
                    for c in retrieved_chunks:
                        content_up = c.get("content", "").upper()
                        src_name_lower = str(c.get("metadata", {}).get("source_name", "")).lower()

                        # Check explicit owner/person matches
                        owner_matches = re.findall(
                            r'(?:PEMILIK(?:_NAMA|\s+NAMA)?|NAMA(?:_LGKP|_LENGKAP|\s+LENGKAP|_WP|_PENYEDIA)?|PEMEGANG(?:_HAK|\s+HAK|HAK)?|SUBJEK)\s*[:=]\s*([A-Z\s.,]{3,50})',
                            content_up
                        )
                        is_cross_contamination = False
                        if owner_matches:
                            for om in owner_matches:
                                om_cleaned = context_rot_guard.clean_person_name(om).upper()
                                om_tokens = set(w for w in om_cleaned.split() if len(w) >= 3)
                                # If chunk has an explicit owner and shares NO significant token with the target person name
                                if om_tokens and not (target_tokens & om_tokens):
                                    is_cross_contamination = True
                                    break

                        # If chunk is from a person/land registry source and mentions other entities but has NO mention of target person
                        is_entity_registry = any(k in src_name_lower for k in ["dukcapil", "kependudukan", "bpn", "pertanahan", "pemilik", "orang"])
                        if is_entity_registry and not any(t in content_up for t in target_tokens):
                            is_cross_contamination = True

                        if is_cross_contamination:
                            logger.info(f"Anti-Rot Guard: Dropped cross-entity chunk from '{src_name_lower}' not matching target '{target_person_name}'")
                            continue
                        filtered_chunks.append(c)
                    retrieved_chunks = filtered_chunks
            except Exception as e:
                logger.warning(f"Vector retrieval warning in chat: {e}")

        # 2. Graph Retrieval from Neo4j
        graph_entities = []
        if include_graph:
            graph_entities = self.get_graph_entities(message, limit=8)

        # 3. Context Preparation
        context_parts = []
        MAX_TOTAL_CONTEXT_CHARS = 48000
        MAX_CHUNK_CHARS = 16000
        accumulated_chars = 0

        # Formatted sources for response with clean snippets
        clean_sources = []

        # 3.1 Uploaded Document Context Injection (User attached PDF/DOCX/Excel/CSV/Text)
        if uploaded_document:
            doc_fname = uploaded_document.get("file_name", "Dokumen Unggahan")
            doc_type = (uploaded_document.get("file_type") or "document").upper()
            doc_text = (uploaded_document.get("text_content") or uploaded_document.get("content") or "").strip()
            doc_meta = uploaded_document.get("metadata", {})

            doc_header_lines = [
                f"=== DOKUMEN YANG DIUNGGAH PENGGUNA ({doc_fname} [{doc_type}]) ==="
            ]
            if doc_meta.get("total_pages"):
                doc_header_lines.append(f"Total Halaman: {doc_meta['total_pages']}")
            if doc_meta.get("sheets"):
                doc_header_lines.append(f"Lembar Kerja (Sheets): {', '.join(doc_meta['sheets'])}")
            if doc_meta.get("total_rows"):
                doc_header_lines.append(f"Total Baris Data: {doc_meta['total_rows']}")
            doc_header_lines.append("Isi Konten Dokumen:")

            MAX_DOC_CHARS = 38000
            if len(doc_text) > MAX_DOC_CHARS:
                doc_body = doc_text[:MAX_DOC_CHARS] + f"\n\n... [Catatan: Dokumen sangat panjang, dipotong pada {MAX_DOC_CHARS} karakter pertama]"
            else:
                doc_body = doc_text

            doc_header_lines.append(doc_body)
            uploaded_doc_entry = "\n".join(doc_header_lines) + "\n"
            context_parts.append(uploaded_doc_entry)
            accumulated_chars += len(uploaded_doc_entry)

            # Prepend to clean_sources so UI can display it as a cited source
            clean_sources.append({
                "id": f"uploaded_{uploaded_document.get('doc_id', 'doc')}",
                "content": (doc_text[:1500] + "...") if len(doc_text) > 1500 else doc_text,
                "score": 1.0,
                "metadata": {
                    "source_name": f"📎 Dokumen Terunggah: {doc_fname}",
                    "file_name": doc_fname,
                    "file_type": doc_type,
                    "is_uploaded_document": True,
                    **doc_meta
                }
            })

        # 4. Face Recognition Scan (if image attached)
        face_result = None
        if image_base64:
            try:
                from services.face_service import face_service
                face_result = face_service.recognize_face(image_base64, min_confidence=0.45)
                if face_result.get("matched"):
                    person = face_result.get("person_name") or face_result.get("identified_person")
                    conf = face_result.get("confidence_percent")
                    pid = face_result.get("person_id")
                    dept = face_result.get("department")
                    context_parts.append(
                        f"=== BIOMETRIC FACE RECOGNITION SCAN RESULT ===\n"
                        f"Identified Person: {person} (ID: {pid})\n"
                        f"Match Confidence: {conf}%\n"
                        f"Department / Role: {dept or 'N/A'}\n"
                        f"Verification Status: POSITIVE BIOMETRIC IDENTIFICATION IN ENROLLED DATABASE\n"
                    )
                elif face_result.get("detection", {}).get("face_detected"):
                    context_parts.append(
                        f"=== BIOMETRIC FACE RECOGNITION SCAN RESULT ===\n"
                        f"Face Detected: Yes\n"
                        f"Identification Status: Unidentified (No matching identity above threshold in enrolled face database)\n"
                    )
            except Exception as fe:
                logger.warning(f"Error performing face recognition in chat: {fe}")

        # Inject liked few-shot examples for auto-tuning (user-approved responses)
        if liked_examples:
            context_parts.append("=== PREFERRED RESPONSE EXAMPLES (User-Approved Style) ===")
            for ex_idx, ex in enumerate(liked_examples[:3], start=1):
                context_parts.append(
                    f"[Example {ex_idx}]\n"
                    f"Question: {ex.get('question', '')}\n"
                    f"Preferred Answer: {ex.get('answer', '')}\n"
                )
            context_parts.append(
                "Use the above examples as a style guide: match their level of detail, "
                "language (Indonesian/English), and formatting when answering the current question."
            )

        # Inject negative feedback guidelines (lessons learned from user dislikes)
        if dislike_notes:
            context_parts.append("=== USER FEEDBACK & QUALITY CORRECTIONS (Avoid These Issues) ===")
            for n_idx, note in enumerate(dislike_notes[:4], start=1):
                context_parts.append(f"- Catatan Koreksi {n_idx}: {note}")
            context_parts.append(
                "PENTING: Perhatikan catatan koreksi di atas agar tidak mengulangi kesalahan yang sama "
                "(seperti menampilkan foto yang keliru, data tidak terverifikasi, atau foto orang lain)."
            )

        # Compile Field Definitions Glossary if retrieved chunks come from tabular/database/API sources
        if db and retrieved_chunks:
            try:
                from models.knowledge_source import KnowledgeSource
                chunk_source_ids = set()
                for c in retrieved_chunks:
                    sid = c.get("metadata", {}).get("source_id")
                    if sid is not None:
                        chunk_source_ids.add(sid)

                glossary_blocks = []
                if chunk_source_ids:
                    matched_sources = db.query(KnowledgeSource).filter(KnowledgeSource.id.in_(chunk_source_ids)).all()
                    for ms in matched_sources:
                        cfg = ms.config or {}
                        fdefs = cfg.get("field_definitions") or []
                        if isinstance(fdefs, list) and fdefs:
                            lines = [f"[{ms.name}]"]
                            for fd in fdefs[:18]:
                                fname = fd.get("name", "")
                                fdesc = fd.get("description", "")
                                fsample = fd.get("sample", "")
                                sample_hint = f" (Contoh: {fsample})" if fsample and len(str(fsample)) < 40 else ""
                                if fname and fdesc:
                                    lines.append(f"• {fname}: {fdesc}{sample_hint}")
                            if len(lines) > 1:
                                glossary_blocks.append("\n".join(lines))

                if glossary_blocks:
                    standard_codes = (
                        "[Pedoman Kode Standar Kependudukan & Pertanahan]:\n"
                        "• HUB_KEL: 1: Kepala Keluarga, 2: Suami, 3: Istri, 4: Anak, 5: Menantu, 6: Cucu, 7: Orang Tua, 8: Mertua, 9: Famili Lain, 10: Pembantu, 11: Lainnya\n"
                        "• STAT_KWN: 1: Belum Kawin, 2: Kawin, 3: Cerai Hidup, 4: Cerai Mati\n"
                        "• JENIS_KLMIN: 1: Laki-laki, 2: Perempuan\n"
                        "• AGAMA: 1: Islam, 2: Kristen, 3: Katholik, 4: Hindu, 5: Budha, 6: Konghucu, 7: Kepercayaan\n"
                        "• TIPE_HAK / jenishak: 1: Hak Milik (SHM), 2: Hak Guna Bangunan (HGB), 3: Hak Pakai (HP), 4: Hak Guna Usaha (HGU), 5: Hak Pengelolaan (HPL)"
                    )
                    glossary_text = (
                        "=== KAMUS DEFINISI KOLOM BASIS DATA (FIELD GLOSSARY) ===\n"
                        "Gunakan kamus arti kolom ini untuk membaca data terstruktur, singkatan, dan kode angka secara presisi tanpa berhalusinasi:\n"
                        + "\n\n".join(glossary_blocks) + "\n\n"
                        + standard_codes + "\n"
                    )
                    context_parts.append(glossary_text)
                    accumulated_chars += len(glossary_text)
            except Exception as fdef_err:
                logger.warning(f"Error compiling field definitions glossary: {fdef_err}")

        if retrieved_chunks:
            context_parts.append("=== RETRIEVED KNOWLEDGE BASE DOCUMENTS ===")

            stopwords = {
                "siapa", "siapakah", "apa", "apakah", "dimana", "kapan", "bagaimana",
                "mengapa", "kenapa", "dari", "pada", "yang", "untuk", "dengan", "adalah",
                "yaitu", "profil", "profile", "data", "cari", "temukan", "lihat", "tolong",
                "cek", "info", "informasi", "tentang", "orang", "nama", "nik", "nohp",
                "alamat", "nomor", "semua", "bisa", "mohon", "atau", "dan", "serta"
            }
            clean_msg = re.sub(r"[^\w\s]", " ", message)
            all_tokens = [w.strip() for w in clean_msg.split() if len(w.strip()) >= 3]
            sig_tokens = [w for w in all_tokens if w.lower() not in stopwords]

            centering_targets = []
            # Prioritize explicit numeric identifiers (KK or NIK)
            id_tokens = re.findall(r'\b\d{6,20}\b', message)
            for it in id_tokens:
                if it not in centering_targets:
                    centering_targets.append(it)

            # Prioritize extracted entity name
            name_m = re.search(r"(?:atas\s+nama|dengan\s+nama|bernama|nama|subjek|orang)\s+([a-zA-Z\s]{4,})", message, re.IGNORECASE)
            if name_m:
                extracted_name = " ".join([w for w in name_m.group(1).split() if w.lower() not in stopwords])
                if len(extracted_name) >= 3:
                    centering_targets.append(extracted_name.upper())

            # Prioritize significant words sorted by length (e.g. 'INDRADHI', 'MULYANTO' before 'TANAH')
            sig_tokens_sorted = sorted(sig_tokens, key=lambda x: len(x), reverse=True)
            for st in sig_tokens_sorted:
                if st.upper() not in centering_targets:
                    centering_targets.append(st.upper())
            for at in all_tokens:
                if at.upper() not in centering_targets:
                    centering_targets.append(at.upper())

            for idx, c in enumerate(retrieved_chunks, start=1):
                src_name = c.get("metadata", {}).get("source_name", "Knowledge Base")
                score = c.get("score", 0.0)
                raw_content = c.get("content", "").strip()

                # Mask giant base64 image strings in excerpt to preserve LLM context and prevent token budget exhaustion
                masked_content = re.sub(
                    r'(?:FOTO|photo|image|avatar|gambar)[\s:=]+(["\']?)(?:/9j/|data:image/[a-zA-Z0-9+.-]+;base64,)[A-Za-z0-9+/=]{60,}\1',
                    'FOTO: [TERSEDIA_TERVERIFIKASI]',
                    raw_content,
                    flags=re.IGNORECASE
                )
                masked_content = re.sub(
                    r'(/9j/[A-Za-z0-9+/=]{80,}|data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{80,})',
                    '[FOTO_BASE64_TERVERIFIKASI]',
                    masked_content
                )

                # Clean snippet for LLM context and preview with smart entity keyword centering
                chunk_excerpt = masked_content
                kw_pos = -1
                for w in centering_targets:
                    p = masked_content.upper().find(w.upper())
                    if p != -1:
                        kw_pos = p
                        break

                if kw_pos != -1 and (len(masked_content) > MAX_CHUNK_CHARS or kw_pos > 800):
                    # Center window around the entity/keyword occurrence, snapping to line/record boundary
                    start_pos = max(0, kw_pos - 150)
                    rec_break = masked_content.rfind("\n", max(0, start_pos - 200), start_pos + 1)
                    if rec_break != -1:
                        start_pos = rec_break + 1
                    end_pos = min(len(masked_content), start_pos + MAX_CHUNK_CHARS)

                    chunk_excerpt = ("... " if start_pos > 0 else "") + masked_content[start_pos:end_pos]
                    if end_pos < len(masked_content):
                        chunk_excerpt += "... [truncated for length]"
                elif len(masked_content) > MAX_CHUNK_CHARS:
                    end_pos = min(len(masked_content), MAX_CHUNK_CHARS)
                    chunk_excerpt = masked_content[:end_pos]
                    if end_pos < len(masked_content):
                        chunk_excerpt += "... [truncated for length]"

                v_tier = c.get("validity_tier", "secondary")
                v_score = c.get("validity_score", 65)
                tier_labels = {
                    "authoritative": "Tingkat 1 - Otoritatif Primer (Resmi)",
                    "verified": "Tingkat 2 - Terverifikasi Internal",
                    "secondary": "Tingkat 3 - Sekunder Publik",
                    "unverified": "Tingkat 4 - Pendukung / Mentah"
                }
                tier_label = tier_labels.get(v_tier, v_tier)

                chunk_entry = f"[Document {idx}] (Source: {src_name} | Tingkat Validitas: {tier_label} [{v_score}/100] | Match: {score}):\n{chunk_excerpt}\n"

                # Check budget
                if accumulated_chars + len(chunk_entry) <= MAX_TOTAL_CONTEXT_CHARS:
                    context_parts.append(chunk_entry)
                    accumulated_chars += len(chunk_entry)
                elif accumulated_chars < MAX_TOTAL_CONTEXT_CHARS:
                    remaining = MAX_TOTAL_CONTEXT_CHARS - accumulated_chars
                    if remaining > 200:
                        context_parts.append(chunk_entry[:remaining] + "... [context budget reached]\n")
                        accumulated_chars = MAX_TOTAL_CONTEXT_CHARS

                # Format clean source item for API response
                clean_sources.append({
                    "id": c.get("id"),
                    "content": chunk_excerpt[:1500] + ("..." if len(chunk_excerpt) > 1500 else ""),
                    "score": score,
                    "validity_tier": v_tier,
                    "validity_score": v_score,
                    "metadata": c.get("metadata", {})
                })

        if graph_entities:
            context_parts.append("=== KNOWLEDGE GRAPH ENTITIES & MULTI-HOP RELATIONSHIPS ===")
            for ent in graph_entities:
                direct_conns = ent.get("connections", [])
                multi_paths = ent.get("multi_hop_paths", [])

                conns_str = ", ".join(direct_conns) if direct_conns else "Tidak ada relasi langsung tercatat"
                desc_str = f" - Ket: {ent['description']}" if ent.get('description') else ""
                ent_lines = [
                    f"• Entitas: **{ent['name']}** [{ent.get('type', 'ENTITY')}]{desc_str}",
                    f"  - Relasi Langsung (1-Hop): {conns_str}"
                ]
                if multi_paths:
                    ent_lines.append(f"  - Jalur Hubungan Multi-Hop (2-Hop Network Traversal):")
                    for p in multi_paths[:4]:
                        ent_lines.append(f"    ↳ {p}")

                ent_block = "\n".join(ent_lines) + "\n"
                if accumulated_chars + len(ent_block) <= MAX_TOTAL_CONTEXT_CHARS + 4000:
                    context_parts.append(ent_block)
                    accumulated_chars += len(ent_block)

        context_str = "\n".join(context_parts) if context_parts else "No specific documents found in knowledge base."

        # 4. Resolve LLM Backend & Model
        api_base, api_key, model = llm_service.get_task_backend("general_qa", db)
        backend_name = "Assigned / Default Backend"

        if backend_id and db:
            from models.llm_backend import LLMBackend
            custom_be = db.query(LLMBackend).filter(LLMBackend.id == backend_id).first()
            if custom_be:
                api_base = custom_be.api_base
                api_key = custom_be.api_key or "EMPTY"
                backend_name = custom_be.name
                if not model_name:
                    model = custom_be.available_models[0] if (custom_be.available_models and len(custom_be.available_models) > 0) else model
        elif db:
            from models.llm_backend import ModelAssignment
            assign = db.query(ModelAssignment).filter(ModelAssignment.task == "general_qa").first()
            if assign and assign.backend:
                backend_name = assign.backend.name

        if model_name:
            model = model_name

        # 5. Discover Active API Tools (if db session available)
        tools = []
        tool_dispatch_map = {}
        tool_raw_name_map = {}
        if db:
            try:
                from models.knowledge_source import KnowledgeSource
                all_tool_sources = db.query(KnowledgeSource).filter(
                    KnowledgeSource.source_type.in_(["api", "database", "mcp", "mcp_server"]),
                    KnowledgeSource.is_active == True
                ).all()

                active_tool_sources = []
                if active_source_ids:
                    # Check if user explicitly selected any tool source(s)
                    explicit_tool_ids = set()
                    for s in all_tool_sources:
                        if s.id in active_source_ids:
                            cfg = s.config or {}
                            if cfg.get("is_tool") or cfg.get("parameters") or s.source_type in ["mcp", "mcp_server"]:
                                explicit_tool_ids.add(s.id)

                    if explicit_tool_ids:
                        # User specifically selected tool sources -> use those
                        active_tool_sources = [s for s in all_tool_sources if s.id in explicit_tool_ids]
                    else:
                        # User selected vector/document sources (e.g. Source 7)
                        # Automatically link companion tools that query the same database/collection or target
                        selected_sources_for_companion = db.query(KnowledgeSource).filter(
                            KnowledgeSource.id.in_(active_source_ids)
                        ).all()

                        companion_tool_ids = set()
                        for sel_s in selected_sources_for_companion:
                            s_cfg = sel_s.config or {}
                            s_db = str(s_cfg.get("database") or s_cfg.get("database_id") or "").lower()
                            s_coll = str(s_cfg.get("collection") or s_cfg.get("collection_name") or s_cfg.get("table_name") or "").lower()
                            s_words = set(re.findall(r"\w+", sel_s.name.lower()))

                            for t_s in all_tool_sources:
                                t_cfg = t_s.config or {}
                                if not (t_cfg.get("is_tool") or t_cfg.get("parameters") or t_s.source_type in ["mcp", "mcp_server"]):
                                    continue
                                t_db = str(t_cfg.get("database") or t_cfg.get("database_id") or "").lower()
                                t_coll = str(t_cfg.get("collection") or t_cfg.get("collection_name") or t_cfg.get("table_name") or "").lower()
                                t_words = set(re.findall(r"\w+", t_s.name.lower()))

                                # Match by collection or table name
                                if s_coll and t_coll and s_coll == t_coll:
                                    companion_tool_ids.add(t_s.id)
                                # Match by database and overlapping words
                                elif s_db and t_db and s_db == t_db and (s_words & t_words):
                                    companion_tool_ids.add(t_s.id)
                                # Match by key domain keywords
                                elif ("dukcapil" in s_words and "dukcapil" in t_words) or ("bpn" in s_words and "bpn" in t_words):
                                    companion_tool_ids.add(t_s.id)

                        if companion_tool_ids:
                            active_tool_sources = [s for s in all_tool_sources if s.id in companion_tool_ids]
                        else:
                            # Keep all active query tools available so live searching is not unexpectedly disabled
                            active_tool_sources = [s for s in all_tool_sources if (s.config or {}).get("is_tool") or (s.config or {}).get("parameters") or s.source_type in ["mcp", "mcp_server"]]
                else:
                    active_tool_sources = [s for s in all_tool_sources if (s.config or {}).get("is_tool") or (s.config or {}).get("parameters") or s.source_type in ["mcp", "mcp_server"]]

                for s in active_tool_sources:
                    cfg = s.config or {}
                    if s.source_type in ["mcp", "mcp_server"]:
                        mcp_tools = cfg.get("tools") or []
                        prefix = f"mcp_{s.name.replace(' ', '_').lower()}_"
                        for t in mcp_tools:
                            if not t.get("enabled", True):
                                continue
                            raw_name = t.get("name", "tool")
                            clean_name = "".join(c if c.isalnum() or c == "_" else "_" for c in f"{prefix}{raw_name}").lower()

                            properties = {}
                            required_params = []
                            if t.get("input_schema") and isinstance(t["input_schema"], dict):
                                properties = t["input_schema"].get("properties", {})
                                required_params = t["input_schema"].get("required", [])
                            elif t.get("parameters"):
                                for p in t.get("parameters", []):
                                    p_name = p.get("name")
                                    if not p_name:
                                        continue
                                    p_type = (p.get("type") or "string").lower()
                                    if p_type in ["int", "integer"]:
                                        p_type = "integer"
                                    elif p_type in ["float", "number"]:
                                        p_type = "number"
                                    elif p_type in ["bool", "boolean"]:
                                        p_type = "boolean"
                                    else:
                                        p_type = "string"
                                    properties[p_name] = {
                                        "type": p_type,
                                        "description": p.get("description") or f"Parameter {p_name}"
                                    }
                                    if p.get("required"):
                                        required_params.append(p_name)

                            tool_desc = t.get("description") or f"Remote MCP tool '{raw_name}' dari {s.name}"
                            tools.append({
                                "type": "function",
                                "function": {
                                    "name": clean_name,
                                    "description": tool_desc,
                                    "parameters": {
                                        "type": "object",
                                        "properties": properties,
                                        "required": required_params
                                    }
                                }
                            })
                            tool_dispatch_map[clean_name] = s
                            tool_raw_name_map[clean_name] = raw_name

                    elif cfg.get("is_tool") or cfg.get("parameters"):
                        prefix = "db_" if s.source_type == "database" else "api_"
                        raw_name = cfg.get("tool_name") or f"{prefix}{s.name.replace(' ', '_').lower()}"
                        clean_name = "".join(c if c.isalnum() or c == "_" else "_" for c in raw_name).lower()
                        
                        properties = {}
                        required_params = []
                        for p in cfg.get("parameters", []):
                            p_name = p.get("name")
                            if not p_name:
                                continue
                            p_type = (p.get("type") or "string").lower()
                            if p_type in ["int", "integer"]:
                                p_type = "integer"
                            elif p_type in ["float", "number"]:
                                p_type = "number"
                            elif p_type in ["bool", "boolean"]:
                                p_type = "boolean"
                            else:
                                p_type = "string"

                            properties[p_name] = {
                                "type": p_type,
                                "description": p.get("description") or f"Parameter {p_name}"
                            }
                            if p.get("required"):
                                required_params.append(p_name)

                        default_desc = f"Execute live database query against {s.name}" if s.source_type == "database" else f"Fetch live data from {s.name} API"
                        tool_desc = cfg.get("tool_description") or s.description or default_desc

                        # Append field definitions dictionary so LLM understands return schema before execution
                        field_defs = cfg.get("field_definitions", [])
                        if field_defs and isinstance(field_defs, list) and len(field_defs) > 0:
                            glossary_lines = ["\n\nKamus Definisi Field Balikan (Field Definitions):"]
                            for fd in field_defs:
                                fname = fd.get("name")
                                if fname:
                                    fdesc = fd.get("description") or fd.get("type") or "Definisi field"
                                    fsample = f" (contoh: {fd.get('sample')})" if fd.get("sample") else ""
                                    glossary_lines.append(f"- {fname}: {fdesc}{fsample}")
                            tool_desc += "\n".join(glossary_lines)

                        tools.append({
                            "type": "function",
                            "function": {
                                "name": clean_name,
                                "description": tool_desc,
                                "parameters": {
                                    "type": "object",
                                    "properties": properties,
                                    "required": required_params
                                }
                            }
                        })
                        tool_dispatch_map[clean_name] = s
                        tool_raw_name_map[clean_name] = raw_name
            except Exception as tool_disc_err:
                logger.warning(f"Error discovering dynamic tools for chat: {tool_disc_err}")

        # Detect if this is a reasoning model (o1/o3 family)
        is_reasoning_model = bool(model and any(model.lower().startswith(p) for p in [
            "o1", "o3", "openai/o1", "openai/o3"
        ]))

        # Resolve effective temperature (0.0 for strict mode to guarantee zero-hallucination greedy decoding)
        if temperature is not None:
            effective_temperature = max(0.0, min(2.0, float(temperature)))
        else:
            effective_temperature = 0.0 if strict_mode else 0.3

        # Reasoning models do not support temperature
        if is_reasoning_model:
            effective_temperature = None

        # 6. Build LLM Prompt with Configured MCP Personality & Matched Flow Memory
        matched_flow_res = None
        if db:
            try:
                from services.flow_orchestrator import flow_orchestrator
                matched_flow_res = flow_orchestrator.match_flow_for_prompt(message, db)
            except Exception as fe_err:
                logger.warning(f"Notice matching prompt flow in chat: {fe_err}")

        system_instruction = personality_service.build_system_instruction(
            db=db,
            is_indonesian=True,
            tools=tools,
            tool_dispatch_map=tool_dispatch_map,
            is_single_tool_selected=is_single_tool_selected,
            single_selected_tool_name=single_selected_tool_name,
            selected_tool_names=selected_tool_names,
            uploaded_document=uploaded_document,
            strict_mode=strict_mode,
            active_personality_override=active_personality_override
        )

        # Inject Active Remembered Retrieval Flow if matched
        if matched_flow_res and matched_flow_res.get("matched") and matched_flow_res.get("flow"):
            m_flow = matched_flow_res["flow"]
            steps_list = m_flow.get("steps", [])
            steps_desc_lines = []
            tools_to_recommend = []

            for i, s in enumerate(steps_list):
                raw_target = s.get("target", "")
                resolved_target = raw_target
                if db:
                    try:
                        from services.flow_orchestrator import flow_orchestrator
                        resolved_target = flow_orchestrator.resolve_tool_target(raw_target)
                    except Exception:
                        pass

                action_type = s.get("action_type", "")
                tool_clause = ""
                if action_type == "tool_call" and resolved_target:
                    tool_clause = f" -> PANGGIL TOOL: `{resolved_target}`"
                    if resolved_target not in tools_to_recommend:
                        tools_to_recommend.append(resolved_target)
                elif action_type == "graph_query":
                    tool_clause = " -> TELUSURI KNOWLEDGE GRAPH"
                elif action_type == "vector_search":
                    tool_clause = " -> RETRIEVAL VECTOR BASE"

                step_order = s.get("step_order", i + 1)
                title = s.get("title", "")
                desc = s.get("description", "")
                steps_desc_lines.append(f"   Langkah {step_order}: {title} [{action_type}{tool_clause}] - {desc}")

            steps_desc = "\n".join(steps_desc_lines)
            rec_tools_desc = f"- Rekomendasi Tool Utama: {', '.join([f'`{t}`' for t in tools_to_recommend])}\n" if tools_to_recommend else ""

            system_instruction += (
                f"\n\n🎯 ALUR RETRIEVAL ACUAN AKTIF (REMEMBERED ORCHESTRATION FLOW):\n"
                f"Pertanyaan pengguna teridentifikasi memiliki alur retrieval baku: '{m_flow.get('name')}' (Kesesuaian: {int(matched_flow_res.get('confidence', 0.8)*100)}%).\n"
                f"Sistem WAJIB mengikuti tahapan pengumpulan informasi berikut secara terstruktur:\n"
                f"{steps_desc}\n"
                f"Aturan Validitas Alur: {m_flow.get('validity_priority_rule', 'PRIORITIZE_HIGHEST_VALIDITY')} (Data dari sumber Otoritatif Tingkat 1 WAJIB dimenangkan dan ditampilkan sebagai kebenaran utama).\n"
                f"PANDUAN EKSEKUSI ORCHESTRATOR:\n"
                f"{rec_tools_desc}"
                f"- Panggil tool yang dipetakan di atas secara presisi bila data primer belum lengkap di dokumen konteks.\n"
                f"- Jangan mengarang data identitas, nomor sertifikat, nomor tender, atau kepemilikan aset tanpa verifikasi tool.\n"
            )

        if face_result:
            if face_result.get("matched"):
                person = face_result.get("identified_person")
                conf = face_result.get("confidence_percent")
                pid = face_result.get("person_id")
                dept = face_result.get("department")
                system_instruction += (
                    f"\n\nHASIL PENGENALAN WAJAH BIOMETRIK:\n"
                    f"Gambar terlampir telah dipindai biometrik. "
                    f"Hasil: IDENTIFIKASI POSITIF -> Orang: **{person}** (ID: {pid or 'N/A'}, Departemen: {dept or 'N/A'}) dengan tingkat keyakinan **{conf}%**.\n"
                    f"Jawab pengguna dengan mengonfirmasi identitas wajah yang terverifikasi ini."
                )
            elif face_result.get("detection", {}).get("face_detected"):
                system_instruction += (
                    "\n\nHASIL PENGENALAN WAJAH BIOMETRIK:\n"
                    "Wajah terdeteksi pada gambar, namun tidak cocok dengan data profil wajah terdaftar dalam basis pengetahuan. "
                    "Sampaikan secara santun bahwa wajah terdeteksi tetapi belum terdaftar dalam basis data."
                )

        has_real_context = bool(retrieved_chunks or graph_entities or face_result or uploaded_document)

        if tools:
            prompt_content = f"""Context Information from Knowledge Base:
\"\"\"
{context_str}
\"\"\"

User Question: {message}

Instructions:
- PRIORITAS UTAMA SUMBER DATA: Data yang didapat langsung dari eksekusi Tool (query langsung ke database / live API) adalah SUMBER KEBENARAN UTAMA (Ground Truth). Jawaban Anda WAJIB memprioritaskan dan menampilkan data hasil query database langsung ini kepada pengguna di atas data dokumen atau perkiraan apapun.
- If the user question is asking to profile, find, or look up a specific person, NIK, or citizen record (e.g. 'siapa ...', 'profil ...', 'cari ...'), you MUST call the corresponding search/profiling tool first to fetch their verified official record and photo directly from the database.
- If the question can be answered or queried using one of the available tools, call the tool first.
- Only formulate a direct answer from the context above if none of the tools are applicable.
- STRICT ANTI-HALLUCINATION: If neither the tools nor the context contain the requested data, state clearly: "Data tidak ditemukan dalam basis data atau dokumen yang tersedia." DO NOT invent, fabricate, or guess any details.
- INTEGRITAS KESIMPULAN & DISAMBIGUASI NAMA (ANTI-CONFLATION): Jika hasil pencarian basis data resmi memuat beberapa individu berbeda dengan nama serupa (memiliki NIK/TTL/Alamat berbeda), pisahkan rincian aset secara tegas per NIK. DILARANG KERAS menyimpulkan bahwa semua aset tersebut milik satu orang yang sama.
- ZERO-SPECULATION IN CONCLUSIONS: Pada bagian simpulan atau ringkasan, hanya sampaikan fakta yang tertera dalam data resmi (nomor sertifikat, NIK, luas m2, wilayah). DILARANG menambahkan dugaan spekulatif yang tidak berdasar.
- ANTI-CONTENT-ROT: Dilarang mengaitkan atau memasukkan kembali data/aset milik orang lain dari sesi percakapan sebelumnya ke dalam simpulan subjek saat ini.
- When tool results or context contain photos, render the photo in Markdown image tag `![Foto Profil - NAMA_LENGKAP](foto_resmi)` ONLY IF the photo strictly belongs to the specific person or entity being profiled (matching NIK or Full Name). The system backend will automatically replace (foto_resmi) with the verified image. NEVER output raw base64 strings manually in the answer.
- FOLLOW-UP QUESTIONS: At the very end of your response, you MUST provide 3 smart, context-aware follow-up questions that the user might want to ask next based strictly on the CURRENT topic of conversation and the user's latest query. DILARANG KERAS mengambil atau menebak pertanyaan lanjutan dari isi data bank yang tidak terkait langsung dengan percakapan saat ini. Output them as a JSON array of strings wrapped in a <suggestions> tag. Example: <suggestions>["Question 1", "Question 2", "Question 3"]</suggestions>"""
        else:
            if not has_real_context and strict_mode:
                prompt_content = f"""Context Information from Knowledge Base:
\"\"\"
[PERHATIAN: Tidak ada dokumen atau entitas yang cocok ditemukan dalam basis data untuk pertanyaan ini.]
\"\"\"

User Question: {message}

Instruksi Anti-Halusinasi (Wajib):
Konteks basis data di atas kosong / tidak ditemukan dokumen yang relevan dengan pertanyaan.
Jika pertanyaan memerlukan data resmi, profil orang, NIK, data internal, atau aset, Anda HARUS MENYATAKAN SECARA JUJUR bahwa data tersebut TIDAK DITEMUKAN dalam basis data atau dokumen yang tersedia.
DILARANG KERAS mengarang nama, NIK, tanggal lahir, alamat, atau fakta fiktif."""
            else:
                prompt_content = f"""Context Information:
\"\"\"
{context_str}
\"\"\"

User Question: {message}

Instruksi Kepatuhan Faktual:
Berikan jawaban terstruktur, akurat, dan jelas murni berdasarkan konteks di atas.
Patuhi aturan:
1. Hanya sampaikan informasi yang tertulis di dalam konteks di atas.
2. Jangan pernah menebak, mengasumsikan, atau menambahkan rincian yang tidak ada dalam konteks.
3. Sebutkan sumber dokumen pendukung jika relevan.
4. PENCARIAN KARTU KELUARGA (KK): Jika pertanyaan menyangkut Kartu Keluarga (KK) atau Nomor KK, Anda WAJIB menampilkan SELURUH anggota keluarga yang terdaftar dalam KK tersebut (Kepala Keluarga, Istri/Pasangan, dan Anak/Famili Lain) secara berurutan dan lengkap (1, 2, 3, dst.). DILARANG BERHENTI setelah hanya menampilkan Kepala Keluarga jika konteks memuat anggota keluarga lainnya.
5. FOTO PROFIL: Untuk setiap orang/anggota keluarga yang memiliki foto dalam basis data, sertakan tag Markdown: `![Foto Profil - NAMA_LENGKAP](foto_resmi)`. DILARANG KERAS menyalin atau menuliskan kode base64 mentah dalam teks jawaban.
6. INTEGRITAS KESIMPULAN (ANTI-CONTENT-ROT): Bagian kesimpulan/ringkasan wajib murni 100% dari data yang terverifikasi. Dilarang mengarang asumsi atau spekulasi.
7. DISAMBIGUASI NAMA (ANTI-CONFLATION): Jika terdapat banyak entitas dengan nama sama namun NIK/TTL/Alamat berbeda, pisahkan secara tegas dan jangan menyimpulkan aset mereka sebagai satu orang.
8. ISOLASI KONTEN RIWAYAT: Jangan pernah membawa masuk data subjek percakapan sebelumnya ke dalam jawaban subjek saat ini.
9. FOLLOW-UP QUESTIONS: Di akhir jawaban, berikan 3 pertanyaan lanjutan yang SANGAT RELEVAN HANYA dengan topik yang dibicarakan saat ini. DILARANG KERAS menyarankan pertanyaan dari data bank yang tidak berkaitan dengan konteks saat ini. Format sebagai JSON array berisi string di dalam tag <suggestions>. Contoh: <suggestions>["Q1", "Q2", "Q3"]</suggestions>"""

        # ── ANTI-CONTEXT-ROT GUARD (Poisoning, Distraction, Confusion Prevention) ──
        sanitized_history, rot_metrics = context_rot_guard.sanitize_and_compact_history(
            current_message=message,
            raw_history=history,
            valid_tools=tools,
            tool_dispatch_map=tool_dispatch_map
        )
        # Append anti-rot directive to system instruction
        system_instruction += context_rot_guard.get_anti_rot_system_directive(
            is_task_shift=rot_metrics.get("task_shift_detected", False),
            shift_reason=rot_metrics.get("shift_reason", "")
        )

        # Prepare messages
        messages = [{"role": "system", "content": system_instruction}]
        
        # Add sanitized & compacted conversational history (Anti-Rot Protected)
        for h in sanitized_history:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": prompt_content})

        # 7. Execute LLM Completion (with dynamic Tool Calling support)
        import uuid as _uuid
        chat_id = f"chatcmpl-{_uuid.uuid4().hex[:24]}"
        executed_tools_info = []
        is_cloud = any(domain in (api_base or "").lower() for domain in [
            "openrouter.ai", "api.openai.com", "api.deepseek.com",
            "groq.com", "googleapis.com", "anthropic.com",
            "mistral.ai", "together.xyz", "cohere.com"
        ])
        is_local_vllm = not is_cloud and ("172.16." in (api_base or "") or "vllm" in (api_base or "").lower() or "qwen" in (model or "").lower())
        cloud_llm_timeout = float(os.getenv("CLOUD_LLM_TIMEOUT", "60.0"))
        local_llm_timeout = float(os.getenv("LOCAL_LLM_TIMEOUT", "600.0"))
        active_llm_timeout = cloud_llm_timeout if is_cloud else local_llm_timeout
        client = llm_service.get_client(api_base, api_key, timeout=active_llm_timeout)
        thinking_process = None
        try:
            # ── Build kwargs compliant with OpenAI Chat Completions API ──────────
            kwargs = {
                "model": model,
                "messages": messages,
            }
            # Reasoning models (o1/o3): use max_completion_tokens, omit temperature
            if is_reasoning_model:
                _max_c = max_completion_tokens or max_tokens or 4500
                kwargs["max_completion_tokens"] = _max_c
                if reasoning_effort:
                    kwargs["reasoning_effort"] = reasoning_effort
            else:
                if effective_temperature is not None:
                    kwargs["temperature"] = effective_temperature
                kwargs["max_tokens"] = max_tokens or 4500
                if top_p is not None:
                    kwargs["top_p"] = top_p
                if presence_penalty is not None:
                    kwargs["presence_penalty"] = presence_penalty
                if frequency_penalty is not None:
                    kwargs["frequency_penalty"] = frequency_penalty
            # Common optional params
            if seed is not None:
                kwargs["seed"] = seed
            if stop is not None:
                kwargs["stop"] = stop
            if logprobs is not None:
                kwargs["logprobs"] = logprobs
                if top_logprobs is not None and logprobs:
                    kwargs["top_logprobs"] = top_logprobs
            if user:
                kwargs["user"] = user
            if n and n > 1:
                kwargs["n"] = n
            # Structured output (response_format)
            if response_format and isinstance(response_format, dict):
                fmt_type = response_format.get("type", "text")
                if fmt_type in ("json_object", "json_schema"):
                    kwargs["response_format"] = response_format
            if tools:
                kwargs["tools"] = tools
                available_names = set(tool_dispatch_map.keys())
                is_land_search = bool(re.search(r'\b(?:tanah|sertifikat|bpn|bidang|hak\s+milik|hgb|shm)\b', message, re.IGNORECASE))
                is_company_search = bool(re.search(r'\b(?:pt|perusahaan|usaha|sikap|penyedia|vendor|cv)\b', message, re.IGNORECASE))
                is_person_search = bool(re.search(r'\b(?:orang|nik|kependudukan|ktp|kk|penduduk|nama|profil|profiling|siapa)\b', message, re.IGNORECASE) or (re.search(r'\bcari\b', message, re.IGNORECASE) and not is_land_search and not is_company_search))

                if is_single_tool_selected and single_selected_tool_name:
                    kwargs["tool_choice"] = {"type": "function", "function": {"name": single_selected_tool_name}}
                elif is_land_search and "cari_tanah_bpn" in available_names:
                    kwargs["tool_choice"] = {"type": "function", "function": {"name": "cari_tanah_bpn"}}
                elif is_company_search and "db_sikap_pemilik_usaha" in available_names:
                    kwargs["tool_choice"] = {"type": "function", "function": {"name": "db_sikap_pemilik_usaha"}}
                elif is_person_search and "data_orang_dukcapil" in available_names:
                    kwargs["tool_choice"] = {"type": "function", "function": {"name": "data_orang_dukcapil"}}
                else:
                    kwargs["tool_choice"] = "auto"

            try:
                if is_local_vllm:
                    response = client.chat.completions.create(
                        **kwargs,
                        extra_body={"chat_template_kwargs": {"enable_thinking": False}}
                    )
                else:
                    response = client.chat.completions.create(**kwargs)
            except Exception as be_err:
                logger.info(f"Primary completion attempt error ({be_err}), trying fallback parameters")
                try:
                    response = client.chat.completions.create(**kwargs)
                except Exception as tool_err:
                    err_s = str(tool_err).lower()
                    if tools and ("tool" in err_s or "function" in err_s):
                        logger.warning(f"Backend doesn't support tools parameter, falling back without tools: {tool_err}")
                        kwargs.pop("tools", None)
                        kwargs.pop("tool_choice", None)
                        response = client.chat.completions.create(**kwargs)
                    elif "max_tokens" in err_s or "temperature" in err_s:
                        logger.info(f"Adjusting parameters for model compatibility: {tool_err}")
                        kwargs.pop("temperature", None)
                        if "max_tokens" in kwargs:
                            kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
                        response = client.chat.completions.create(**kwargs)
                    else:
                        raise tool_err

            msg = response.choices[0].message
            tool_calls = getattr(msg, "tool_calls", None) or []

            # --- Fallback parser for raw XML <tool_call> output (Qwen/vLLM compat) ---
            if msg.content and "<tool_call>" in msg.content:
                if not tool_calls:
                    class DummyFunction:
                        def __init__(self, name, arguments):
                            self.name = name
                            self.arguments = arguments
                    class DummyToolCall:
                        def __init__(self, fn_name, fn_args):
                            self.id = f"call_{uuid.uuid4().hex[:12]}"
                            self.type = "function"
                            self.function = DummyFunction(fn_name, fn_args)
                    
                    # Extract all <tool_call> blocks
                    tc_blocks = re.findall(r'<tool_call>([\s\S]*?)</tool_call>', msg.content, re.IGNORECASE)
                    for tc_block in tc_blocks:
                        fn_match = re.search(r'<function=([^>]+)>', tc_block, re.IGNORECASE)
                        if fn_match:
                            fn_name = fn_match.group(1).strip()
                            fn_args = {}
                            # Extract parameters
                            param_matches = re.findall(r'<parameter=([^>]+)>([\s\S]*?)</parameter>', tc_block, re.IGNORECASE)
                            for p_name, p_value in param_matches:
                                fn_args[p_name.strip()] = p_value.strip()
                            
                            tool_calls.append(DummyToolCall(fn_name, json.dumps(fn_args)))
                
                # Remove the raw tool_call blocks from the display text so it doesn't look ugly
                msg.content = re.sub(r'<tool_call>[\s\S]*?(?:</tool_call>|$)', '', msg.content, flags=re.IGNORECASE).strip()


            # Process LLM tool calls if requested
            if tool_calls:
                from services.ingestion.api_ingester import api_ingester
                # Append assistant's tool_calls message manually to avoid Pydantic serialization/schema errors
                msg_dict = {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": getattr(tc, "id", f"call_{uuid.uuid4().hex[:12]}"),
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        } for tc in tool_calls
                    ]
                }
                messages.append(msg_dict)

                for tc in tool_calls:
                    fn_name = tc.function.name
                    fn_args_raw = tc.function.arguments or "{}"
                    try:
                        fn_args = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else fn_args_raw
                    except Exception:
                        fn_args = {}

                    # Sanitize entity/person names in tool arguments (strip academic titles, quotes, etc.)
                    if isinstance(fn_args, dict):
                        for k in ["nama", "name", "pemilik", "subject", "query"]:
                            if k in fn_args and isinstance(fn_args[k], str):
                                fn_args[k] = context_rot_guard.clean_person_name(fn_args[k])

                    logger.info(f"AI requested tool call: {fn_name} with arguments: {fn_args}")
                    if stream_callback:
                        stream_callback(f"🔍 Executing (tools/call: {fn_name})...\n")
                    matched_source = tool_dispatch_map.get(fn_name)
                    if matched_source:
                        source_cfg = matched_source.config or {}
                        ttl_minutes = matched_source.cache_ttl_minutes  # None = no cache

                        # ── Cache lookup ────────────────────────────────────
                        cache_hit = False
                        exec_res = None
                        if ttl_minutes and ttl_minutes > 0:
                            from services.ingestion.bank_data_saver import (
                                get_cached_tool_result, save_tool_cache_entry, refresh_cache_async
                            )
                            cached_data, is_stale = get_cached_tool_result(
                                matched_source.id, fn_args, ttl_minutes
                            )
                            if cached_data is not None:
                                cache_hit = True
                                exec_res = {
                                    "success": True,
                                    "data": cached_data,
                                    "text": json.dumps(cached_data, ensure_ascii=False)[:10000],
                                    "latency_ms": 0,
                                    "from_cache": True,
                                    "cache_stale": is_stale
                                }
                                if is_stale:
                                    # Serve stale data now; refresh in background
                                    if matched_source.source_type == "database":
                                        from services.ingestion.database_ingester import database_ingester
                                        refresh_cache_async(
                                            matched_source, fn_args,
                                            lambda: database_ingester.execute_tool_call_sync(source_cfg, fn_args),
                                            db
                                        )
                                    elif matched_source.source_type in ["mcp", "mcp_server"]:
                                        from services.ingestion.mcp_ingester import mcp_ingester
                                        target_tname = tool_raw_name_map.get(fn_name) or fn_name
                                        refresh_cache_async(
                                            matched_source, fn_args,
                                            lambda: mcp_ingester.execute_tool_call_sync(source_cfg, target_tname, fn_args),
                                            db
                                        )
                                    else:
                                        refresh_cache_async(
                                            matched_source, fn_args,
                                            lambda: api_ingester.execute_tool_call_sync(source_cfg, fn_args),
                                            db
                                        )

                        # ── Live call (cache miss or caching disabled) ──────
                        if not cache_hit:
                            if matched_source.source_type == "database":
                                from services.ingestion.database_ingester import database_ingester
                                exec_res = database_ingester.execute_tool_call_sync(source_cfg, fn_args)
                                target_url = f"{source_cfg.get('db_type', 'db').upper()}://{source_cfg.get('database', '')}"
                            elif matched_source.source_type in ["mcp", "mcp_server"]:
                                from services.ingestion.mcp_ingester import mcp_ingester
                                target_tname = tool_raw_name_map.get(fn_name) or fn_name
                                exec_res = mcp_ingester.execute_tool_call_sync(source_cfg, target_tname, fn_args)
                                target_url = source_cfg.get("endpoint") or source_cfg.get("url") or "mcp://server"
                            else:
                                exec_res = api_ingester.execute_tool_call_sync(source_cfg, fn_args)
                                target_url = exec_res.get("endpoint") or exec_res.get("url")

                        if cache_hit:
                            target_url = f"[CACHE] {matched_source.name}"

                        success = exec_res.get("success", False)
                        payload_data = exec_res.get("data") if exec_res.get("data") is not None else exec_res.get("text", exec_res)

                        # Deduplicate list records if duplicate entries exist (e.g. from SQL joins or repeated pagination)
                        if isinstance(payload_data, list) and len(payload_data) > 0 and isinstance(payload_data[0], dict):
                            seen_keys = set()
                            deduped_records = []
                            for r in payload_data:
                                dedup_key = r.get("NIK") or r.get("nik") or r.get("id") or r.get("_id") or json.dumps(r, sort_keys=True, default=str)
                                if dedup_key not in seen_keys:
                                    seen_keys.add(dedup_key)
                                    deduped_records.append(r)
                            payload_data = deduped_records

                        # Check if tool execution was unsuccessful, timed out, returned an error, or found 0 records
                        is_empty_or_failed = False
                        if not success:
                            is_empty_or_failed = True
                        elif payload_data is None:
                            is_empty_or_failed = True
                        elif isinstance(payload_data, list) and len(payload_data) == 0:
                            is_empty_or_failed = True
                        elif isinstance(payload_data, dict):
                            msg_val = str(payload_data.get("message", "")).lower()
                            status_val = str(payload_data.get("status", "")).lower()
                            err_val = str(payload_data.get("error", "")).lower()
                            if "execution failed" in msg_val or "tidak ditemukan" in msg_val or "not found" in msg_val or status_val in ["error", "fail", "failed", "not_found"] or (err_val and err_val not in ["none", "false", "0"]):
                                is_empty_or_failed = True
                            elif not (set(payload_data.keys()) - {'message', 'status', 'error', 'code', 'respon_code', 'success'} or 'combinedResults' in payload_data or 'data' in payload_data):
                                is_empty_or_failed = True

                        # ── Persist result (bank data + cache entry) ONLY IF VALID & NON-EMPTY ────────
                        if success and not cache_hit and not is_empty_or_failed:
                            try:
                                rec_data = exec_res.get("data")
                                if rec_data:
                                    from services.ingestion.bank_data_saver import (
                                        save_tool_records_to_bank_data, save_tool_cache_entry
                                    )
                                    if rec_data and (isinstance(rec_data, list) or isinstance(rec_data, dict)):
                                        save_tool_records_to_bank_data(matched_source, fn_args, rec_data, db)
                                    if ttl_minutes and ttl_minutes > 0:
                                        save_tool_cache_entry(matched_source, fn_args, rec_data, db)
                            except Exception as cache_err:
                                logger.warning(f"Notice saving tool bank data in chat: {cache_err}")

                        if is_empty_or_failed:
                            target_arg_str = ", ".join(f"{k}='{v}'" for k, v in fn_args.items()) if fn_args else "parameter terkait"
                            tool_output_str = json.dumps({
                                "status": "not_found",
                                "tool_name": fn_name,
                                "source_name": matched_source.name,
                                "source_type": matched_source.source_type,
                                "fetch_mode": "LIVE_DIRECT_DATABASE_QUERY",
                                "total_records_found": 0,
                                "message": (
                                    f"Query tool '{fn_name}' telah dijalankan langsung ke basis data sumber resmi dengan parameter ({target_arg_str}) "
                                    f"dan TIDAK MENEMUKAN data/record yang cocok (0 record ditemukan). "
                                    f"INSTRUKSI MUTLAK (ANTI-HALUSINASI & ISOLASI SUBJEK): "
                                    f"1. Sampaikan secara tegas, jelas, dan transparan kepada pengguna bahwa TIDAK DITEMUKAN data/sertifikat/aset untuk subjek ini pada basis data resmi {matched_source.name}. "
                                    f"2. DILARANG KERAS MENGARANG data, nomor sertifikat, atau properti fiktif! "
                                    f"3. DILARANG MENGAMBIL atau MENYEBUTKAN data milik orang lain/subjek percakapan sebelumnya dari riwayat konteks!"
                                ),
                                "records": []
                            }, ensure_ascii=False)
                        else:
                            # Deliver with explicit Ground Truth Priority metadata, Validity Tier, and Field Definitions
                            field_defs = (matched_source.config or {}).get("field_definitions", [])
                            v_tier = (matched_source.config or {}).get("validity_tier", "authoritative")
                            v_score = (matched_source.config or {}).get("validity_score", 95)
                            rec_count = len(payload_data) if isinstance(payload_data, list) else 1
                            records_for_prompt = payload_data
                            records_summary_note = None
                            if isinstance(payload_data, list) and rec_count > 15:
                                records_for_prompt, records_summary_note, count_saved = context_rot_guard.compact_tool_records(payload_data, max_records=15)
                                rot_metrics["tool_records_compacted"] = rot_metrics.get("tool_records_compacted", 0) + count_saved

                            completeness_instruction = (
                                f"PERHATIAN SANGAT PENTING: Ditemukan {rec_count} record/individu unik dalam database resmi ini. "
                                f"Anda WAJIB MENAMPILKAN record/individu tersebut secara lengkap kepada pengguna "
                                f"(gunakan tabel perbandingan Markdown atau daftar bernomor yang memuat NIK, Nama, TTL, Alamat, dan No KK untuk SETIAP orang). "
                                f"DILARANG MENGARANG data! Pengguna memerlukan seluruh data hasil pencarian."
                                if isinstance(payload_data, list) and rec_count > 1 else ""
                            )
                            conclusion_instruction = (
                                "PANDUAN KESIMPULAN & ANALISIS AKHIR (ZERO-HALLUCINATION & ANTI-CONTENT-ROT):\n"
                                "1. INTEGRITAS KESIMPULAN: Bagian kesimpulan/rangkuman WAJIB merupakan murni rekapitulasi data numerik/faktual dari records resmi di atas. DILARANG menambahkan dugaan spekulatif (seperti dugaan motif kepemilikan, hubungan keluarga fiktif, atau status hukum yang tidak tercatat).\n"
                                "2. DISAMBIGUASI ENTITAS (ANTI-CONFLATION): Jika nama pemilik sama tetapi memiliki NIK, Tempat/Tanggal Lahir, atau Wilayah yang berbeda, nyatakan dengan tegas dalam simpulan bahwa data tersebut merujuk pada beberapa individu yang berbeda. DILARANG MENGGABUNGKAN aset mereka seolah-olah milik satu orang yang sama!\n"
                                "3. ISOLASI DATA SELESAI: DILARANG KERAS mengaitkan atau memasukkan kembali data/aset/nama dari subjek sesi percakapan sebelumnya ke dalam simpulan subjek saat ini."
                            )
                            tool_output_payload = {
                                "status": "success",
                                "source_name": matched_source.name,
                                "source_type": matched_source.source_type,
                                "fetch_mode": "LIVE_DIRECT_DATABASE_QUERY",
                                "validity_tier": v_tier,
                                "validity_score": v_score,
                                "data_priority": f"PRIORITAS_UTAMA_MUTLAK (Tingkat Validitas: {v_tier.upper()} [{v_score}/100] - Data ini diambil langsung secara real-time dari database/source data resmi. WAJIB ditampilkan sebagai acuan utama kepada pengguna di atas data lainnya).",
                                "total_records_found": rec_count,
                                "completeness_instruction": completeness_instruction if completeness_instruction else None,
                                "conclusion_instruction": conclusion_instruction,
                                "field_definitions": field_defs if (isinstance(field_defs, list) and len(field_defs) > 0) else None,
                                "records_summary": records_summary_note,
                                "records": records_for_prompt
                            }
                            if tool_output_payload.get("field_definitions") is None:
                                tool_output_payload.pop("field_definitions", None)
                            if tool_output_payload.get("completeness_instruction") is None:
                                tool_output_payload.pop("completeness_instruction", None)
                            if tool_output_payload.get("records_summary") is None:
                                tool_output_payload.pop("records_summary", None)
                            tool_output_str = json.dumps(tool_output_payload, default=str, ensure_ascii=False)

                        executed_tools_info.append({
                            "tool_name": fn_name,
                            "source_name": matched_source.name,
                            "source_id": matched_source.id,
                            "source_type": matched_source.source_type,
                            "validity_tier": (matched_source.config or {}).get("validity_tier", "authoritative"),
                            "validity_score": (matched_source.config or {}).get("validity_score", 95),
                            "arguments": fn_args,
                            "success": success and not is_empty_or_failed,
                            "url": target_url,
                            "status_code": exec_res.get("status_code"),
                            "error": exec_res.get("error") if not success else (None if not is_empty_or_failed else "Data tidak ditemukan"),
                            "data": [] if is_empty_or_failed else (payload_data if (isinstance(payload_data, (list, dict)) and len(str(payload_data)) < 150000) else None)
                        })
                        
                        if stream_callback:
                            stream_callback(f"⚡ Finished (tools/call: {fn_name}).\n")
                    else:
                        tool_output_str = json.dumps({"error": f"Tool '{fn_name}' is not recognized"})
                        executed_tools_info.append({
                            "tool_name": fn_name,
                            "arguments": fn_args,
                            "success": False,
                            "error": f"Tool '{fn_name}' is not recognized"
                        })

                    # Add tool response to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": fn_name,
                        "content": str(tool_output_str)[:60000]
                    })

                if stream_callback:
                    stream_callback(f"✍️ Generating optimized code...\n\n")

                # Follow-up completion with tool output
                try:
                    try:
                        if is_local_vllm:
                            followup_resp = client.chat.completions.create(
                                model=model,
                                messages=messages,
                                temperature=effective_temperature,
                                max_tokens=4500,
                                extra_body={"chat_template_kwargs": {"enable_thinking": False}}
                            )
                        else:
                            followup_resp = client.chat.completions.create(
                                model=model,
                                messages=messages,
                                temperature=effective_temperature,
                                max_tokens=4500
                            )
                    except Exception:
                        try:
                            followup_resp = client.chat.completions.create(
                                model=model,
                                messages=messages,
                                temperature=effective_temperature,
                                max_tokens=4500
                            )
                        except Exception as follow_p_err:
                            if "max_tokens" in str(follow_p_err) or "temperature" in str(follow_p_err):
                                followup_resp = client.chat.completions.create(
                                    model=model,
                                    messages=messages,
                                    max_completion_tokens=4500
                                )
                            else:
                                with open(r"D:\sourcecode\MCP_SERVER_IN_CEC\services\backoffice_api\error_log.txt", "a") as f:
                                    import traceback
                                    f.write("ERROR in followup_resp:\n" + traceback.format_exc() + "\n")
                                    f.write("MESSAGES:\n" + str(messages) + "\n\n")
                                raise follow_p_err
                    msg = followup_resp.choices[0].message
                except Exception as follow_err:
                    logger.error(f"Error during follow-up chat completion after tool execution: {follow_err}")

            thinking_process = None
            raw_answer = (msg.content or getattr(msg, "reasoning", "") or "").strip()

            # 1. Check reasoning_content attribute (DeepSeek R1 / OpenAI reasoning)
            if hasattr(msg, "reasoning_content") and msg.reasoning_content:
                thinking_process = msg.reasoning_content.strip()

            # 2. Extract <think> tags from raw answer
            think_match = re.search(r"<think>(.*?)</think>", raw_answer, flags=re.DOTALL)
            if think_match:
                if not thinking_process:
                    thinking_process = think_match.group(1).strip()
                clean_answer = re.sub(r"<think>.*?</think>", "", raw_answer, flags=re.DOTALL).strip()
            else:
                clean_answer = raw_answer

            # 3. Clean plain-text thinking / planning preambles
            if (
                clean_answer.startswith("The user wants to") or 
                clean_answer.startswith("The user is asking") or
                "Here's a thinking process:" in clean_answer or 
                "Drafting response:" in clean_answer or 
                "Final plan:" in clean_answer or 
                "I have successfully called" in clean_answer or
                "Thinking Process:" in clean_answer
            ):
                split_markers = [
                    "\n\nBerdasarkan", "\nBerdasarkan", 
                    "\n\nBerikut", "\nBerikut", 
                    "\n\nDitemukan", "\nDitemukan",
                    "\n\nKey details", "\nKey details",
                    "\n\nProfil", "\nProfil",
                    "\n\nData", "\nData",
                    "\n\n---\n\n", "\n---\n", 
                    "Drafting response:\n"
                ]
                found_split = False
                for marker in split_markers:
                    if marker in clean_answer:
                        parts = clean_answer.split(marker, 1)
                        if not thinking_process:
                            thinking_process = parts[0].strip()
                        prefix = marker.strip() if any(marker.strip().startswith(kw) for kw in ["Berdasarkan", "Berikut", "Ditemukan"]) else ""
                        clean_answer = (prefix + " " + parts[1].strip()).strip()
                        found_split = True
                        break
                if not found_split:
                    match = re.search(r"\n\n(?=(?:#|\*\*|Berdasarkan|Berikut|Ditemukan))", clean_answer)
                    if match:
                        if not thinking_process:
                            thinking_process = clean_answer[:match.start()].strip()
                        clean_answer = clean_answer[match.start():].strip()

            # 4. Clean trailing thinking / self-evaluation postambles
            trailing_pattern = r"\n\n(?=(?:This looks|I will use|One last check|Wait, looking|Therefore, I cannot provide|I will formulate|However, I should double check|None of these seem|So the answer is|Final conclusion:|I will write the response|Response structure:|Wait, looking at the tool|I will provide a polite|One detail:|So I will say:|I should check if|I'll stick to|One slight possibility:|Regardless, I must|I will output the final|Final Answer Formulation:|Final decision:|Wait, is it possible|Doc 1:|No mention of|So, the answer is definitely|I will format it clearly|One final check on the tool|Okay, proceeding|One nuance:|If the tool returned empty|I will state this clearly|Wait, I should check|`cari_pengguna_db` usually|This is likely not|So I won't call it|I will stick to the previous|One more thing|Since there is no data|I will provide the final response|The response should be in Indonesian|This is good|I will just output|Is it possible that|The snippets are generic|Final decision:|I will format the answer|I will write the final|I will start directly|The answer is:)).*"
            post_match = re.search(trailing_pattern, clean_answer, flags=re.DOTALL | re.IGNORECASE)
            if post_match:
                trailing_thought = clean_answer[post_match.start():].strip()
                clean_answer = clean_answer[:post_match.start()].strip()
                if thinking_process:
                    thinking_process += "\n\n" + trailing_thought
                else:
                    thinking_process = trailing_thought

            # Remove any raw tool_call xml that the model hallucinates into the answer text
            clean_answer = re.sub(r'<tool_call>[\s\S]*?(?:</tool_call>|$)', '', clean_answer, flags=re.IGNORECASE).strip()
            if not clean_answer and tool_calls:
                clean_answer = "Data berhasil diproses."

            # 5. Entity-Aware Photo Extraction & Source-Grounded Auto-Healing
            try:
                def _normalize_data_uri(b64_str: str) -> str:
                    clean = b64_str.strip()
                    if clean.startswith("http://") or clean.startswith("https://") or clean.startswith("data:image/"):
                        return clean
                    clean_chars = re.sub(r"\s+", "", clean)
                    if clean_chars.startswith("/9j/"):
                        return f"data:image/jpeg;base64,{clean_chars}"
                    elif clean_chars.startswith("iVBORw0KGgo"):
                        return f"data:image/png;base64,{clean_chars}"
                    elif clean_chars.startswith("R0lGOD"):
                        return f"data:image/gif;base64,{clean_chars}"
                    elif clean_chars.startswith("UklGR"):
                        return f"data:image/webp;base64,{clean_chars}"
                    elif clean_chars.startswith("Qk"):
                        return f"data:image/bmp;base64,{clean_chars}"
                    return f"data:image/jpeg;base64,{clean_chars}"

                class EntityPhoto:
                    def __init__(self, photo: str, name: Optional[str] = None, nik: Optional[str] = None, source: str = ""):
                        clean_p = photo.split(";base64,")[1] if ";base64," in photo else photo
                        clean_p = re.sub(r"\s+", "", clean_p)
                        clean_p = re.sub(r'(?:\.\.\.|\[truncated[^\]]*\]|\)+)$', '', clean_p)
                        self.photo = clean_p
                        self.raw_photo = photo.strip()
                        self.name = name.strip() if name and isinstance(name, str) else None
                        self.nik = str(nik).strip() if nik else None
                        self.source = source
                        self.is_truncated = "..." in photo or "[truncated" in photo or len(clean_p) < 1000

                extracted_entities: List[EntityPhoto] = []

                def _extract_from_tool_data(data, source_name="tool"):
                    if not data:
                        return
                    if isinstance(data, dict):
                        photo_val = None
                        name_val = None
                        nik_val = None
                        for k, v in data.items():
                            k_lower = str(k).lower()
                            if any(img_k in k_lower for img_k in ["foto", "photo", "image", "avatar", "picture", "gambar"]):
                                if isinstance(v, str) and len(v.strip()) > 80:
                                    photo_val = v.strip()
                            if any(n_k == k_lower for n_k in ["nama_lgkp", "nama", "nama_lengkap", "name", "full_name", "nama_subjek"]):
                                if isinstance(v, str) and len(v.strip()) > 2:
                                    name_val = v.strip()
                            if any(id_k == k_lower for id_k in ["nik", "no_ktp", "nomor_induk", "id_number", "no_identitas"]):
                                if v:
                                    nik_val = str(v).strip()

                        if photo_val and len(photo_val) > 80:
                            extracted_entities.append(EntityPhoto(photo=photo_val, name=name_val, nik=nik_val, source=source_name))

                        for k, v in data.items():
                            if isinstance(v, (dict, list, tuple)):
                                _extract_from_tool_data(v, source_name)
                    elif isinstance(data, (list, tuple)):
                        for item in data:
                            _extract_from_tool_data(item, source_name)
                    elif isinstance(data, str):
                        _extract_from_text(data, source_name=source_name)

                def _extract_from_text(text: str, source_name="chunk"):
                    if not text or not isinstance(text, str):
                        return
                    # Split into record blocks or lines to preserve entity boundaries
                    blocks = re.split(r'(?:\r?\n|\s*(?=Record\s*\d+:))', text)
                    for blk in blocks:
                        if not blk or len(blk) < 40:
                            continue
                        photo_match = re.search(
                            r'(?:FOTO|photo|image|avatar|gambar)[\s:=]+(["\']?)(/9j/[A-Za-z0-9+/=]{60,}|data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{60,})\1',
                            blk,
                            flags=re.IGNORECASE
                        )
                        photo_val = None
                        if photo_match:
                            photo_val = photo_match.group(2).strip()
                        else:
                            standalone = re.search(r'(/9j/[A-Za-z0-9+/=]{80,}|data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{80,})', blk)
                            if standalone:
                                photo_val = standalone.group(1).strip()

                        if not photo_val or len(photo_val) < 80:
                            continue

                        # Prioritize NIK over generic ID numbers (like Mongo _id)
                        nik_match = re.search(r'\b(?:NIK|NO_KTP|NO_IDENTITAS)[\s:=]+(["\']?)([0-9]{10,20})\1', blk, flags=re.IGNORECASE)
                        if not nik_match:
                            nik_match = re.search(r'\bID[\s:=]+(["\']?)([0-9]{6,20})\1', blk, flags=re.IGNORECASE)
                        nik_val = nik_match.group(2).strip() if nik_match else None

                        name_match = re.search(
                            r'(?:NAMA_LGKP|NAMA_LENGKAP|NAMA|FULL_NAME|NAME)[\s:=]+(["\']?)([^|:\n\r",]{3,60})\1(?=\s*(?:\||$|\n|\r))',
                            blk,
                            flags=re.IGNORECASE
                        )
                        name_val = None
                        if name_match:
                            raw_name = name_match.group(2).strip()
                            raw_name = re.sub(r'\s+(?:NIK|FOTO|TMPT_LHR|TGL_LHR|AGAMA|STATUS|JENIS_KLMIN).*$', '', raw_name, flags=re.IGNORECASE).strip()
                            if len(raw_name) >= 3:
                                name_val = raw_name

                        extracted_entities.append(EntityPhoto(photo=photo_val, name=name_val, nik=nik_val, source=source_name))

                for t_info in executed_tools_info:
                    _extract_from_tool_data(t_info.get("data"), source_name=f"tool:{t_info.get('tool_name', 'tool')}")
                    _extract_from_tool_data(t_info.get("arguments"), source_name="tool_args")
                for c in retrieved_chunks:
                    _extract_from_text(c.get("content"), source_name=f"chunk:{c.get('id', 'chunk')}")

                # Deduplicate entities: STRICTLY by NIK or distinct Full Name.
                # NEVER deduplicate by photo[:40] prefix because standard JPEG headers are identical!
                unique_entities: List[EntityPhoto] = []
                for ep in extracted_entities:
                    if len(ep.photo) < 80:
                        continue
                    existing = None
                    for u in unique_entities:
                        if ep.nik and u.nik and ep.nik == u.nik:
                            existing = u
                            break
                        if ep.name and u.name and ep.name.lower() == u.name.lower() and len(ep.name) >= 4:
                            existing = u
                            break
                    if existing:
                        # Prefer non-truncated, complete photo
                        if (existing.is_truncated and not ep.is_truncated) or (not ep.is_truncated and len(ep.photo) > len(existing.photo)):
                            existing.photo = ep.photo
                            existing.raw_photo = ep.raw_photo
                            existing.is_truncated = False
                        if not existing.name and ep.name:
                            existing.name = ep.name
                        if not existing.nik and ep.nik:
                            existing.nik = ep.nik
                    else:
                        unique_entities.append(ep)

                generic_names = {"admin", "user", "kpk", "indonesia", "pemerintah", "null", "none", "unknown", "foto", "profil", "subjek", "data"}

                def _matches_subject(ep: EntityPhoto, text: str) -> bool:
                    if not text or not ep:
                        return False
                    t_lower = text.lower()
                    if ep.nik and len(ep.nik) >= 8 and ep.nik in text:
                        return True
                    if ep.name and len(ep.name) >= 4 and ep.name.lower() not in generic_names:
                        if ep.name.lower() in t_lower:
                            return True
                        words = [w.lower() for w in re.split(r'[\s.,]+', ep.name) if len(w) > 2 and w.lower() not in generic_names]
                        if len(words) >= 2 and all(w in t_lower for w in words):
                            return True
                    return False

                # Pre-clean: Filter out any raw, loose base64 lines dumped into plain text outside markdown
                cleaned_lines = []
                for line in clean_answer.splitlines():
                    s = line.strip()
                    if s.startswith("![") and s.endswith(")"):
                        cleaned_lines.append(line)
                    elif len(s) > 60 and re.match(r'^[A-Za-z0-9+/=]{60,}$', s):
                        continue
                    else:
                        cleaned_lines.append(line)
                clean_answer = "\n".join(cleaned_lines).strip()

                # Step 1: Auto-heal markdown images rendered by the LLM
                # Match each image to the specific entity named in its label or surrounding text.
                md_img_pattern = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)', flags=re.DOTALL)
                def _heal_image_match(match):
                    label = match.group(1).strip()
                    url = match.group(2).strip()

                    matched_ep = None
                    # A. Check if label explicitly specifies entity name or NIK
                    for ep in unique_entities:
                        if _matches_subject(ep, label):
                            matched_ep = ep
                            break

                    # B. If label is generic (e.g. "Foto", "Foto Profil"), check if exactly one entity matches answer or query
                    if not matched_ep:
                        matching_subjs = [ep for ep in unique_entities if not ep.is_truncated and (_matches_subject(ep, clean_answer) or _matches_subject(ep, message))]
                        if len(matching_subjs) == 1:
                            matched_ep = matching_subjs[0]

                    if matched_ep and not matched_ep.is_truncated:
                        healed_uri = _normalize_data_uri(matched_ep.photo)
                        clean_label = f"Foto Profil - {matched_ep.name}" if matched_ep.name else "Foto Profil Terverifikasi"
                        return f"![{clean_label}]({healed_uri})"

                    return match.group(0)

                clean_answer = md_img_pattern.sub(_heal_image_match, clean_answer)

                # Step 2: Strict Entity-Grounded Injection (if no markdown images were rendered by LLM)
                if not re.search(r'!\[.*?\]\([^\)]+\)', clean_answer):
                    matching_in_query = [ep for ep in unique_entities if not ep.is_truncated and _matches_subject(ep, message)]
                    matching_in_ans = [ep for ep in unique_entities if not ep.is_truncated and _matches_subject(ep, clean_answer)]

                    target = None
                    if len(matching_in_query) == 1:
                        target = matching_in_query[0]
                    elif not matching_in_query and len(matching_in_ans) == 1:
                        target = matching_in_ans[0]

                    if target:
                        target_uri = _normalize_data_uri(target.photo)
                        label = f"Foto Profil - {target.name}" if target.name else "Foto Profil Terverifikasi"
                        clean_answer = f"![{label}]({target_uri})\n\n" + clean_answer
                        logger.info(f"Entity-aware photo injected for single subject '{target.name or target.nik}'")
                    elif len(matching_in_ans) > 1:
                        # Multi-entity injection: inject each person's verified photo right below their section / table
                        entity_positions = []
                        for ep in matching_in_ans:
                            pos = -1
                            if ep.nik and ep.nik in clean_answer:
                                pos = clean_answer.find(ep.nik)
                            elif ep.name and ep.name in clean_answer:
                                pos = clean_answer.find(ep.name)
                            elif ep.name and ep.name.lower() in clean_answer.lower():
                                pos = clean_answer.lower().find(ep.name.lower())
                            if pos != -1:
                                entity_positions.append((pos, ep))

                        # Sort descending by position so insertions don't invalidate subsequent offsets
                        entity_positions.sort(key=lambda x: x[0], reverse=True)
                        for pos, ep in entity_positions:
                            offset = pos + 20
                            m_sec = re.search(r'(?:\n\s*---\s*\n|\n\s*###\s+|\n\s*[1-9]\d*\.\s+|\n\s*(?:Catatan|Sumber|Note)[\s*:]+)', clean_answer[offset:], re.IGNORECASE)
                            if m_sec:
                                insert_pos = offset + m_sec.start()
                            else:
                                insert_pos = len(clean_answer)

                            ep_uri = _normalize_data_uri(ep.photo)
                            photo_tag = f"\n\n![Foto Profil - {ep.name}]({ep_uri})\n"
                            clean_answer = clean_answer[:insert_pos] + photo_tag + clean_answer[insert_pos:]
                        logger.info(f"Multi-entity photos injected for {len(entity_positions)} subjects in family/batch response.")

            except Exception as heal_err:
                logger.warning(f"Error during base64 image auto-healing: {heal_err}")

            if not clean_answer:
                clean_answer = raw_answer or "No response generated by model."

            # 6. Post-Synthesis Verification: Zero-Hallucination & Anti-Content-Rot Guard
            try:
                clean_answer, rot_sanitization_metrics = context_rot_guard.validate_and_sanitize_response(
                    clean_answer=clean_answer,
                    current_message=message,
                    history=history,
                    executed_tools_info=executed_tools_info
                )
                rot_metrics.update(rot_sanitization_metrics)
            except Exception as sanitize_err:
                logger.warning(f"Notice during response anti-rot validation: {sanitize_err}")

        except Exception as e:
            logger.error(f"Error calling LLM for chat response: {e}")
            err_str = str(e)
            err_lower = err_str.lower()
            if "timeout" in err_lower or "timed out" in err_lower:
                if is_cloud:
                    clean_answer = (
                        f"⚠️ **Waktu Tunggu Habis (Timeout):** Permintaan ke model cloud AI `{model}` ({backend_name}) melebihi batas waktu tunggu ({int(cloud_llm_timeout)} detik).\n\n"
                        f"**Penyebab:** Model cloud sedang mengalami antrean padat di server hulu, atau model yang digunakan memerlukan waktu penalaran (*reasoning*) yang terlalu lama.\n\n"
                        f"💡 **Solusi Cepat:**\n"
                        f"- Beralih ke model yang lebih cepat dan responsif: **`deepseek/deepseek-chat`** atau **`openai/gpt-4o-mini`** pada menu pilihan model di atas.\n"
                        f"- Jika menggunakan akun OpenRouter free tier, pastikan tidak menggunakan model besar yang sedang padat antrean."
                    )
                else:
                    timeout_mins = int(local_llm_timeout // 60)
                    clean_answer = (
                        f"⚠️ **Waktu Tunggu Habis (Timeout):** Permintaan ke AI lokal `{model}` ({backend_name}) melebihi batas waktu tunggu ({int(local_llm_timeout)} detik / {timeout_mins} menit).\n\n"
                        f"**Penyebab:** Server AI lokal ({api_base}) membutuhkan waktu komputasi yang lebih lama untuk memproses prompt, konteks dokumen, atau eksekusi *tool calling*.\n\n"
                        f"💡 **Solusi:**\n"
                        f"- Batas waktu tunggu AI lokal telah ditingkatkan ke {timeout_mins} menit. Anda dapat memperpanjangnya lebih lanjut melalui variabel lingkungan `LOCAL_LLM_TIMEOUT` (misal 900 untuk 15 menit).\n"
                        f"- Periksa ketersediaan beban CPU/GPU dan RAM pada server AI lokal ({api_base}).\n"
                        f"- Kurangi jumlah knowledge source atau dokumen terpilih agar waktu komputasi inferensi lebih cepat."
                    )
            elif "504" in err_str or "gateway" in err_lower:
                if is_cloud:
                    clean_answer = (
                        f"⚠️ **Gateway Timeout (504):** Layanan model AI `{model}` ({backend_name}) gagal merespons dalam batas waktu.\n\n"
                        f"💡 **Solusi Cepat:** Silakan gunakan model alternatif yang lebih cepat seperti **`deepseek/deepseek-chat`** atau **`openai/gpt-4o-mini`**."
                    )
                else:
                    clean_answer = (
                        f"⚠️ **Gateway Timeout (504):** Layanan AI lokal `{model}` ({backend_name}) gagal merespons sebelum batas waktu ({int(local_llm_timeout)} detik).\n\n"
                        f"💡 **Solusi:** Periksa apakah server AI lokal ({api_base}) mengalami out-of-memory (OOM) atau antrean beban prosesor terlalu tinggi."
                    )
            elif "404" in err_str or "no endpoints found" in err_lower:
                clean_answer = (
                    f"⚠️ **Model Tidak Ditemukan (404):** Pengenal model `{model}` tidak lagi aktif atau telah diperbarui di OpenRouter.\n\n"
                    f"💡 **Solusi:** Buka menu **LLM Management**, lakukan *Test Connection* pada backend `{backend_name}`, dan gunakan nama model resmi terbaru (misalnya: `deepseek/deepseek-chat`, `openai/gpt-4o-mini`, atau `meta-llama/llama-3.3-70b-instruct`)."
                )
            elif "401" in err_str or "unauthorized" in err_lower:
                clean_answer = (
                    f"⚠️ **Autentikasi Gagal (401):** API Key untuk backend `{backend_name}` tidak valid atau telah kedaluwarsa.\n\n"
                    f"💡 **Solusi:** Periksa kembali API Key Anda di menu **LLM Management**."
                )
            elif "429" in err_str or "rate limit" in err_lower or "credit" in err_lower:
                clean_answer = (
                    f"⚠️ **Batas Kuota / Rate Limit (429):** Akun OpenRouter telah mencapai batas permintaan harian atau kehabisan kredit saldo.\n\n"
                    f"💡 **Solusi:** Periksa saldo kredit akun Anda di [openrouter.ai/credits](https://openrouter.ai/credits) atau gunakan model gratis/vLLM lokal."
                )
            else:
                clean_answer = f"⚠️ Terjadi kendala saat menghubungi backend AI ({backend_name} / {model}): {err_str}"

        elapsed_ms = int((time.time() - start_time) * 1000)

        # ── OpenAI-standard usage estimation ─────────────────────────────────
        # Estimate token counts (approx 4 chars per token) when backend doesn't return them
        try:
            _resp_obj = response if 'response' in dir() else None
            _usage = getattr(_resp_obj, 'usage', None) if _resp_obj else None
            if _usage:
                usage_dict = {
                    "prompt_tokens": getattr(_usage, 'prompt_tokens', 0) or 0,
                    "completion_tokens": getattr(_usage, 'completion_tokens', 0) or 0,
                    "total_tokens": getattr(_usage, 'total_tokens', 0) or 0,
                }
            else:
                prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
                completion_chars = len(clean_answer)
                usage_dict = {
                    "prompt_tokens": prompt_chars // 4,
                    "completion_tokens": completion_chars // 4,
                    "total_tokens": (prompt_chars + completion_chars) // 4,
                }
        except Exception:
            usage_dict = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        # Determine finish_reason
        _finish_reason = "stop"
        if executed_tools_info:
            _finish_reason = "tool_calls"
        elif max_tokens and usage_dict.get("completion_tokens", 0) >= (max_tokens - 10):
            _finish_reason = "length"

        return {
            # ── OpenAI standard fields ──────────────────────────────────────
            "id": chat_id,
            "usage": usage_dict,
            "finish_reason": _finish_reason,
            # ── Knowledge & RAG fields ──────────────────────────────────────
            "answer": clean_answer,
            "sources": clean_sources,
            "entities": graph_entities,
            "model_used": model,
            "backend_name": backend_name,
            "tools_executed": executed_tools_info,
            "face_recognition": face_result,
            "thinking": thinking_process,
            "strict_mode": strict_mode,
            "temperature": effective_temperature,
            "matched_flow": matched_flow_res.get("flow") if (matched_flow_res and matched_flow_res.get("matched")) else None,
            "context_rot_guard": rot_metrics,
            "metrics": {
                "chunks_retrieved": len(retrieved_chunks),
                "entities_retrieved": len(graph_entities),
                "tools_executed": len(executed_tools_info),
                "face_detected": bool(face_result and face_result.get("detection", {}).get("face_detected")),
                "face_matched": bool(face_result and face_result.get("matched")),
                "uploaded_document": bool(uploaded_document),
                "uploaded_document_name": uploaded_document.get("file_name") if uploaded_document else None,
                "strict_mode": strict_mode,
                "temperature": effective_temperature,
                "latency_ms": elapsed_ms,
                "context_rot_guard": rot_metrics
            }
        }


chat_service = ChatService()
