import re
import time
import logging
from typing import Dict, Any, List, Optional, Tuple, Set
from services.graph.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)


class ContextIsolator:
    """
    Graph-Bounded Context Isolation Engine for Backoffice API & AI Knowledge Chat.
    
    Prevents cross-entity context contamination from ChromaDB:
      1. Determines the active focus entity or topic from conversation history & current message.
      2. Queries Neo4j for the authoritative 1-hop & 2-hop connected network boundary.
      3. Strictly filters retrieved ChromaDB vector chunks so only chunks matching
         the active entity or its Neo4j graph-mapped network are admitted into LLM prompt.
      4. Drops alien / foreign entity chunks (e.g. land, civil registry, corporate records of unrelated individuals).
    """

    def __init__(self, session_ttl_seconds: int = 3600):
        self.session_ttl_seconds = session_ttl_seconds
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def _cleanup_expired_sessions(self):
        now = time.time()
        expired = [sid for sid, s in self._sessions.items() if now - s.get("updated_at", 0) > self.session_ttl_seconds]
        for sid in expired:
            self._sessions.pop(sid, None)

    @staticmethod
    def clean_entity_name(name: str) -> str:
        if not name:
            return ""
        n = re.sub(r'[\'\"`]', '', str(name)).strip()

        prefix_pattern = r'^(?:\s*(?:pt|p\.t|cv|c\.v|yayasan|yys|koperasi|kop|ud|u\.d|pd|p\.d|perusahaan|perseroan|perum|persero|firma|fa|lembaga)\b\.?\s*)+'
        cleaned = re.sub(prefix_pattern, '', n, flags=re.IGNORECASE).strip()
        while True:
            m = re.match(r'^(?:pt|p\.t|cv|c\.v|yayasan|yys|koperasi|kop|ud|u\.d|pd|p\.d|perusahaan|perseroan|perum|persero|firma|fa|lembaga)\b\.?\s*', cleaned, flags=re.IGNORECASE)
            if m:
                cleaned = cleaned[m.end():].strip()
            else:
                break

        title_pattern = r'\b(?:prof|dr|dra|drs|ir|h|hj|apt|ak|drg|drh|s\.?kom|s\.?t|s\.?pd|s\.?h|s\.?e|s\.?si|s\.?ked|s\.?sos|s\.?ip|s\.?farm|s\.?psi|s\.?ag|s\.?sn|m\.?kom|m\.?m|m\.?si|m\.?t|m\.?kn|m\.?pd|m\.?h|m\.?ag|m\.?sc|b\.?sc|ph\.?d|ll\.?m|mba)\b\.?'
        cleaned = re.sub(title_pattern, '', cleaned, flags=re.IGNORECASE)
        # Strip trailing question words or conjunction clauses (e.g. 'dan apa nik nya', 'terkait ...')
        cleaned = re.sub(r'\s+(?:dan|atau|terkait|pada|di|tentang|dengan|yang|apa|apakah|berapa|mana|bagaimana|siapa|siapakah)\b.*$', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'\s+(?:nya|tersebut|miliknya)\s*$', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'[,.]+', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned if len(cleaned) >= 2 else str(name).strip()

    def extract_entity_from_text(self, text: str) -> Optional[str]:
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

        # 2. Quoted entities
        m_quote = re.search(r'["\']([a-zA-Z0-9\s.,]{3,60})["\']', text)
        if m_quote:
            cleaned = self.clean_entity_name(m_quote.group(1))
            words = [w for w in cleaned.split() if _is_valid_entity_word(w)]
            if words:
                return " ".join(words).upper()

        # 3. Explicit prefix patterns
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

        # 4. Company patterns
        m_company = re.search(r'\b(?:PT|CV|Yayasan|Koperasi)\s+([a-zA-Z0-9\s]{3,40})', text, re.IGNORECASE)
        if m_company:
            comp_name = self.clean_entity_name(m_company.group(0))
            if len(comp_name) >= 3:
                return comp_name.upper()

        # 5. Intent inquiry patterns
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
        current_message: str,
        history: Optional[List[Dict[str, Any]]] = None,
        explicit_entity: Optional[str] = None
    ) -> Tuple[Optional[str], bool, str]:
        """
        Determines the active focus entity for chat conversation.
        Checks current message, prior turns, and explicit parameter.
        Returns:
          - focus_entity: str or None
          - is_topic_shift: bool
          - reason: explanation
        """
        if explicit_entity and explicit_entity.strip():
            cleaned = self.clean_entity_name(explicit_entity).upper()
            return cleaned, False, "explicit_parameter"

        cur_ent = self.extract_entity_from_text(current_message)

        # Check prior history for established subject
        prior_ent = None
        if history:
            for item in reversed(history):
                content = str(item.get("content", ""))
                extracted = self.extract_entity_from_text(content)
                if extracted:
                    prior_ent = extracted
                    break

        if cur_ent:
            if prior_ent and prior_ent != cur_ent:
                return cur_ent, True, f"topic_shift: '{prior_ent}' -> '{cur_ent}'"
            return cur_ent, False, "current_message"

        if prior_ent:
            return prior_ent, False, f"inherited_from_history: '{prior_ent}'"

        return None, False, "no_entity_detected"

    def get_graph_network_boundary(self, focus_entity: str) -> Dict[str, Any]:
        """
        Queries Neo4j for the 1-hop and 2-hop connected network boundary of the focus entity.
        Returns allowed names, identifiers, properties, and relationship nodes.
        """
        if not focus_entity:
            return {
                "is_mapped": False,
                "root_name": "",
                "allowed_names": [],
                "allowed_identifiers": [],
                "allowed_tokens": set(),
                "network_nodes": [],
                "total_network_size": 0
            }

        clean_name = focus_entity.strip()
        words = [w for w in clean_name.lower().split() if len(w) >= 3]

        cypher = """
        MATCH (root:Entity)
        WHERE toLower(root.name) = toLower($name)
           OR (size($name) >= 4 AND toLower(root.name) CONTAINS toLower($name))
           OR any(w IN $words WHERE toLower(root.name) CONTAINS w)
        OPTIONAL MATCH (root)-[r1]-(n1:Entity)
        OPTIONAL MATCH (n1)-[r2]-(n2:Entity)
        WHERE n2 <> root
        WITH root,
             collect(DISTINCT {
                 name: n1.name,
                 type: coalesce(n1.type, 'ENTITY'),
                 relation: type(r1),
                 properties: properties(n1)
             })[0..40] AS hop1_nodes,
             collect(DISTINCT {
                 name: n2.name,
                 type: coalesce(n2.type, 'ENTITY'),
                 relation: type(r2),
                 properties: properties(n2)
             })[0..40] AS hop2_nodes
        RETURN root.name AS root_name,
               root.type AS root_type,
               properties(root) AS root_properties,
               hop1_nodes,
               hop2_nodes
        LIMIT 5
        """
        try:
            records = neo4j_client.execute_read(cypher, {"name": clean_name, "words": words})
            if not records:
                tokens = set(w for w in clean_name.upper().split() if len(w) >= 3)
                return {
                    "is_mapped": False,
                    "root_name": clean_name,
                    "allowed_names": [clean_name.upper()],
                    "allowed_identifiers": [clean_name] if clean_name.isdigit() else [],
                    "allowed_tokens": tokens,
                    "network_nodes": [],
                    "total_network_size": 1
                }

            allowed_names = set()
            allowed_identifiers = set()
            network_nodes = []
            primary_root = records[0]["root_name"]
            primary_type = records[0].get("root_type", "ENTITY")

            for rec in records:
                r_name = rec["root_name"]
                allowed_names.add(r_name.upper())
                for k, v in (rec.get("root_properties") or {}).items():
                    if isinstance(v, (str, int)) and len(str(v)) >= 4:
                        allowed_identifiers.add(str(v).upper())

                for h1 in rec.get("hop1_nodes", []):
                    h1_name = h1.get("name")
                    if h1_name:
                        allowed_names.add(h1_name.upper())
                        network_nodes.append({
                            "name": h1_name,
                            "type": h1.get("type", "ENTITY"),
                            "hop": 1,
                            "relation": h1.get("relation", "CONNECTED")
                        })
                        for k, v in (h1.get("properties") or {}).items():
                            if isinstance(v, (str, int)) and len(str(v)) >= 4:
                                allowed_identifiers.add(str(v).upper())

                for h2 in rec.get("hop2_nodes", []):
                    h2_name = h2.get("name")
                    if h2_name:
                        allowed_names.add(h2_name.upper())
                        network_nodes.append({
                            "name": h2_name,
                            "type": h2.get("type", "ENTITY"),
                            "hop": 2,
                            "relation": h2.get("relation", "CONNECTED")
                        })
                        for k, v in (h2.get("properties") or {}).items():
                            if isinstance(v, (str, int)) and len(str(v)) >= 4:
                                allowed_identifiers.add(str(v).upper())

            allowed_tokens = set()
            for name in allowed_names:
                for t in str(name).split():
                    if len(t) >= 3 and not t.isdigit():
                        allowed_tokens.add(t)

            return {
                "is_mapped": True,
                "root_name": primary_root,
                "root_type": primary_type,
                "allowed_names": list(allowed_names),
                "allowed_identifiers": list(allowed_identifiers),
                "allowed_tokens": allowed_tokens,
                "network_nodes": network_nodes,
                "total_network_size": len(allowed_names)
            }
        except Exception as e:
            logger.warning(f"Error querying Neo4j network boundary for '{focus_entity}': {e}")
            tokens = set(w for w in clean_name.upper().split() if len(w) >= 3)
            return {
                "is_mapped": False,
                "root_name": clean_name,
                "allowed_names": [clean_name.upper()],
                "allowed_identifiers": [clean_name] if clean_name.isdigit() else [],
                "allowed_tokens": tokens,
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
        Enforces Graph-Bounded Context Isolation on ChromaDB chunks.
        """
        if not focus_entity:
            return candidates, {
                "status": "bypassed_generic_query",
                "focus_entity": None,
                "candidates_total": len(candidates),
                "admitted_count": len(candidates),
                "isolated_dropped_count": 0
            }

        allowed_names = set(n.upper() for n in (network_boundary.get("allowed_names") or [focus_entity]))
        allowed_identifiers = set(str(i).upper() for i in (network_boundary.get("allowed_identifiers") or []))
        allowed_tokens = set(t.upper() for t in (network_boundary.get("allowed_tokens") or []))

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

            # 3. Check for Cross-Entity Contamination
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
                    if om_tokens and not (om_tokens & allowed_tokens) and cleaned_om not in allowed_names:
                        is_foreign_contaminant = True
                        foreign_name_found = cleaned_om
                        break

            # 4. Check for Unrelated Registry Leak
            is_entity_registry = any(k in src_name_lower for k in ["dukcapil", "kependudukan", "bpn", "pertanahan", "pemilik", "orang", "warga", "ahu"])
            has_network_token = bool(allowed_tokens and any(t in content_up for t in allowed_tokens))
            has_network_id = bool(allowed_identifiers and any(ident in content_up for ident in allowed_identifiers if len(ident) >= 6))

            if is_entity_registry and not is_direct_match and not matched_network_node and not has_network_id and not has_network_token:
                is_foreign_contaminant = True
                foreign_name_found = foreign_name_found or "Unrelated Registry Record"

            # 5. Admission Decision
            if is_foreign_contaminant:
                reason = f"Blocked foreign entity '{foreign_name_found}' not connected in Neo4j graph"
                dropped_chunks.append(c)
                dropped_reasons.append(reason)
                continue

            if is_direct_match or matched_network_node or has_network_id or has_network_token:
                c["_isolation_match_type"] = "direct" if is_direct_match else ("network_node:" + str(matched_network_node) if matched_network_node else "token_match")
                admitted_chunks.append(c)
            elif not strict:
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


context_isolator = ContextIsolator()
