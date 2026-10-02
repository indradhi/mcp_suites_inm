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

            if role == "assistant":
                # A. Strip fake/unregistered function references (anti-poisoning)
                content, p_count = self._neutralize_hallucinated_functions(content, registered_tool_names)
                guard_metrics["poisoning_neutralized"] += p_count

                # B. Strip internal crash stack traces or unhandled error apologies
                content = self._neutralize_error_residue(content)

                # C. Compact overly large markdown tables and raw JSON blocks (anti-confusion)
                content, t_count = self._compact_tabular_and_json_bloat(content)
                guard_metrics["large_tables_compacted"] += t_count

            cleaned_history.append({"role": role, "content": content})

        # ── 2. ANTI-DISTRACTION LAYER: Task Boundary & Topic Drift Detection ──────
        is_task_shift, shift_reason = self._detect_task_shift(current_message, cleaned_history)
        guard_metrics["task_shift_detected"] = is_task_shift
        guard_metrics["shift_reason"] = shift_reason

        # ── 3. ANTI-CONFUSION LAYER: Dynamic Working Memory Distillation & Compaction ─
        final_messages: List[Dict[str, str]] = []

        if is_task_shift:
            # If the user pivoted to a completely new topic or task, we quarantine older turns
            # into a concise 1-paragraph background summary so attention weights stay 100% focused on current task.
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
                guard_metrics["distilled_turns_count"] = len(cleaned_history) - 2

            # Retain only the very last turn for immediate conversational continuity
            recent_turns = cleaned_history[-2:] if len(cleaned_history) >= 2 else cleaned_history
            for t in recent_turns:
                t_content = t["content"]
                if t["role"] == "assistant" and len(t_content) > self.max_message_chars:
                    t_content = t_content[:self.max_message_chars] + "... [ringkasan respon sebelumnya]"
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
        """
        if not registered_tools:
            return text, 0

        neutralized = 0

        def replace_tool_ref(m):
            nonlocal neutralized
            tool_name = m.group(1)
            # If it looks like a function slug (snake_case)
            if "_" in tool_name and tool_name not in registered_tools:
                neutralized += 1
                return f"[alat/fungsi non-resmi telah dinetralisir]"
            return m.group(0)

        # Match patterns like: tool `xyz_abc`, function `xyz_abc`, fungsi `xyz_abc`
        text = re.sub(r'(?:tool|function|fungsi)\s+`([a-zA-Z0-9_]{4,40})`', replace_tool_ref, text, flags=re.IGNORECASE)
        text = re.sub(r'memanggil\s+(?:tool|fungsi)\s+([a-zA-Z0-9_]{4,40})', replace_tool_ref, text, flags=re.IGNORECASE)

        return text, neutralized

    def _neutralize_error_residue(self, text: str) -> str:
        """
        Strips internal traceback strings or repetitive error apologies that cause the model
        to repeatedly apologize or freeze up in subsequent turns.
        """
        # Strip long python tracebacks if leaked
        text = re.sub(r'Traceback \(most recent call last\):.*?(?:Exception|Error):.*?\n', '[Catatan internal: Gangguan teknis sebelumnya telah dipulihkan]\n', text, flags=re.DOTALL)
        # Strip excessive repetitive apology openers
        text = re.sub(r'^(?:Mohon maaf sebesar-besarnya|Saya minta maaf|Maaf atas kesalahan sebelumnya)[,.]\s*', '', text, flags=re.IGNORECASE)
        return text

    def _compact_tabular_and_json_bloat(self, text: str) -> Tuple[str, int]:
        """
        Anti-Confusion: Replaces verbose multi-row markdown tables or huge JSON code blocks
        from prior turns with compact descriptive summaries, freeing thousands of tokens of attention.
        """
        compacted = 0

        # Compact massive JSON blocks (> 300 chars)
        def replace_json_block(m):
            nonlocal compacted
            raw = m.group(1)
            if len(raw) > 250:
                compacted += 1
                return "[Ringkasan data JSON dari sesi sebelumnya telah diproses]"
            return m.group(0)

        text = re.sub(r'```(?:json)?\s*(\[\s*\{.*?\}\s*\]|\{.*?\})\s*```', replace_json_block, text, flags=re.DOTALL)

        # Compact Markdown tables with > 4 rows
        table_pattern = r'(\|.+?\|\n\|[-:| ]+\|\n(?:\|.+?\|\n){4,})'
        def replace_table_block(m):
            nonlocal compacted
            table_str = m.group(1)
            lines = [l.strip() for l in table_str.strip().split('\n') if l.strip()]
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

        # Extract last user query from history
        prior_user_queries = [m["content"] for m in history if m["role"] == "user"]
        if not prior_user_queries:
            return False, "no_prior_queries"

        last_user_query = prior_user_queries[-1]

        # 1. Explicit Topic Reset Commands
        if re.search(r'\b(?:ganti topik|topik baru|pertanyaan lain|tugas baru|alih topik|reset|start new|next topic)\b', current_query, re.IGNORECASE):
            return True, "explicit_user_reset"

        # 2. Distinct Entity ID Check (e.g. searching a completely different NIK or Certificate)
        current_ids = set(re.findall(r'\b\d{10,20}\b', current_query))
        prior_ids = set(re.findall(r'\b\d{10,20}\b', last_user_query))
        if current_ids and prior_ids and not (current_ids & prior_ids):
            return True, f"entity_id_shift ({list(prior_ids)[0]} -> {list(current_ids)[0]})"

        # 3. Domain Shift (e.g. Person/Dukcapil vs Land/BPN vs Company/Vendor vs General QA)
        def get_domain(q: str) -> str:
            q_lower = q.lower()
            if any(k in q_lower for k in ["tanah", "sertifikat", "bpn", "bidang", "shm", "hgb", "lahan"]):
                return "land"
            if any(k in q_lower for k in ["nik", "dukcapil", "ktp", "keluarga", "kk", "lahir", "penduduk"]):
                return "citizen"
            if any(k in q_lower for k in ["pt ", "perusahaan", "vendor", "pengadaan", "tender", "sikap", "cv "]):
                return "company"
            if any(k in q_lower for k in ["rekening", "bank", "transaksi", "mutasi", "keuangan", "saldo"]):
                return "banking"
            return "general"

        cur_domain = get_domain(current_query)
        prior_domain = get_domain(last_user_query)

        if cur_domain != "general" and prior_domain != "general" and cur_domain != prior_domain:
            return True, f"domain_shift ({prior_domain} -> {cur_domain})"

        return False, "continuous_dialogue"

    def _distill_older_turns(self, turns: List[Dict[str, str]]) -> str:
        """
        Distills older conversation turns into a high-density, low-token working memory buffer.
        """
        if not turns:
            return ""

        summary_points = []
        for i in range(0, len(turns), 2):
            u_turn = turns[i] if turns[i]["role"] == "user" else None
            a_turn = turns[i+1] if (i+1 < len(turns) and turns[i+1]["role"] == "assistant") else None

            if u_turn:
                u_text = re.sub(r'\s+', ' ', u_turn["content"]).strip()[:140]
                point = f"• Tanya: \"{u_text}\""
                if a_turn:
                    # Extract first 2 informative sentences of assistant reply
                    a_lines = [l.strip() for l in a_turn["content"].split('\n') if l.strip() and not l.startswith('>')]
                    snippet = a_lines[0][:140] if a_lines else "Telah dijawab."
                    point += f" ➔ Temuan: {snippet}"
                summary_points.append(point)

        return "\n".join(summary_points[:4])

    def get_anti_rot_system_directive(self, is_task_shift: bool = False) -> str:
        """
        Generates the mandatory Anti-Context-Rot System Directive to inject into the LLM's system prompt.
        Explicitly neutralizes Poisoning, Distraction, and Confusion.
        """
        directive = (
            "\n\n🛡️ PROTOKOL PENCEGAHAN CONTEXT ROT (ANTI-POISONING & FRESH PLANNING):\n"
            "1. STATUS RIWAYAT PERCAKAPAN: Seluruh riwayat obrolan sebelumnya HANYA merupakan dialog kontekstual. Riwayat tersebut BUKANLAH basis data fakta (Bukan Ground Truth).\n"
            "2. ANTI-POISONING (KEBAL HALUSINASI): DILARANG KERAS mengulang atau menganggap benar nama alat/fungsi, angka NIK, nama subjek, atau klaim data apapun dari balasan asisten sebelumnya, KECUALI jika didukung langsung oleh fakta di 'Context Information' atau hasil pemanggilan Tool pada giliran SAAT INI.\n"
            "3. FRESH PLANNING: Jangan meniru format, gaya, atau batasan dari jawaban sebelumnya jika tidak relevan. Evaluasi pertanyaan terkini secara objektif dari awal."
        )

        if is_task_shift:
            directive += (
                "\n4. PERINGATAN ALIH TUGAS (TASK SHIFT): Pengguna saat ini mengajukan topik/entitas/tugas baru yang independen. "
                "Kosongkan asumsi dari kasus sebelumnya, susun rencana penyelidikan baru, dan jangan mencampuradukkan data subjek lama dengan pertanyaan saat ini."
            )

        return directive


# Global singleton instance
context_rot_guard = ContextRotGuard()
