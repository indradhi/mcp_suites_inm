from database import SessionLocal
from services.vector_store import vector_store
import re

db = SessionLocal()
message = "cari data kartu keluarga 3603281409090014"
retrieved_chunks = vector_store.query_similarity(message, n_results=5)
print(f"Retrieved {len(retrieved_chunks)} chunks.")

MAX_CHUNK_CHARS = 12000
MAX_TOTAL_CONTEXT_CHARS = 35000
accumulated_chars = 0
context_parts = []

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
name_m = re.search(r"(?:atas\s+nama|dengan\s+nama|bernama|nama|subjek|orang)\s+([a-zA-Z\s]{4,})", message, re.IGNORECASE)
if name_m:
    extracted_name = " ".join([w for w in name_m.group(1).split() if w.lower() not in stopwords])
    if len(extracted_name) >= 3:
        centering_targets.append(extracted_name.upper())

sig_tokens_sorted = sorted(sig_tokens, key=lambda x: len(x), reverse=True)
for st in sig_tokens_sorted:
    if st.upper() not in centering_targets:
        centering_targets.append(st.upper())
for at in all_tokens:
    if at.upper() not in centering_targets:
        centering_targets.append(at.upper())

print("Centering targets:", centering_targets)

for idx, c in enumerate(retrieved_chunks, start=1):
    src_name = c.get("metadata", {}).get("source_name", "Knowledge Base")
    score = c.get("score", 0.0)
    raw_content = c.get("content", "").strip()

    chunk_excerpt = raw_content
    kw_pos = -1
    for w in centering_targets:
        p = raw_content.upper().find(w.upper())
        if p != -1:
            kw_pos = p
            break

    if kw_pos != -1 and (len(raw_content) > MAX_CHUNK_CHARS or kw_pos > 800):
        start_pos = max(0, kw_pos - 150)
        rec_break = raw_content.rfind("\n", max(0, start_pos - 200), start_pos + 1)
        if rec_break != -1:
            start_pos = rec_break + 1
        end_pos = min(len(raw_content), start_pos + MAX_CHUNK_CHARS)
        chunk_excerpt = ("... " if start_pos > 0 else "") + raw_content[start_pos:end_pos]
        if end_pos < len(raw_content):
            chunk_excerpt += "... [truncated for length]"
    elif len(raw_content) > MAX_CHUNK_CHARS:
        end_pos = min(len(raw_content), MAX_CHUNK_CHARS)
        chunk_excerpt = raw_content[:end_pos]
        if end_pos < len(raw_content):
            chunk_excerpt += "... [truncated for length]"

    chunk_entry = f"[Document {idx}] (Source: {src_name} | Match: {score}):\n{chunk_excerpt}\n"
    print(f"\nDocument {idx}: len={len(chunk_entry)}")
    if "INDRADHI" in chunk_excerpt:
        print(f"  -> Contains INDRADHI")
    if "TIKTIK" in chunk_excerpt:
        print(f"  -> Contains TIKTIK")

    if accumulated_chars + len(chunk_entry) <= MAX_TOTAL_CONTEXT_CHARS:
        context_parts.append(chunk_entry)
        accumulated_chars += len(chunk_entry)
    else:
        print(f"  -> DROPPED/CUT OFF due to accumulated_chars ({accumulated_chars} + {len(chunk_entry)} > {MAX_TOTAL_CONTEXT_CHARS})")

print(f"\nTotal accumulated_chars in context: {accumulated_chars}")
