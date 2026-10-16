import re
import json
import time
import logging
from typing import Dict, Any, List, Optional, Tuple, Set

logger = logging.getLogger("mcp_server.context_isolator")


class ContextIsolator:
    """
    Graph-Bounded Context Isolation Engine for MCP Server.
    
    Solves Vector DB Context Leakage:
    Because ChromaDB stores all ingested data across disparate cases, entities, and sources
    in a single collection, raw semantic search leaks chunks from unrelated entities.
    
    This engine:
      1. Determines the active focus entity or topic for the ongoing conversation / session.
      2. Queries Neo4j to retrieve the authoritative mapped network boundary (1-hop & 2-hop).
      3. Strictly filters ChromaDB candidates so ONLY chunks matching the active entity
         or nodes within its Neo4j-mapped network are admitted into the AI context.
      4. Discards cross-entity contaminants and returns isolated, topic-focused results.
    """

    def __init__(self, session_ttl_seconds: int = 3600):
        self.session_ttl_seconds = session_ttl_seconds
        # In-memory session store: { session_id -> { "focus_entity": str, "topic": str, "network": dict, "updated_at": float } }
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def _cleanup_expired_sessions(self):
        now = time.time()
        expired = [sid for sid, s in self._sessions.items() if now - s.get("updated_at", 0) > self.session_ttl_seconds]
        for sid in expired:
            self._sessions.pop(sid, None)

    @staticmethod
    def clean_entity_name(name: str) -> str:
        """
        Strips company prefixes (PT, CV, Yayasan, etc.), honorifics, academic degrees,
        quotes, and punctuation to extract standard core entity names.
        """
        if not name:
            return ""
        n = re.sub(r'[\'\"`]', '', str(name)).strip()

        # Strip prefixes like PT, CV, Yayasan, etc.
        prefix_pattern = r'^(?:\s*(?:pt|p\.t|cv|c\.v|yayasan|yys|koperasi|kop|ud|u\.d|pd|p\.d|perusahaan|perseroan|perum|persero|firma|fa|lembaga)\b\.?\s*)+'
        cleaned = re.sub(prefix_pattern, '', n, flags=re.IGNORECASE).strip()
        while True:
            m = re.match(r'^(?:pt|p\.t|cv|c\.v|yayasan|yys|koperasi|kop|ud|u\.d|pd|p\.d|perusahaan|perseroan|perum|persero|firma|fa|lembaga)\b\.?\s*', cleaned, flags=re.IGNORECASE)
            if m:
                cleaned = cleaned[m.end():].strip()
            else:
                break

        # Strip academic degrees & titles
        title_pattern = r'\b(?:prof|dr|dra|drs|ir|h|hj|apt|ak|drg|drh|s\.?kom|s\.?t|s\.?pd|s\.?h|s\.?e|s\.?si|s\.?ked|s\.?sos|s\.?ip|s\.?farm|s\.?psi|s\.?ag|s\.?sn|m\.?kom|m\.?m|m\.?si|m\.?t|m\.?kn|m\.?pd|m\.?h|m\.?ag|m\.?sc|b\.?sc|ph\.?d|ll\.?m|mba)\b\.?'
        cleaned = re.sub(title_pattern, '', cleaned, flags=re.IGNORECASE)
        # Strip trailing question words or conjunction clauses (e.g. 'dan apa nik nya', 'terkait ...')
        cleaned = re.sub(r'\s+(?:dan|atau|terkait|pada|di|tentang|dengan|yang|apa|apakah|berapa|mana|bagaimana|siapa|siapakah)\b.*$', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'\s+(?:nya|tersebut|miliknya)\s*$', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'[,.]+', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned if len(cleaned) >= 2 else str(name).strip()

    def extract_entity_from_text(self, text: str) -> Optional[str]:
        """
        Extracts candidate entity (person name, company, NIK, KK, certificate) from query or message.
        """
        if not text:
            return None

        # 1. 16-digit NIK or KK identifier
        nik_matches = re.findall(r'\b\d{16}\b', text)
        if nik_matches:
            return nik_matches[0]

        NON_ENTITY_WORDS = {
            "tanah", "sertifikat", "rumah", "nik", "kk", "no_kk", "lahan", "persil", "shm", "hgb", "pt", "cv",
            "vendor", "lelang", "di", "pada", "tentang", "terkait", "dari", "dan", "atau", "apa", "apakah",
            "siapa", "profil", "data", "informasi", "dokumen", "berkas", "keluarga", "rekening",
            "aset", "harta", "lacak", "cek", "temukan", "lihat", "tolong", "mohon", "semua",
            "ada", "punya", "milik", "miliknya", "asetnya", "tanahnya", "rumahnya", "sertifikatnya",
            "lahannya", "keluarganya", "dokumennya", "berkasnya", "datanya", "dia", "beliau", "tersebut",
            "dirinya", "orangnya", "kota", "kabupaten", "desa", "kelurahan", "kecamatan", "provinsi",
            "daftar", "ringkasan", "rincian", "detail", "lengkap"
        }

        def _is_valid_entity_word(w: str) -> bool:
            w_lower = w.lower()
            if w_lower in NON_ENTITY_WORDS:
                return False
            if w_lower.endswith("nya") and w_lower[:-3] in NON_ENTITY_WORDS:
                return False
            return len(w_lower) >= 2

        # 2. Quoted entities: "Indradhi Nugraha" or 'PT Maju Jaya'
        m_quote = re.search(r'["\']([a-zA-Z0-9\s.,]{3,60})["\']', text)
        if m_quote:
            cleaned = self.clean_entity_name(m_quote.group(1))
            words = [w for w in cleaned.split() if _is_valid_entity_word(w)]
            if words:
                return " ".join(words).upper()

        # 3. Explicit prefix patterns: atas nama ..., dengan nama ..., bernama ..., nama ...
        m_name = re.search(
            r'(?:atas\s+nama|dengan\s+nama|bernama|nama\s+lengkap|nama|subjek|milik|profil\s+dari|profil)\s+([a-zA-Z\s.,]{3,50})',
            text,
            re.IGNORECASE
        )
        if m_name:
            raw = m_name.group(1).split("?")[0].split("\n")[0].split(" di ")[0].split(" kab ")[0].split(" kota ")[0].split(" terkait ")[0]
            cleaned = self.clean_entity_name(raw)
            words = [w for w in cleaned.split() if _is_valid_entity_word(w)]
            if len(words) >= 1:
                final_name = " ".join(words).strip().upper()
                if len(final_name) >= 3:
                    return final_name

        # 4. Company patterns: PT ..., CV ...
        m_company = re.search(r'\b(?:PT|CV|Yayasan|Koperasi)\s+([a-zA-Z0-9\s]{3,40})', text, re.IGNORECASE)
        if m_company:
            comp_name = self.clean_entity_name(m_company.group(0))
            if len(comp_name) >= 3:
                return comp_name.upper()

        # 5. Intent inquiry patterns: cari [aset/tanah/keluarga] [nama]
        m_intent = re.search(
            r'(?:cari\s+(?:tanah|aset|lahan|properti|sertifikat|nik|kk|orang|data|keluarga|rekening)|profil|siapa|cek|temukan|lihat|lacak)\s+([a-zA-Z\s.,]{3,50})',
            text,
            re.IGNORECASE
        )
        if m_intent:
            raw = m_intent.group(1).split("?")[0].split("\n")[0].split(" di ")[0].split(" kab ")[0].split(" kota ")[0]
            cleaned = self.clean_entity_name(raw)
            words = [w for w in cleaned.split() if _is_valid_entity_word(w)]
            if len(words) >= 2:
                final_name = " ".join(words).strip().upper()
                if len(final_name) >= 4:
                    return final_name
            elif len(words) == 1 and len(words[0]) >= 4 and not words[0].lower().endswith("nya"):
                return words[0].upper()

        return None

    def determine_active_focus(
        self,
        query: str,
        session_id: Optional[str] = None,
        explicit_entity: Optional[str] = None
    ) -> Tuple[Optional[str], bool, Dict[str, Any]]:
        """
        Determines the active focus entity/topic for the query and session.
        Returns:
          - focus_entity: Uppercase normalized entity name/ID (or None if generic query)
          - is_topic_shift: True if session switched to a different entity
          - session_data: Current session context dictionary
        """
        self._cleanup_expired_sessions()
        now = time.time()
        sid = session_id or "default"

        session = self._sessions.get(sid, {})
        existing_entity = session.get("focus_entity")

        # Case 1: Explicit entity passed as argument
        if explicit_entity and explicit_entity.strip():
            cleaned_explicit = self.clean_entity_name(explicit_entity).upper()
            is_shift = bool(existing_entity and existing_entity != cleaned_explicit)
            session_data = {
                "focus_entity": cleaned_explicit,
                "topic": cleaned_explicit,
                "updated_at": now
            }
            self._sessions[sid] = session_data
            return cleaned_explicit, is_shift, session_data

        # Case 2: Extract entity from current query text
        extracted_from_query = self.extract_entity_from_text(query)

        # Check for topic shift / new subject
        if extracted_from_query:
            if existing_entity and existing_entity != extracted_from_query:
                # Strong entity in query differs from prior session entity -> Topic Shift
                logger.info(f"[ContextIsolator] Topic shift detected in session '{sid}': '{existing_entity}' -> '{extracted_from_query}'")
                session_data = {
                    "focus_entity": extracted_from_query,
                    "topic": extracted_from_query,
                    "updated_at": now
                }
                self._sessions[sid] = session_data
                return extracted_from_query, True, session_data
            else:
                # First time seeing entity or consistent with session
                session_data = {
                    "focus_entity": extracted_from_query,
                    "topic": extracted_from_query,
                    "updated_at": now
                }
                self._sessions[sid] = session_data
                return extracted_from_query, False, session_data

        # Case 3: Query has NO explicit entity, but session ALREADY has an active focus entity (Follow-up query)
        # e.g. "Apa saja aset tanahnya?", "Siapa nama istrinya?", "Berapa nomor rekeningnya?"
        if existing_entity:
            session["updated_at"] = now
            logger.info(f"[ContextIsolator] Follow-up query in session '{sid}' anchored to active focus entity: '{existing_entity}'")
            return existing_entity, False, session

        # Case 4: No entity detected and no active session (Generic knowledge search)
        return None, False, {}

    async def get_graph_network_boundary(self, graph_client: Any, focus_entity: str) -> Dict[str, Any]:
        """
        Resolves the 1-hop and 2-hop connected network in Neo4j for the focus entity.
        Only entities and identifiers inside this network are permitted in the context.
        """
        if not focus_entity or not graph_client:
            return {
                "is_mapped": False,
                "root_name": focus_entity or "",
                "allowed_names": [focus_entity] if focus_entity else [],
                "allowed_identifiers": [],
                "network_nodes": [],
                "total_network_size": 1
            }

        try:
            net_res = await graph_client.get_connected_context_network(focus_entity, max_depth=2)
            allowed_names = set(net_res.get("allowed_names", []))
            allowed_names.add(focus_entity.upper())

            allowed_identifiers = set(net_res.get("allowed_identifiers", []))

            # Also extract significant tokens from allowed names (e.g. 'INDRADHI', 'MULYANTO')
            allowed_tokens = set()
            for name in allowed_names:
                for t in str(name).upper().split():
                    if len(t) >= 3 and not t.isdigit():
                        allowed_tokens.add(t)

            network_nodes = []
            for n in net_res.get("hop1_nodes", []):
                network_nodes.append({
                    "name": n.get("name"),
                    "type": n.get("type", "ENTITY"),
                    "hop": 1,
                    "relation": n.get("relation", "CONNECTED_TO")
                })
            for n in net_res.get("hop2_nodes", []):
                network_nodes.append({
                    "name": n.get("name"),
                    "type": n.get("type", "ENTITY"),
                    "hop": 2,
                    "relation": n.get("relation", "CONNECTED_TO")
                })

            return {
                "is_mapped": net_res.get("is_mapped", False),
                "root_name": net_res.get("root_name", focus_entity),
                "root_type": net_res.get("root_type", "ENTITY"),
                "allowed_names": list(allowed_names),
                "allowed_identifiers": list(allowed_identifiers),
                "allowed_tokens": list(allowed_tokens),
                "network_nodes": network_nodes,
                "total_network_size": len(allowed_names)
            }
        except Exception as e:
            logger.warning(f"[ContextIsolator] Failed to resolve Neo4j network boundary for '{focus_entity}': {e}")
            return {
                "is_mapped": False,
                "root_name": focus_entity,
                "allowed_names": [focus_entity.upper()],
                "allowed_identifiers": [],
                "allowed_tokens": set(w for w in focus_entity.upper().split() if len(w) >= 3),
                "network_nodes": [],
                "total_network_size": 1
            }

    def isolate_chunks(
        self,
        candidates: List[Dict[str, Any]],
        focus_entity: Optional[str],
        network_boundary: Optional[Dict[str, Any]],
        strict: bool = True
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Filters ChromaDB candidate chunks against the Neo4j-mapped context boundary.
        
        Rules:
          - If no focus entity is set: all chunks admitted (generic inquiry).
          - If focus entity is set:
            - Chunks containing the focus entity or its identifiers -> ADMITTED (Direct Match).
            - Chunks containing Neo4j-mapped 1-hop or 2-hop connected entities -> ADMITTED (Graph Network Match).
            - Chunks explicitly containing foreign person names (NAMA_LGKP:, PEMILIK:, etc.)
              or unlinked company names NOT in the Neo4j network -> DROPPED (Cross-Entity Contamination).
            - Chunks from registry sources (Dukcapil, BPN, PBJ, etc.) sharing NO tokens or
              identifiers with the network -> DROPPED (Irrelevant Registry Leak).
        """
        # If no focus entity (generic legal/knowledge question), admit everything
        if not focus_entity:
            return candidates, {
                "status": "bypassed_generic_query",
                "focus_entity": None,
                "candidates_total": len(candidates),
                "admitted_count": len(candidates),
                "isolated_dropped_count": 0,
                "isolation_reason": "No specific entity focus detected; generic semantic retrieval applied."
            }

        allowed_names = set(n.upper() for n in (network_boundary.get("allowed_names") or [focus_entity]))
        allowed_identifiers = set(str(i).upper() for i in (network_boundary.get("allowed_identifiers") or []))
        allowed_tokens = set(t.upper() for t in (network_boundary.get("allowed_tokens") or []))

        # Add focus entity's own tokens
        for t in focus_entity.upper().split():
            if len(t) >= 3 and not t.isdigit():
                allowed_tokens.add(t)

        admitted_chunks = []
        dropped_chunks = []
        dropped_reasons = []

        for c in candidates:
            content_up = str(c.get("content", "")).upper()
            meta = c.get("metadata", {}) or {}
            src_name_lower = str(meta.get("source_name", "")).lower()

            # 1. Direct match: Focus entity name or identifier
            is_direct_match = (
                focus_entity.upper() in content_up
                or any(ident in content_up for ident in allowed_identifiers if len(ident) >= 6)
            )

            # 2. Graph network match: Any 1-hop or 2-hop connected entity from Neo4j
            matched_network_node = None
            if not is_direct_match:
                for node_name in allowed_names:
                    if len(node_name) >= 4 and node_name in content_up:
                        matched_network_node = node_name
                        break

            # 3. Check for Cross-Entity Contamination:
            # Does this chunk belong to an explicit named person or owner that is NOT in the allowed network?
            owner_matches = re.findall(
                r'(?:PEMILIK(?:_NAMA|\s+NAMA)?|NAMA(?:_LGKP|_LENGKAP|\s+LENGKAP|_WP|_PENYEDIA)?|PEMEGANG(?:_HAK|\s+HAK|HAK)?|SUBJEK)\s*[:=]\s*([A-Z\s.,]{3,50})',
                content_up
            )
            is_foreign_contaminant = False
            foreign_name_found = None
            if owner_matches:
                for om in owner_matches:
                    cleaned_om = self.clean_entity_name(om).upper()
                    om_tokens = set(w for w in cleaned_om.split() if len(w) >= 3)
                    # Check if this owner shares any significant token with our allowed network
                    if om_tokens and not (om_tokens & allowed_tokens) and cleaned_om not in allowed_names:
                        is_foreign_contaminant = True
                        foreign_name_found = cleaned_om
                        break

            # 4. Check for Unrelated Registry Leak:
            # If the chunk is from a Dukcapil / BPN / Land registry or Person database, but shares
            # NO allowed tokens or identifiers with the target entity or its network
            is_entity_registry = any(k in src_name_lower for k in ["dukcapil", "kependudukan", "bpn", "pertanahan", "pemilik", "orang", "warga", "ahu"])
            has_network_token = bool(allowed_tokens and any(t in content_up for t in allowed_tokens))
            has_network_id = bool(allowed_identifiers and any(ident in content_up for ident in allowed_identifiers if len(ident) >= 6))

            if is_entity_registry and not is_direct_match and not matched_network_node and not has_network_id and not has_network_token:
                is_foreign_contaminant = True
                foreign_name_found = foreign_name_found or "Unrelated Registry Record"

            # 5. Admission Decision
            if is_foreign_contaminant:
                reason = f"Blocked foreign entity '{foreign_name_found}' not connected to '{focus_entity}' in Neo4j graph"
                dropped_chunks.append(c)
                dropped_reasons.append(reason)
                logger.info(f"[ContextIsolator] Dropped contaminant chunk from '{src_name_lower}': {reason}")
                continue

            if is_direct_match or matched_network_node or has_network_id or has_network_token:
                c["_isolation_match_type"] = "direct" if is_direct_match else ("network_node:" + str(matched_network_node) if matched_network_node else "token_match")
                admitted_chunks.append(c)
            elif not strict:
                # Non-strict mode: Allow high-relevance general chunks that don't contradict the entity
                admitted_chunks.append(c)
            else:
                reason = f"Chunk shares no verifiable link with '{focus_entity}' or Neo4j-mapped network"
                dropped_chunks.append(c)
                dropped_reasons.append(reason)

        metrics = {
            "status": "enforced",
            "focus_entity": focus_entity,
            "is_mapped_in_neo4j": network_boundary.get("is_mapped", False),
            "network_size": len(allowed_names),
            "mapped_network_sample": list(allowed_names)[:10],
            "candidates_total": len(candidates),
            "admitted_count": len(admitted_chunks),
            "isolated_dropped_count": len(dropped_chunks),
            "dropped_reasons": dropped_reasons[:5]
        }

        return admitted_chunks, metrics

    def set_session_context(self, session_id: str, entity_name: str, topic: Optional[str] = None) -> Dict[str, Any]:
        """Manually sets or pins the focus entity for a chat session."""
        cleaned = self.clean_entity_name(entity_name).upper()
        sid = session_id or "default"
        data = {
            "focus_entity": cleaned,
            "topic": topic or cleaned,
            "updated_at": time.time()
        }
        self._sessions[sid] = data
        return data

    def get_session_context(self, session_id: str) -> Dict[str, Any]:
        """Retrieves the active session context."""
        sid = session_id or "default"
        return self._sessions.get(sid, {})

    def clear_session_context(self, session_id: str):
        """Clears working context for a fresh topic."""
        sid = session_id or "default"
        self._sessions.pop(sid, None)

    DEFAULT_GENERAL_SUGGESTIONS = [
        "Bagaimana cara menelusuri data kependudukan berdasarkan NIK?",
        "Bagaimana alur pengecekan sertifikat tanah di BPN?",
        "Bagaimana cara menelusuri profil perusahaan di AHU & SIKAP?"
    ]

    def is_greeting_or_general_query(self, message: str, history: Optional[List[Dict[str, Any]]] = None) -> bool:
        """
        Determines whether the incoming message is a greeting, capability query, or general exploratory
        turn without any specific entity target (no NIK, KK, person name, company, or land certificate).
        """
        if not message or not message.strip():
            return True

        text = message.strip().lower()
        cleaned = re.sub(r'[^\w\s]', ' ', text)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()

        # 1. If message contains 16-digit number (NIK/KK), it is NOT a greeting
        if re.search(r'\b\d{16}\b', message):
            return False

        # 2. If message contains explicit entity extraction, it is NOT a greeting
        extracted = self.extract_entity_from_text(message)
        if extracted:
            return False

        # 3. Known greeting words
        GREETING_WORDS = {
            "halo", "hai", "hi", "hey", "helo", "hello", "assalamualaikum",
            "assalamu alaikum", "salam", "p", "ping", "test", "tes", "testing",
            "pagi", "siang", "sore", "malam", "start", "mulai", "menu", "bantuan", "help"
        }

        if cleaned in GREETING_WORDS:
            return True

        GREETING_PHRASES = [
            "selamat pagi", "selamat siang", "selamat sore", "selamat malam",
            "halo asisten", "halo bot", "halo admin", "halo ai",
            "assalamu alaikum", "assalamualaikum wr wb",
            "siapa kamu", "kamu siapa", "siapakah kamu",
            "apa yang bisa kamu lakukan", "kamu bisa apa", "bisa apa saja",
            "bisa apa", "apa fungsimu", "apa tugasmu", "apa peranmu",
            "fitur apa saja", "layanan apa saja", "panduan", "cara pakai",
            "bagaimana cara pakai", "bisa bantu apa", "apa yang kamu tahu",
            "informasi apa saja yang ada", "perkenalkan dirimu", "kenalan",
            "apa saja yang bisa kamu lakukan", "bisa cari data apa saja",
            "bagaimana cara mencari", "apa saja fitur", "ada data apa saja"
        ]

        for phrase in GREETING_PHRASES:
            if phrase in cleaned:
                remaining = cleaned.replace(phrase, "").strip()
                rem_words = [w for w in remaining.split() if len(w) >= 3 and w not in ["tolong", "mohon", "dong", "bisa", "kah", "ya", "nih", "saja"]]
                if not rem_words:
                    return True

        words = [w for w in cleaned.split() if w]
        if len(words) <= 3 and all(w in GREETING_WORDS or w in ["ya", "nih", "dong", "kah", "bisa", "tolong", "mohon", "pak", "bu", "min"] for w in words):
            return True

        return False

    def sanitize_suggestions(
        self,
        suggestions: List[str],
        active_focus_entity: Optional[str] = None,
        network_boundary: Optional[Dict[str, Any]] = None,
        is_greeting_or_general: bool = False
    ) -> List[str]:
        """
        Sanitizes suggestion chips / follow-up questions to eliminate private database record leaks:
          1. For new chats / greetings or when no entity is focused:
             GUARANTEES ZERO real data leakage (no NIKs, no real person names, no real company names).
             Replaces any leaking questions with clean procedural exploration guides.
          2. For focused entity investigations:
             Strictly bounds suggestions to the active entity and its Neo4j graph-mapped network.
        """
        if not suggestions:
            return list(self.DEFAULT_GENERAL_SUGGESTIONS)

        sanitized = []
        is_unbound_chat = is_greeting_or_general or not active_focus_entity

        allowed_names = set(network_boundary.get("allowed_names", [])) if network_boundary else set()
        allowed_ids = set(network_boundary.get("allowed_identifiers", [])) if network_boundary else set()
        if active_focus_entity:
            allowed_names.add(active_focus_entity.upper())

        for idx, s in enumerate(suggestions):
            s_str = str(s).strip()
            if not s_str:
                continue

            has_leak = False

            # Check 1: 16-digit sequence (NIK/KK)
            if re.search(r'\b\d{16}\b', s_str):
                has_leak = True

            # Check 2: 8+ digit numeric identifier
            elif re.search(r'\b\d{8,}\b', s_str):
                has_leak = True

            # Check 3: If unbound / new chat, check for company indicators or person names
            if is_unbound_chat:
                if re.search(r'\b(?:PT|CV|YAYASAN|KOPERASI|UD)\s+[A-Z0-9\s]{3,}', s_str, re.IGNORECASE):
                    has_leak = True
                elif re.search(r'\b(?:atas\s+nama|bernama|subjek|orang)\s+[A-Z\s]{4,}', s_str, re.IGNORECASE):
                    has_leak = True
                elif re.search(r'\b(?:sertifikat|shm|hgb|nomor\s+hak)\s*(?:no\.?|nomor)?\s*\d+', s_str, re.IGNORECASE):
                    has_leak = True
                elif re.search(r'\b(?:nik|no_kk)\s*[:=]?\s*\d+', s_str, re.IGNORECASE):
                    has_leak = True
                else:
                    ent_in_s = self.extract_entity_from_text(s_str)
                    if ent_in_s:
                        has_leak = True
            else:
                ent_in_s = self.extract_entity_from_text(s_str)
                if ent_in_s:
                    ent_clean = ent_in_s.upper()
                    if ent_clean not in allowed_names and not any(an in ent_clean or ent_clean in an for an in allowed_names):
                        has_leak = True

            if has_leak:
                if is_unbound_chat:
                    fallback = self.DEFAULT_GENERAL_SUGGESTIONS[idx % len(self.DEFAULT_GENERAL_SUGGESTIONS)]
                    sanitized.append(fallback)
                else:
                    safe_options = [
                        f"Telusuri aset tanah milik {active_focus_entity} di BPN",
                        f"Periksa afiliasi perusahaan dan rekanan {active_focus_entity}",
                        f"Lihat jaringan relasi graf entitas {active_focus_entity}"
                    ]
                    sanitized.append(safe_options[idx % len(safe_options)])
            else:
                sanitized.append(s_str)

        # Deduplicate while preserving order
        unique_sanitized = []
        for item in sanitized:
            if item not in unique_sanitized:
                unique_sanitized.append(item)

        while len(unique_sanitized) < 3:
            for def_s in self.DEFAULT_GENERAL_SUGGESTIONS:
                if def_s not in unique_sanitized:
                    unique_sanitized.append(def_s)
                if len(unique_sanitized) >= 3:
                    break

        return unique_sanitized[:3]

    def sanitize_response_suggestions(
        self,
        clean_answer: str,
        active_focus_entity: Optional[str] = None,
        network_boundary: Optional[Dict[str, Any]] = None,
        is_greeting_or_general: bool = False
    ) -> str:
        """
        Extracts <suggestions>...</suggestions> tag from the assistant's answer text,
        sanitizes the suggestions, and replaces or appends the clean JSON array.
        """
        match = re.search(r'<suggestions>([\s\S]*?)</suggestions>', clean_answer, flags=re.IGNORECASE)
        raw_suggestions = []
        if match:
            raw_text = match.group(1).strip()
            try:
                parsed = json.loads(raw_text)
                if isinstance(parsed, list):
                    raw_suggestions = [str(x) for x in parsed]
            except Exception:
                raw_suggestions = re.findall(r'["\']([^"\']{6,120})["\']', raw_text)

        cleaned_suggestions = self.sanitize_suggestions(
            suggestions=raw_suggestions,
            active_focus_entity=active_focus_entity,
            network_boundary=network_boundary,
            is_greeting_or_general=is_greeting_or_general
        )

        suggestions_tag = f'<suggestions>{json.dumps(cleaned_suggestions, ensure_ascii=False)}</suggestions>'

        if match:
            clean_answer = clean_answer[:match.start()] + suggestions_tag + clean_answer[match.end():]
        else:
            clean_answer = clean_answer.rstrip() + f"\n\n{suggestions_tag}"

        return clean_answer


context_isolator = ContextIsolator()
