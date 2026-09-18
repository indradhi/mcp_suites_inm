from services.vector_store import vector_store

coll = vector_store.get_collection()
res = coll.get(include=["documents", "metadatas"])

print(f"Total documents in ChromaDB: {len(res['ids'])}")

kk_chunks = []
for doc_id, doc, meta in zip(res["ids"], res["documents"], res["metadatas"]):
    if "3603281409090014" in doc:
        kk_chunks.append((doc_id, len(doc), meta))
        print(f"Found KK in chunk: {doc_id} (len={len(doc)})")
        lines = doc.split("\n")
        for l in lines:
            if "NAMA_LGKP:" in l:
                print("   ", l[:80])

print(f"Total chunks containing KK: {len(kk_chunks)}")
