from services.vector_store import vector_store

query = "cari data kk 3603281409090014"
chunks = vector_store.query_similarity(query, n_results=5)

print(f"Total chunks retrieved: {len(chunks)}")
for idx, c in enumerate(chunks):
    print(f"\n--- Result {idx}: {c.get('id')} (score={c.get('score')}) ---")
    doc = c.get("content", "")
    lines = doc.split("\n")
    for l in lines:
        if "3603281409090014" in l:
            print("  MATCH KK LINE:", l[:150], "...")
        if "TIKTIK" in l or "INDRADHI" in l:
            print("  PERSON LINE:", l[:150], "...")
