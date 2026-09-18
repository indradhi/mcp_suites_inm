from database import SessionLocal
from services.vector_store import vector_store

message = "cari data kartu keluarga 3603281409090014"
retrieved_chunks = vector_store.query_similarity(message, n_results=5)

for idx, c in enumerate(retrieved_chunks, start=1):
    content = c.get("content", "")
    print(f"\nChunk {idx}: ID={c.get('id')}, len={len(content)}")
    if "3603281409090014" in content:
        print("  -> Contains KK: 3603281409090014")
    if "TIKTIK" in content:
        print("  -> Contains TIKTIK")
    if "INDRADHI" in content:
        print("  -> Contains INDRADHI")
