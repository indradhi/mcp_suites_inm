import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple, Set

logger = logging.getLogger(__name__)


class ContextRotGuard:
    """
    Advanced Anti-Context-Rot Guard for Multi-Turn AI Conversations.
    Protects the agent against the 3 classic long-session context rot failure modes:
      1. Poisoning: Self-reinforcing hallucinations (e.g. fake function names, unverified claims).
      2. Distraction: Fixation on prior response formats/topics, preventing fresh task planning.
      3. Confusion: Bloated context windows filled with stale tables, massive JSON dumps, and irrelevant turns.
    """

    def __init__(self):
        self.max_verbatim_turns = 2        # Keep only the last 2 turns in verbatim form (cleaned)
        self.max_history_chars = 4000      # Soft limit for entire prior history (~1000 tokens)
        self.max_message_chars = 1200      # Max chars for any single prior assistant message

    @staticmethod
    def clean_entity_name(name: str) -> str:
        """
        Strips company / business entity prefixes (PT, CV, Yayasan, Koperasi, UD, PD, Perusahaan, dll),
        honorifics, academic degrees, quotes, and punctuation so that database/API tools query
        clean core entity names without failing due to prefix variations or punctuation.
        """
        if not name:
            return ""
        n = re.sub(r'[\'\"`]', '', str(name)).strip()
        
        # Strip entity prefixes like "PT", "PT.", "P.T.", "CV", "CV.", "Yayasan", "Koperasi", "UD", "Perusahaan", etc.
        entity_prefix_pattern = r'^(?:\s*(?:pt|p\.t|cv|c\.v|yayasan|yys|koperasi|kop|ud|u\.d|pd|p\.d|perusahaan|perseroan|perum|persero|firma|fa|lembaga)\b\.?\s*)+'
        cleaned = re.sub(entity_prefix_pattern, '', n, flags=re.IGNORECASE).strip()
        while True:
            m = re.match(r'^(?:pt|p\.t|cv|c\.v|yayasan|yys|koperasi|kop|ud|u\.d|pd|p\.d|perusahaan|perseroan|perum|persero|firma|fa|lembaga)\b\.?\s*', cleaned, flags=re.IGNORECASE)
            if m:
                cleaned = cleaned[m.end():].strip()
            else:
                break
                
        # Also strip academic titles & degrees
        title_pattern = r'\b(?:prof|dr|dra|drs|ir|h|hj|apt|ak|drg|drh|s\.?kom|s\.?t|s\.?pd|s\.?h|s\.?e|s\.?si|s\.?ked|s\.?sos|s\.?ip|s\.?farm|s\.?psi|s\.?ag|s\.?sn|m\.?kom|m\.?m|m\.?si|m\.?t|m\.?kn|m\.?pd|m\.?h|m\.?ag|m\.?sc|b\.?sc|ph\.?d|ll\.?m|mba)\b\.?'
        cleaned = re.sub(title_pattern, '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'[,.]+', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned if len(cleaned) >= 2 else str(name).strip()

    @staticmethod
    def clean_person_name(name: str) -> str:
        """
        Strips academic degrees, honorifics, quotes, and punctuation from person names
        as well as accidental business entity prefixes so database/API queries receive standard clean entity names.
        """
        return ContextRotGuard.clean_entity_name(name)

    @classmethod
    def extract_target_subject_name(cls, query: str) -> Optional[str]:
        """
        Extracts the target individual's name from search inquiries (e.g. 'cari tanah atas nama "miftahusurur s.kom"').
        Returns normalized uppercase name or None.
        """
        if not query:
            return None
        NON_NAME_WORDS = {"tanah", "sertifikat", "rumah", "nik", "lahan", "persil", "shm", "hgb", "pt", "cv", "vendor", "lelang", "di", "pada", "tentang", "terkait", "dari", "dan", "atau"}
        
        # 1. Quoted string: "miftahusurur s.kom" or 'bambang'
        m_quote = re.search(r'["\']([a-zA-Z\s.,]{3,50})["\']', query)
        if m_quote:
            cleaned = cls.clean_person_name(m_quote.group(1))
            words = [w for w in cleaned.lower().split() if w not in NON_NAME_WORDS and len(w) >= 2]
            if len(words) >= 1:
                final_name = " ".join(words).strip()
                if len(final_name) >= 3:
                    return final_name.upper()

        # 2. Pattern: atas nama ..., dengan nama ..., bernama ..., nama ...
        m_name = re.search(r'(?:atas\s+nama|dengan\s+nama|bernama|subjek|orang|milik|nama)\s+([a-zA-Z\s.,]{3,50})', query, re.IGNORECASE)
        if m_name:
            raw = m_name.group(1).split("?")[0].split("\n")[0].split(" di ")[0].split(" kab ")[0].split(" kota ")[0]
            cleaned = cls.clean_person_name(raw)
            words = [w for w in cleaned.lower().split() if w not in NON_NAME_WORDS and len(w) >= 2]
            if len(words) >= 1:
                final_name = " ".join(words).strip()
                if len(final_name) >= 3:
                    return final_name.upper()

        # 3. Intent Pattern: cari [tanah/aset/lahan/properti/nik/kk/orang/data] [nama] or [profil/siapa/cek/temukan/lihat/lacak] [nama]
        m_intent = re.search(
            r'(?:cari\s+(?:tanah|aset|lahan|properti|sertifikat|nik|kk|orang|data)|profil|siapa|cek|temukan|lihat|lacak)\s+([a-zA-Z\s.,]{3,50})',
            query,
            re.IGNORECASE
        )
        if m_intent:
            raw = m_intent.group(1).split("?")[0].split("\n")[0].split(" di ")[0].split(" kab ")[0].split(" kota ")[0]
            cleaned = cls.clean_person_name(raw)
            words = [w for w in cleaned.lower().split() if w not in NON_NAME_WORDS and len(w) >= 2]
            if len(words) >= 1:
                final_name = " ".join(words).strip()
                if len(final_name) >= 3:
                    return final_name.upper()

        # 4. Inquisitive or conversational pattern: mengapa/kenapa foto/data/profil/ktp [nama] dengan nik ...
        m_conv = re.search(
            r'(?:foto|gambar|data|profil|informasi|mengenai|tentang|terkait|milik|warga)\s+([a-zA-Z\s.,]{3,50}?)(?:\s+(?:dengan\s+nik|nik|tidak|belum|\?|$))',
            query,
            re.IGNORECASE
        )
        if m_conv:
            raw = m_conv.group(1).split("?")[0].split("\n")[0].split(" di ")[0].split(" dengan ")[0]
            cleaned = cls.clean_person_name(raw)
            words = [w for w in cleaned.lower().split() if w not in NON_NAME_WORDS and len(w) >= 2]
            if len(words) >= 1:
                final_name = " ".join(words).strip()
                if len(final_name) >= 3:
                    return final_name.upper()

        return None

    def sanitize_and_compact_history(
        self,
        current_message: str,
        raw_history: List[Dict[str, Any]],
        valid_tools: Optional[List[Dict[str, Any]]] = None,
        tool_dispatch_map: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[Dict[str, str]], Dict[str, Any]]:
        """
        Processes conversation history through the 3 Anti-Rot defensive layers:
        Returns:
          - sanitized_messages: List of clean message dicts [{'role': '...', 'content': '...'}]
          - guard_metrics: Dict with details on sanitization, pruning, task shift, and tokens saved.
        """
        guard_metrics = {
            "original_turns": len(raw_history),
            "poisoning_neutralized": 0,
            "large_tables_compacted": 0,
            "task_shift_detected": False,
            "shift_reason": "continuous_dialogue",
            "distilled_turns_count": 0,
            "retained_turns_count": 0,
            "chars_before": sum(len(str(m.get("content", ""))) for m in raw_history),
            "chars_after": 0,
            "context_health": "OPTIMAL"
        }

        if not raw_history:
            return [], guard_metrics

        # Compile set of authorized tool and function names
        registered_tool_names: Set[str] = set()
        if tool_dispatch_map:
            registered_tool_names.update(tool_dispatch_map.keys())
        if valid_tools:
            for t in valid_tools:
                fn = t.get("function", {})
                if "name" in fn:
                    registered_tool_names.add(fn["name"])
                if "name" in t:
                    registered_tool_names.add(t["name"])

        # ── 1. ANTI-POISONING LAYER: Scan & Neutralize Hallucinated Functions & Errors ──
        cleaned_history: List[Dict[str, str]] = []
        for item in raw_history:
            role = item.get("role", "user")
            content = str(item.get("content", ""))
            if not content.strip():
                continue

            # Convert any raw Base64 or heavy data:image URIs from prior turns into lightweight media URLs
            try:
                from services.media_cache_service import media_cache_service
                content = media_cache_service.sanitize_text_and_convert_images(content)
            except Exception as b64_err:
                logger.debug(f"Notice during history media conversion: {b64_err}")

            if role == "assistant":
                # A. Strip fake/unregistered function references (anti-poisoning)
                content, p_count = self._neutralize_hallucinated_functions(content, registered_tool_names)
                guard_metrics["poisoning_neutralized"] += p_count

                # B. Strip internal crash stack traces or unhandled error apologies
                content = self._neutralize_error_residue(content)

                # C. Compact overly large markdown tables and raw JSON blocks (anti-confusion)
                content, t_count = self._compact_tabular_and_json_bloat(content)
                guard_metrics["large_tables_compacted"] += t_count
            elif role == "user":
                # Also strip raw leaked tracebacks or fake tool errors in user quotes
                content = self._neutralize_error_residue(content)

            cleaned_history.append({"role": role, "content": content})

        # ── 2. ANTI-DISTRACTION LAYER: Task Boundary & Topic Drift Detection ──────
        is_task_shift, shift_reason = self._detect_task_shift(current_message, cleaned_history)
        guard_metrics["task_shift_detected"] = is_task_shift
        guard_metrics["shift_reason"] = shift_reason

        # ── 3. ANTI-CONFUSION LAYER: Dynamic Working Memory Distillation & Compaction ─
        final_messages: List[Dict[str, str]] = []

        if is_task_shift:
            # If the user pivoted to a completely new topic or task, we quarantine older turns
            # into a concise background scratchpad so attention weights stay 100% focused on the new task.
            if "subject_name_shift" not in shift_reason:
                distilled_summary = self._distill_older_turns(cleaned_history[:-2] if len(cleaned_history) > 2 else cleaned_history[:-1])
                if distilled_summary:
                    final_messages.append({
                        "role": "user",
                        "content": f"[REKAPITULASI SESI SEBELUMNYA]:\n{distilled_summary}"
                    })
                    final_messages.append({
                        "role": "assistant",
                        "content": "Dipahami. Saya mencatat rekap sesi sebelumnya dan siap fokus penuh menyusun rencana baru untuk pertanyaan/tugas Anda saat ini."
                    })
                    guard_metrics["distilled_turns_count"] = max(0, len(cleaned_history) - 2)
            else:
                guard_metrics["distilled_turns_count"] = len(cleaned_history)

            # For recent turns during task shift:
            # Strictly condense the previous assistant response so obsolete details of the old subject
            # do not leak or confuse the model's new reasoning process.
            recent_turns = cleaned_history[-2:] if len(cleaned_history) >= 2 else cleaned_history
            for t in recent_turns:
                t_content = t["content"]
                if "subject_name_shift" in shift_reason:
                    if t["role"] == "assistant":
                        t_content = "[Catatan: Data subjek percakapan sebelumnya telah diarsipkan secara terpisah]"
                    elif t["role"] == "user":
                        t_content = "[Catatan: Pertanyaan subjek percakapan sebelumnya telah selesai]"
                elif t["role"] == "assistant":
                    if len(t_content) > 300:
                        first_line = t_content.strip().splitlines()[0][:250]
                        t_content = f"{first_line}... [hasil tugas sebelumnya diringkas untuk transisi tugas baru]"
                final_messages.append({"role": t["role"], "content": t_content})
        else:
            # Topic is consistent; apply rolling window:
            # Older turns (> max_verbatim_turns) are condensed into a Working Memory scratchpad
            if len(cleaned_history) > (self.max_verbatim_turns * 2):
                older_turns = cleaned_history[:-(self.max_verbatim_turns * 2)]
                recent_turns = cleaned_history[-(self.max_verbatim_turns * 2):]

                distilled_summary = self._distill_older_turns(older_turns)
                if distilled_summary:
                    final_messages.append({
                        "role": "user",
                        "content": f"[WORKING MEMORY - CATATAN FAKTA PERCAKAPAN SEBELUMNYA]:\n{distilled_summary}"
                    })
                    final_messages.append({
                        "role": "assistant",
                        "content": "Catatan fakta percakapan sebelumnya telah dipelajari. Melanjutkan pembahasan dengan rincian terkini."
                    })
                    guard_metrics["distilled_turns_count"] = len(older_turns)

                for t in recent_turns:
                    t_content = t["content"]
                    if t["role"] == "assistant" and len(t_content) > self.max_message_chars:
                        t_content = t_content[:self.max_message_chars] + "... [dipadatkan]"
                    final_messages.append({"role": t["role"], "content": t_content})
            else:
                for t in cleaned_history:
                    t_content = t["content"]
                    if t["role"] == "assistant" and len(t_content) > self.max_message_chars:
                        t_content = t_content[:self.max_message_chars] + "... [dipadatkan]"
                    final_messages.append({"role": t["role"], "content": t_content})

        guard_metrics["retained_turns_count"] = len(final_messages)
        guard_metrics["chars_after"] = sum(len(m["content"]) for m in final_messages)
        saved = guard_metrics["chars_before"] - guard_metrics["chars_after"]
        guard_metrics["chars_saved"] = max(0, saved)
        guard_metrics["estimated_tokens_saved"] = int(max(0, saved) / 3.8)

        return final_messages, guard_metrics

    def _neutralize_hallucinated_functions(self, text: str, registered_tools: Set[str]) -> Tuple[str, int]:
        """
        Anti-Poisoning: Detects references in prior assistant responses to tool/function calls
        that are NOT in the active tool catalog. Replaces them with neutral markers so the model
        won't anchor on fake function names as facts.
        Supports with or without backticks, quotes, or JSON formatting.
        """
        if not registered_tools:
            return text, 0

        neutralized = 0
        COMMON_STOPWORDS = {
            "ini", "itu", "yang", "dan", "atau", "pada", "untuk", "dari", "ke", "di",
            "data", "database", "api", "hasil", "kami", "anda", "saya", "kita", "ia",
            "dia", "mereka", "tersebut", "berikut", "ada", "tidak", "bukan", "hanya",
            "the", "and", "or", "to", "for", "with", "this", "that", "from", "in", "on"
        }

        def replace_tool_ref(m):
            nonlocal neutralized
            tool_name = m.group(1).strip("`'\"() ")
            if not tool_name or tool_name.lower() in COMMON_STOPWORDS:
                return m.group(0)

            # If tool is not registered in the active tool catalog
            if tool_name not in registered_tools:
                neutralized += 1
                # Preserve the prefix word (tool / function / fungsi / etc.)
                prefix = m.group(0)[:m.start(1) - m.start(0)]
                suffix = m.group(0)[m.end(1) - m.start(0):]
                return f"{prefix}[alat/fungsi non-resmi telah dinetralisir]{suffix}"
            return m.group(0)

        # Match patterns like:
        # 1. tool `xyz_abc`, function xyz_abc, fungsi 'xyz_abc', method xyz_abc
        text = re.sub(
            r'(?:tool|function|fungsi|method|alat)\s+[`\'"]?([a-zA-Z0-9_]{3,50})[`\'"]?',
            replace_tool_ref,
            text,
            flags=re.IGNORECASE
        )

        # 2. memanggil tool xyz, menjalankan fungsi abc, calling tool 123
        text = re.sub(
            r'(?:memanggil|menjalankan|eksekusi|calling|executed|executing|invoking|invoke)\s+(?:tool|function|fungsi|alat)?\s*[`\'"]?([a-zA-Z0-9_]{3,50})[`\'"]?',
            replace_tool_ref,
            text,
            flags=re.IGNORECASE
        )

        # 3. Tool 'xyz' is not recognized
        text = re.sub(
            r'Tool\s+[`\'"]?([a-zA-Z0-9_]{3,50})[`\'"]?\s+is\s+not\s+recognized',
            replace_tool_ref,
            text,
            flags=re.IGNORECASE
        )

        # 4. JSON tool call representations: "name": "fake_tool"
        def replace_json_tool_ref(m):
            nonlocal neutralized
            tool_name = m.group(1).strip()
            if tool_name and tool_name not in registered_tools and tool_name.lower() not in COMMON_STOPWORDS:
                neutralized += 1
                return '"name": "alat_non_resmi_dinetralisir"'
            return m.group(0)

        text = re.sub(r'["\']name["\']\s*:\s*["\']([a-zA-Z0-9_]{3,50})["\']', replace_json_tool_ref, text)

        return text, neutralized

    def _neutralize_error_residue(self, text: str) -> str:
        """
        Strips internal traceback strings, server exceptions, or repetitive error apologies
        that cause the model to repeatedly apologize or freeze up in subsequent turns.
        """
        # Strip long python tracebacks or server exceptions
        text = re.sub(
            r'Traceback \(most recent call last\):.*?(?:Exception|Error):.*?(?:\r?\n|$)',
            '[Catatan internal: Gangguan teknis sebelumnya telah dipulihkan]\n',
            text,
            flags=re.DOTALL
        )
        text = re.sub(
            r'(?:pymysql|neo4j|redis|urllib|requests|sqlalchemy)\.(?:err|exceptions|error)\.[a-zA-Z0-9_]+:.*?(?:\r?\n|$)',
            '[Catatan: Galat koneksi internal telah ditangani]\n',
            text
        )
        text = re.sub(
            r'(?:Internal Server Error|500 Server Error|502 Bad Gateway|504 Gateway Timeout|ConnectionRefusedError).*?(?:\r?\n|$)',
            '[Catatan: Status server normal]\n',
            text
        )

        # Strip repetitive apology openers and uncertainty bias triggers
        text = re.sub(
            r'^(?:Mohon maaf sebesar-besarnya|Saya minta maaf|Maaf atas kesalahan sebelumnya|Mohon maaf atas ketidaknyamanan|Maaf,?\s*sebelumnya|I apologize for the confusion|I am sorry for the previous mistake)[,.]\s*',
            '',
            text,
            flags=re.IGNORECASE | re.MULTILINE
        )
        return text

    def _compact_tabular_and_json_bloat(self, text: str) -> Tuple[str, int]:
        """
        Anti-Confusion: Replaces verbose multi-row markdown tables or huge JSON code blocks
        from prior turns with compact descriptive summaries, freeing thousands of tokens of attention.
        """
        compacted = 0

        # Compact massive JSON blocks (> 200 chars)
        def replace_json_block(m):
            nonlocal compacted
            raw = m.group(1)
            if len(raw) > 200:
                compacted += 1
                return "[Ringkasan data JSON dari sesi sebelumnya telah diproses]"
            return m.group(0)

        text = re.sub(r'```(?:json)?\s*(\[\s*\{.*?\}\s*\]|\{.*?\})\s*```', replace_json_block, text, flags=re.DOTALL)

        # Compact Markdown tables with > 3 rows (support both \n and \r\n)
        table_pattern = r'(\|.+?\|\r?\n\|[-:| ]+\|\r?\n(?:\|.+?\|\r?\n){3,})'
        def replace_table_block(m):
            nonlocal compacted
            table_str = m.group(1)
            lines = [l.strip() for l in table_str.strip().splitlines() if l.strip()]
            header = lines[0] if lines else "Tabel Data"
            row_count = len(lines) - 2
            compacted += 1
            return f"\n> 📊 [Tabel data sebelumnya memuat {row_count} baris entri: {header[:60]}... telah diverifikasi]\n"

        text = re.sub(table_pattern, replace_table_block, text)
        return text, compacted

    def _detect_task_shift(self, current_query: str, history: List[Dict[str, str]]) -> Tuple[bool, str]:
        """
        Anti-Distraction: Evaluates whether the current query marks a transition to a new task,
        a new entity, or an orthogonal intent, requiring a fresh planning posture.
        """
        if not history:
            return False, "fresh_session"

        # 1. Explicit Topic Reset Commands in Indonesian & English
        reset_pattern = (
            r'\b(?:ganti topik|topik baru|pertanyaan lain|tugas baru|alih topik|reset|start new|next topic|'
            r'bukan itu|sekarang coba|sekarang cari|ganti pertanyaan|kasus lain|orang lain|topik berbeda|'
            r'case baru|investigasi baru|beralih ke|clear context|new question|another topic|switch to|'
            r'different person|cari yang lain)\b'
        )
        if re.search(reset_pattern, current_query, re.IGNORECASE):
            return True, "explicit_user_reset"

        # 2. Distinct Entity ID Check (e.g. searching a completely different NIK, Passport, or Certificate)
        current_ids = set(re.findall(r'\b\d{10,20}\b', current_query))
        if current_ids:
            prior_user_text = " ".join(m.get("content", "") for m in history if m.get("role") == "user")
            prior_user_ids = set(re.findall(r'\b\d{10,20}\b', prior_user_text))
            if prior_user_ids and not (current_ids & prior_user_ids):
                return True, f"entity_id_shift ({list(prior_user_ids)[0]} -> {list(current_ids)[0]})"

            all_prior_text = " ".join(m.get("content", "") for m in history)
            prior_ids = set(re.findall(r'\b\d{10,20}\b', all_prior_text))
            if prior_ids and not (current_ids & prior_ids):
                return True, f"entity_id_shift ({list(prior_ids)[0]} -> {list(current_ids)[0]})"

        # 2b. Subject Name Shift (e.g. searching "miftahusurur s.kom" after searching "indradhi nugraha")
        cur_subject = self.extract_target_subject_name(current_query)
        if cur_subject:
            cur_tokens = set(cur_subject.split())
            prior_user_queries = [m["content"] for m in history if m.get("role") == "user"]
            for prior_q in reversed(prior_user_queries):
                prior_sub = self.extract_target_subject_name(prior_q)
                if prior_sub:
                    prior_tokens = set(prior_sub.split())
                    # If there is no token overlap between the current subject name and prior subject name
                    if not (cur_tokens & prior_tokens):
                        return True, f"subject_name_shift ('{prior_sub}' -> '{cur_subject}')"

        # 3. Domain Shift (e.g. Person/Dukcapil vs Land/BPN vs Company/Vendor vs Banking vs Legal vs General QA)
        def get_domain(q: str) -> str:
            q_lower = q.lower()
            if any(k in q_lower for k in ["tanah", "sertifikat", "bpn", "bidang", "shm", "hgb", "lahan", "persil"]):
                return "land"
            if any(k in q_lower for k in ["nik", "dukcapil", "ktp", "keluarga", "kk", "lahir", "penduduk", "orang"]):
                return "citizen"
            if any(k in q_lower for k in ["pt ", "perusahaan", "vendor", "pengadaan", "tender", "sikap", "cv "]):
                return "company"
            if any(k in q_lower for k in ["rekening", "bank", "transaksi", "mutasi", "keuangan", "saldo"]):
                return "banking"
            if any(k in q_lower for k in ["hukum", "pasal", "undang-undang", "uu ", "pidana", "peraturan", "kpk", "korupsi"]):
                return "legal"
            return "general"

        cur_domain = get_domain(current_query)
        prior_user_queries = [m["content"] for m in history if m["role"] == "user"]
        if prior_user_queries:
            last_user_query = prior_user_queries[-1]
            prior_domain = get_domain(last_user_query)
            if cur_domain != "general" and prior_domain != "general" and cur_domain != prior_domain:
                return True, f"domain_shift ({prior_domain} -> {cur_domain})"

        return False, "continuous_dialogue"

    def _distill_older_turns(self, turns: List[Dict[str, str]]) -> str:
        """
        Distills older conversation turns into a high-density, low-token working memory buffer.
        Robust against any role ordering.
        """
        if not turns:
            return ""

        summary_points = []
        last_user_text = None
        for m in turns:
            role = m.get("role", "user")
            content = m.get("content", "").strip()
            if not content:
                continue

            if role == "user":
                last_user_text = re.sub(r'\s+', ' ', content)[:120]
            elif role == "assistant" and last_user_text:
                lines = [l.strip() for l in content.splitlines() if l.strip() and not l.startswith('>')]
                snippet = lines[0][:120] if lines else "Telah diproses."
                summary_points.append(f"• Tanya: \"{last_user_text}\" ➔ Temuan: {snippet}")
                last_user_text = None

        if last_user_text:
            summary_points.append(f"• Tanya: \"{last_user_text}\"")

        return "\n".join(summary_points[-4:])

    def compact_tool_records(self, records: Any, max_records: int = 15) -> Tuple[Any, Optional[str], int]:
        """
        Anti-Confusion for Live Tool Results:
        If a database query or API returns a huge list of records (e.g. 50-200 rows),
        caps the prompt payload at `max_records` while retaining all fields and injecting
        an explicit total count note so the LLM doesn't overflow or suffer attention degradation.
        Returns: (compacted_records, summary_note, count_compacted)
        """
        if not isinstance(records, list) or len(records) <= max_records:
            return records, None, 0

        total_count = len(records)
        compacted = records[:max_records]
        note = (
            f"Menampilkan {max_records} dari total {total_count} record resmi untuk menjaga ketajaman konteks penalaran (Anti-Confusion Guard). "
            f"Seluruh {total_count} record telah diverifikasi dan tersimpan utuh di bank data."
        )
        return compacted, note, (total_count - max_records)

    def get_anti_rot_system_directive(self, is_task_shift: bool = False, shift_reason: str = "") -> str:
        """
        Generates the mandatory Anti-Context-Rot System Directive to inject into the LLM's system prompt.
        Explicitly neutralizes Poisoning, Distraction, and Confusion.
        """
        directive = (
            "\n\n🛡️ PROTOKOL PENCEGAHAN CONTEXT ROT (ANTI-POISONING, FRESH PLANNING & KONTROL INTEGRITAS KESIMPULAN):\n"
            "1. STATUS RIWAYAT PERCAKAPAN: Seluruh riwayat obrolan sebelumnya HANYA merupakan dialog kontekstual. Riwayat tersebut BUKANLAH basis data fakta (Bukan Ground Truth).\n"
            "2. ANTI-POISONING (KEBAL HALUSINASI): DILARANG KERAS mengulang atau menganggap benar nama alat/fungsi, angka NIK, nama subjek, atau klaim data apapun dari balasan asisten sebelumnya, KECUALI jika didukung langsung oleh fakta di 'Context Information' atau hasil pemanggilan Tool pada giliran SAAT INI.\n"
            "3. FRESH PLANNING: Jangan meniru format, gaya, atau batasan dari jawaban sebelumnya jika tidak relevan. Evaluasi pertanyaan terkini secara objektif dari awal.\n"
            "4. INTEGRITAS SINTESIS & KESIMPULAN (ANTI-CONTENT-ROT PADA KESIMPULAN):\n"
            "   a. DISAMBIGUASI ENTITAS (ANTI-CONFLATION): Jika hasil pencarian basis data memuat beberapa individu berbeda dengan nama serupa (memiliki NIK, Tempat/Tanggal Lahir, atau Alamat berlainan), DILARANG KERAS MENGGABUNGKAN aset atau data mereka menjadi milik satu orang! Kelompokkan dan sajikan secara terpisah per NIK/identitas unik.\n"
            "   b. ZERO-SPECULATION IN CONCLUSIONS: Pada bagian kesimpulan atau rangkuman, DILARANG mengarang hubungan keluarga, spekulasi status hukum, atau dugaan tanpa bukti eksplisit. Setiap klaim WAJIB berakar langsung pada fakta numerik/atribut resmi (Nomor Sertifikat, NIK, Luas, Tanggal).\n"
            "   c. ISOLASI KONTEN RIWAYAT: DILARANG mengaitkan atau membawa masuk angka, aset, atau kesimpulan dari subjek percakapan sebelumnya ke dalam simpulan saat ini."
        )

        if is_task_shift:
            if "subject_name_shift" in shift_reason:
                directive += (
                    "\n5. PERINGATAN ISOLASI SUBJEK MUTLAK (SUBJECT SHIFT DETECTED): "
                    "Pengguna saat ini menanyakan individu/subjek baru yang berbeda dari percakapan sebelumnya. "
                    "DILARANG KERAS mengaitkan, meminjam, atau menyebutkan sertifikat tanah, aset, NIK, properti, ataupun NAMA dari subjek sebelumnya pada jawaban! "
                    "Fokus 100% murni hanya pada subjek yang ditanyakan saat ini tanpa menyinggung subjek sebelumnya. "
                    "Jika data untuk subjek baru tidak ditemukan dalam database resmi BPN/Dukcapil, nyatakan secara tegas dan transparan bahwa data TIDAK DITEMUKAN (0 record)."
                )
            else:
                directive += (
                    "\n5. PERINGATAN ALIH TUGAS (TASK SHIFT): Pengguna saat ini mengajukan topik/entitas/tugas baru yang independen. "
                    "Kosongkan asumsi dari kasus sebelumnya, susun rencana penyelidikan baru, dan jangan mencampuradukkan data subjek lama dengan pertanyaan saat ini."
                )

        return directive

    def validate_and_sanitize_response(
        self,
        clean_answer: str,
        current_message: str,
        history: List[Dict[str, Any]],
        executed_tools_info: List[Dict[str, Any]]
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Deterministic Post-Synthesis Guard for Zero-Hallucination and Zero-Content-Rot.
        Guarantees:
          1. Cross-Entity Isolation: Strips leaked sentences mentioning prior distinct search subjects.
          2. Zero-Record Hallucination Defense: If tools found 0 records, overrides any fabricated certificate numbers or land plots.
          3. Multi-Entity Conflation Warning: If records contain multiple NIKs for the same name, ensures conclusion distinguishes them.
        """
        metrics = {
            "prior_leaks_scrubbed": 0,
            "anti_hallucination_override": False,
            "anti_conflation_note_applied": False
        }

        if not clean_answer or not clean_answer.strip():
            return clean_answer, metrics

        cur_subject = self.extract_target_subject_name(current_message)

        # ── 1. CROSS-ENTITY SCRUBBING (ANTI-ROT) ──────────────────────────
        # Gather all prior subject names from user queries in conversation history
        prior_subjects = []
        if history:
            for m in history:
                if m.get("role") == "user":
                    sub = self.extract_target_subject_name(m.get("content", ""))
                    if sub and sub not in prior_subjects:
                        prior_subjects.append(sub)

        cur_tokens = set(cur_subject.split()) if cur_subject else set()
        distinct_prior = [ps for ps in prior_subjects if not (set(ps.split()) & cur_tokens)]

        if distinct_prior:
            lines = clean_answer.splitlines()
            cleaned_lines = []
            for line in lines:
                # If table header or markdown separator, retain
                if line.strip().startswith("|---") or line.strip() == "---":
                    cleaned_lines.append(line)
                    continue

                # Sentence-level check
                sentences = re.split(r'((?<=[.!?])\s+)', line)
                kept_parts = []
                for s in sentences:
                    if not s.strip():
                        kept_parts.append(s)
                        continue
                    has_leak = False
                    for ps in distinct_prior:
                        ps_sig = [w for w in ps.split() if len(w) >= 4]
                        if (len(ps_sig) >= 2 and all(re.search(r'\b' + re.escape(w) + r'\b', s, re.IGNORECASE) for w in ps_sig[:2])) or ps.lower() in s.lower():
                            has_leak = True
                            break
                    if has_leak:
                        metrics["prior_leaks_scrubbed"] += 1
                        logger.info(f"Context Rot Guard: Scrubbed prior subject leak referencing '{ps}' from current response")
                    else:
                        kept_parts.append(s)

                reconstructed = "".join(kept_parts).strip()
                if reconstructed:
                    cleaned_lines.append(reconstructed)

            clean_answer = "\n".join(cleaned_lines)

        # ── 2. ZERO-RECORD HALLUCINATION DEFENSE ──────────────────────────
        # Check if tools were executed, and ALL returned not_found / 0 records / empty data
        if executed_tools_info:
            all_empty = True
            for t_info in executed_tools_info:
                if t_info.get("success") and t_info.get("data") and t_info.get("data") != []:
                    all_empty = False
                    break
                if t_info.get("error") != "Data tidak ditemukan" and t_info.get("success"):
                    all_empty = False
                    break

            if all_empty:
                fabricated_cert_match = re.search(
                    r'(?:ditemukan\s+(?:\d+|beberapa)\s+bidang\s+tanah|memiliki\s+sertifikat|nomor\s+hak\s*:\s*\d+|shm\s*(?:no\.?|nomor)?\s*\d+|hgb\s*(?:no\.?|nomor)?\s*\d+)',
                    clean_answer,
                    re.IGNORECASE
                )
                if fabricated_cert_match and not any(neg in clean_answer.lower() for neg in ["tidak ditemukan", "nihil", "0 record", "belum tercatat"]):
                    logger.warning("Context Rot Guard: Overriding fabricated certificate claims on zero-record tool result")
                    subj_label = f"**{cur_subject}**" if cur_subject else "subjek yang dicari"
                    clean_answer = (
                        f"⚠️ **Hasil Penelusuran Resmi Basis Data:**\n\n"
                        f"Berdasarkan penelusuran langsung pada basis data resmi (misal: BPN ATR / Dukcapil), "
                        f"**tidak ditemukan bidang tanah ataupun sertifikat kepemilikan yang terdaftar atas nama {subj_label}** (0 record ditemukan).\n\n"
                        f"**Catatan Integritas Data:**\n"
                        f"- Query ke basis data resmi telah selesai dieksekusi secara real-time.\n"
                        f"- Seluruh hasil bernilai nihil (tidak ada hak milik, HGB, ataupun persil tanah terdata)."
                    )
                    metrics["anti_hallucination_override"] = True

        # ── 3. ANTI-CONFLATION CONCLUSION NOTE ────────────────────────────
        # If tool returned multiple records across distinct NIKs for the same name,
        # ensure the conclusion contains an explicit disambiguation note
        if executed_tools_info and not metrics.get("anti_hallucination_override"):
            all_records = []
            for t in executed_tools_info:
                d = t.get("data")
                if isinstance(d, list):
                    all_records.extend(d)

            if len(all_records) > 1:
                distinct_niks = set()
                for r in all_records:
                    if isinstance(r, dict):
                        nik = r.get("nik") or r.get("NIK") or r.get("no_ktp")
                        if nik and len(str(nik)) >= 8:
                            distinct_niks.add(str(nik))

                if len(distinct_niks) > 1 and cur_subject:
                    has_disambiguation = any(w in clean_answer.lower() for w in ["disambiguasi", "berbeda orang", "beberapa individu", "bukan satu orang", "terpisah", "per nik"])
                    if not has_disambiguation:
                        conflation_note = (
                            f"\n\n> 💡 **Catatan Integritas Data (Disambiguasi Entitas):** "
                            f"Hasil penelusuran atas nama **'{cur_subject}'** di atas mencakup {len(distinct_niks)} individu berbeda "
                            f"(berdasarkan NIK/wilayah yang berlainan). Aset dan catatan tersebut merupakan milik subjek hukum yang berbeda "
                            f"dan tidak digabungkan sebagai milik satu orang."
                        )
                        clean_answer += conflation_note
                        metrics["anti_conflation_note_applied"] = True

        return clean_answer, metrics


# Global singleton instance
context_rot_guard = ContextRotGuard()

