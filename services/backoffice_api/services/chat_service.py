import os
import time
import re
import json
import logging
from typing import List, Dict, Any, Optional
from services.vector_store import vector_store
from services.graph.neo4j_client import neo4j_client
from services.llm_service import llm_service
from services.personality_service import personality_service

logger = logging.getLogger(__name__)


class ChatService:
    def get_graph_entities(self, query_text: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Extracts entities from Neo4j matching keywords in the query text.
        """
        words = [w.strip().lower() for w in re.findall(r'\w+', query_text) if len(w) >= 3]
        if not words:
            return []

        cypher = """
        MATCH (e:Entity)
        WHERE any(w in $words WHERE toLower(e.name) CONTAINS w OR toLower(coalesce(e.description, '')) CONTAINS w)
        OPTIONAL MATCH (e)-[r]-(target:Entity)
        RETURN e.name AS name,
               e.type AS type,
               e.description AS description,
               type(r) AS relation,
               target.name AS target_name,
               target.type AS target_type
        LIMIT $limit
        """
        try:
            records = neo4j_client.execute_read(cypher, {"words": words, "limit": limit})
            entities_map = {}
            for row in records:
                name = row.get("name")
                if not name:
                    continue
                if name not in entities_map:
                    entities_map[name] = {
                        "name": name,
                        "type": row.get("type", "ENTITY"),
                        "description": row.get("description", ""),
                        "connections": []
                    }
                rel = row.get("relation")
                target = row.get("target_name")
                if rel and target:
                    conn = f"{rel} -> {target} ({row.get('target_type', 'ENTITY')})"
                    if conn not in entities_map[name]["connections"]:
                        entities_map[name]["connections"].append(conn)

            return list(entities_map.values())
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
        top_k: int = 5,
        db: Any = None,
        liked_examples: Optional[List[Dict[str, str]]] = None,
        dislike_notes: Optional[List[str]] = None,
        strict_mode: bool = True,
        temperature: Optional[float] = None
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
                    if (sel_s.config or {}).get("is_tool") or (sel_s.config or {}).get("parameters"):
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

            try:
                retrieved_chunks = vector_store.query_similarity(
                    query=message,
                    n_results=top_k,
                    filter_meta=filter_meta
                )
                if retrieved_chunks and db:
                    try:
                        from models.knowledge_source import KnowledgeSource
                        active_ids_set = set(s[0] for s in db.query(KnowledgeSource.id).filter(KnowledgeSource.is_active == True).all())
                        retrieved_chunks = [
                            c for c in retrieved_chunks
                            if c.get("metadata", {}).get("source_id") in active_ids_set or c.get("metadata", {}).get("source_id") is None
                        ]
                    except Exception as e:
                        logger.warning(f"Error checking active chunks: {e}")
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

        if retrieved_chunks:
            context_parts.append("=== RETRIEVED KNOWLEDGE BASE DOCUMENTS ===")

            clean_msg = re.sub(r"[^\w\s]", " ", message)
            msg_words = [w.strip() for w in clean_msg.split() if len(w.strip()) >= 3]

            for idx, c in enumerate(retrieved_chunks, start=1):
                src_name = c.get("metadata", {}).get("source_name", "Knowledge Base")
                score = c.get("score", 0.0)
                raw_content = c.get("content", "").strip()

                # Clean truncated snippet for LLM context with smart keyword centering
                chunk_excerpt = raw_content
                if len(raw_content) > MAX_CHUNK_CHARS:
                    kw_pos = -1
                    for w in msg_words:
                        p = raw_content.upper().find(w.upper())
                        if p != -1:
                            kw_pos = p
                            break

                    if kw_pos != -1:
                        # Center window around the keyword occurrence, snapping to line/record boundary
                        start_pos = max(0, kw_pos - 300)
                        rec_break = raw_content.rfind("\n", max(0, start_pos - 200), start_pos + 1)
                        if rec_break != -1:
                            start_pos = rec_break + 1
                        end_pos = min(len(raw_content), start_pos + MAX_CHUNK_CHARS)

                        # Protect photo boundaries: if end_pos cuts into a base64 photo, extend to next field separator ' | ' or newline
                        photo_marker = raw_content.rfind("FOTO:", start_pos, end_pos)
                        if photo_marker != -1:
                            next_sep = raw_content.find(" | ", photo_marker)
                            if next_sep != -1 and next_sep > end_pos:
                                end_pos = next_sep

                        chunk_excerpt = ("... " if start_pos > 0 else "") + raw_content[start_pos:end_pos]
                        if end_pos < len(raw_content):
                            chunk_excerpt += "... [truncated for length]"
                    else:
                        end_pos = min(len(raw_content), MAX_CHUNK_CHARS)
                        photo_marker = raw_content.rfind("FOTO:", 0, end_pos)
                        if photo_marker != -1:
                            next_sep = raw_content.find(" | ", photo_marker)
                            if next_sep != -1 and next_sep > end_pos:
                                end_pos = next_sep
                        chunk_excerpt = raw_content[:end_pos]
                        if end_pos < len(raw_content):
                            chunk_excerpt += "... [truncated for length]"

                chunk_entry = f"[Document {idx}] (Source: {src_name} | Match Score: {score}):\n{chunk_excerpt}\n"

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
                    "metadata": c.get("metadata", {})
                })

        if graph_entities:
            context_parts.append("=== KNOWLEDGE GRAPH ENTITIES & RELATIONSHIPS ===")
            for ent in graph_entities:
                conns = ", ".join(ent["connections"]) if ent["connections"] else "None"
                ent_entry = f"Entity: {ent['name']} ({ent['type']}) - Description: {ent['description']} | Connected To: {conns}"
                if accumulated_chars + len(ent_entry) <= MAX_TOTAL_CONTEXT_CHARS + 2000:
                    context_parts.append(ent_entry)
                    accumulated_chars += len(ent_entry)

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
        if db:
            try:
                from models.knowledge_source import KnowledgeSource
                all_tool_sources = db.query(KnowledgeSource).filter(
                    KnowledgeSource.source_type.in_(["api", "database"]),
                    KnowledgeSource.is_active == True
                ).all()

                active_tool_sources = []
                if active_source_ids:
                    # Check if user explicitly selected any tool source(s)
                    explicit_tool_ids = set()
                    for s in all_tool_sources:
                        if s.id in active_source_ids:
                            cfg = s.config or {}
                            if cfg.get("is_tool") or cfg.get("parameters"):
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
                                if not (t_cfg.get("is_tool") or t_cfg.get("parameters")):
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
                            active_tool_sources = [s for s in all_tool_sources if (s.config or {}).get("is_tool") or (s.config or {}).get("parameters")]
                else:
                    active_tool_sources = [s for s in all_tool_sources if (s.config or {}).get("is_tool") or (s.config or {}).get("parameters")]

                for s in active_tool_sources:
                    cfg = s.config or {}
                    if cfg.get("is_tool") or cfg.get("parameters"):
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
            except Exception as tool_disc_err:
                logger.warning(f"Error discovering dynamic tools for chat: {tool_disc_err}")

        # Resolve effective temperature (0.0 for strict mode to guarantee zero-hallucination greedy decoding)
        if temperature is not None:
            effective_temperature = max(0.0, min(1.0, float(temperature)))
        else:
            effective_temperature = 0.0 if strict_mode else 0.3

        # 6. Build LLM Prompt with Configured MCP Personality
        system_instruction = personality_service.build_system_instruction(
            db=db,
            is_indonesian=True,
            tools=tools,
            tool_dispatch_map=tool_dispatch_map,
            is_single_tool_selected=is_single_tool_selected,
            single_selected_tool_name=single_selected_tool_name,
            selected_tool_names=selected_tool_names,
            uploaded_document=uploaded_document,
            strict_mode=strict_mode
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
- When tool results or context contain photos, render the photo in Markdown image `![Foto](data:image/jpeg;base64,...)` ONLY IF the photo strictly belongs to the specific person or entity being profiled (matching NIK or Full Name). NEVER display another person's photo or an unverified photo."""
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
3. Sebutkan sumber dokumen pendukung jika relevan."""

        # Prepare messages
        messages = [{"role": "system", "content": system_instruction}]
        
        # Add recent conversational history (up to last 6 turns)
        for h in history[-6:]:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": prompt_content})

        # 7. Execute LLM Completion (with dynamic Tool Calling support)
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
        try:
            kwargs = {
                "model": model,
                "messages": messages,
                "temperature": effective_temperature,
                "max_tokens": 4500
            }
            if tools:
                kwargs["tools"] = tools
                if is_single_tool_selected and single_selected_tool_name:
                    kwargs["tool_choice"] = {"type": "function", "function": {"name": single_selected_tool_name}}
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

            # Process LLM tool calls if requested
            if tool_calls:
                from services.ingestion.api_ingester import api_ingester
                # Append assistant's tool_calls message
                messages.append(msg)

                for tc in tool_calls:
                    fn_name = tc.function.name
                    fn_args_raw = tc.function.arguments or "{}"
                    try:
                        fn_args = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else fn_args_raw
                    except Exception:
                        fn_args = {}

                    logger.info(f"AI requested tool call: {fn_name} with arguments: {fn_args}")
                    matched_source = tool_dispatch_map.get(fn_name)
                    if matched_source:
                        source_cfg = matched_source.config or {}
                        if matched_source.source_type == "database":
                            from services.ingestion.database_ingester import database_ingester
                            exec_res = database_ingester.execute_tool_call_sync(source_cfg, fn_args)
                            target_url = f"{source_cfg.get('db_type', 'db').upper()}://{source_cfg.get('database', '')}"
                        else:
                            exec_res = api_ingester.execute_tool_call_sync(source_cfg, fn_args)
                            target_url = exec_res.get("endpoint") or exec_res.get("url")

                        success = exec_res.get("success", False)
                        payload_data = exec_res.get("data") if exec_res.get("data") is not None else exec_res.get("text", exec_res)

                        # Automatically cache query-by-parameter result into ChromaDB Bank Data
                        if success:
                            try:
                                rec_data = exec_res.get("data")
                                if rec_data and isinstance(rec_data, list) and len(rec_data) > 0:
                                    from services.ingestion.bank_data_saver import save_tool_records_to_bank_data
                                    save_tool_records_to_bank_data(matched_source, fn_args, rec_data, db)
                            except Exception as cache_err:
                                logger.warning(f"Notice saving tool bank data in chat: {cache_err}")
                        
                        # Explicit empty result notification to prevent the LLM from inventing data
                        if isinstance(payload_data, list) and len(payload_data) == 0:
                            tool_output_str = json.dumps({
                                "status": "not_found",
                                "message": f"Query tool '{fn_name}' dijalankan langsung ke basis data sumber dan TIDAK MENEMUKAN data/record yang cocok. Sampaikan secara transparan kepada pengguna bahwa data tidak ditemukan di database resmi. DILARANG MENGARANG data profil fiktif.",
                                "records": []
                            }, ensure_ascii=False)
                        else:
                            # Deliver with explicit Ground Truth Priority metadata and Field Definitions
                            field_defs = (matched_source.config or {}).get("field_definitions", [])
                            tool_output_payload = {
                                "status": "success",
                                "source_name": matched_source.name,
                                "source_type": matched_source.source_type,
                                "fetch_mode": "LIVE_DIRECT_DATABASE_QUERY",
                                "data_priority": "PRIORITAS_UTAMA_MUTLAK (Data ini diambil langsung secara real-time dari database/source data resmi. WAJIB ditampilkan sebagai acuan utama kepada pengguna di atas data lainnya).",
                                "field_definitions": field_defs if (isinstance(field_defs, list) and len(field_defs) > 0) else None,
                                "records": payload_data
                            }
                            if tool_output_payload.get("field_definitions") is None:
                                tool_output_payload.pop("field_definitions", None)
                            tool_output_str = json.dumps(tool_output_payload, default=str, ensure_ascii=False)

                        executed_tools_info.append({
                            "tool_name": fn_name,
                            "source_name": matched_source.name,
                            "source_id": matched_source.id,
                            "source_type": matched_source.source_type,
                            "arguments": fn_args,
                            "success": success,
                            "url": target_url,
                            "status_code": exec_res.get("status_code"),
                            "error": exec_res.get("error"),
                            "data": payload_data if (isinstance(payload_data, (list, dict)) and len(str(payload_data)) < 150000) else None
                        })
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

                        nik_match = re.search(r'(?:NIK|NO_KTP|ID|NO_IDENTITAS)[\s:=]+(["\']?)([0-9]{6,20})\1', blk, flags=re.IGNORECASE)
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

                # Deduplicate entities: keep the longest photo string per entity (NIK or Name or Photo prefix)
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
                        if ep.photo[:40] == u.photo[:40]:
                            existing = u
                            break
                    if existing:
                        if len(ep.photo) > len(existing.photo):
                            existing.photo = ep.photo
                            existing.raw_photo = ep.raw_photo
                        if not existing.name and ep.name:
                            existing.name = ep.name
                        if not existing.nik and ep.nik:
                            existing.nik = ep.nik
                    else:
                        unique_entities.append(ep)

                # Step 1: Auto-heal any truncated or broken markdown images that the LLM already attempted to render
                for ep in unique_entities:
                    prefix_30 = ep.photo[:30]
                    full_uri = _normalize_data_uri(ep.photo)
                    trunc_md_pattern = re.compile(
                        r'!\[([^\]]*)\]\((?:data:image\/[a-zA-Z0-9+.-]+;base64,)?' + re.escape(prefix_30) + r'[^)\n\r]*(?:\)|$)',
                        re.MULTILINE
                    )
                    if trunc_md_pattern.search(clean_answer):
                        clean_answer = trunc_md_pattern.sub(f'![\\1]({full_uri})', clean_answer)
                    elif prefix_30 in clean_answer:
                        raw_pattern = re.compile(
                            r'(?:data:image\/[a-zA-Z0-9+.-]+;base64,)?' + re.escape(prefix_30) + r'[A-Za-z0-9+/=]*(?:\.\.\.|\s*\[truncated[^\]]*\])?'
                        )
                        label = f"Foto - {ep.name}" if ep.name else "Foto Profil"
                        clean_answer = raw_pattern.sub(f'![{label}]({full_uri})', clean_answer)

                # Step 2: Strict Entity-Grounded Injection (ONLY if no markdown image exists and EXACTLY ONE entity unambiguously matches)
                if not re.search(r'!\[.*?\]\([^\)]+\)', clean_answer):
                    ans_lower = clean_answer.lower()
                    msg_lower = (message or "").lower()
                    generic_names = {"admin", "user", "kpk", "indonesia", "pemerintah", "null", "none", "unknown"}

                    matching_photos: List[EntityPhoto] = []
                    for ep in unique_entities:
                        is_match = False
                        # NIK Match (very high confidence)
                        if ep.nik and len(ep.nik) >= 8:
                            if ep.nik in clean_answer or ep.nik in (message or ""):
                                is_match = True
                        # Name Match (high confidence if name is distinct and appears in answer)
                        if not is_match and ep.name and len(ep.name) >= 4 and ep.name.lower() not in generic_names:
                            if ep.name.lower() in ans_lower:
                                is_match = True
                            elif len(ep.name.split()) >= 2 and all(w.lower() in ans_lower for w in ep.name.split() if len(w) > 2):
                                is_match = True

                        if is_match and ep not in matching_photos:
                            matching_photos.append(ep)

                    # INJECT ONLY IF EXACTLY ONE ENTITY MATCHES!
                    # If 0 matches: query or answer is general or unrelated -> DO NOT inject any photo!
                    # If >1 matches: multiple people discussed (e.g. list/table) -> DO NOT pick an arbitrary one!
                    if len(matching_photos) == 1:
                        target = matching_photos[0]
                        target_uri = _normalize_data_uri(target.photo)
                        label = f"Foto Profil - {target.name}" if target.name else "Foto Profil Terverifikasi"
                        clean_answer = f"![{label}]({target_uri})\n\n" + clean_answer
                        logger.info(f"Entity-aware photo injected for '{target.name or target.nik}'")
                    elif len(matching_photos) > 1:
                        logger.info(f"Multiple entities matched ({len(matching_photos)}), omitting top photo injection to prevent confusion.")

            except Exception as heal_err:
                logger.warning(f"Error during base64 image auto-healing: {heal_err}")

            if not clean_answer:
                clean_answer = raw_answer or "No response generated by model."

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

        return {
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
                "latency_ms": elapsed_ms
            }
        }


chat_service = ChatService()
