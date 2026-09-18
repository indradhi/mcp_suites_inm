from services.vector_store import vector_store

coll = vector_store.get_collection()
res = coll.get(ids=["bank_src_5_283792a617fa", "bank_src_5_41617c374027"])
for cid, doc in zip(res["ids"], res["documents"]):
    print(f"\nID: {cid}, len={len(doc)}")
    print(doc[:300])
