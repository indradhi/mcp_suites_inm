from services.vector_store import vector_store

coll = vector_store.get_collection()
kw = "3603281409090014"

# If limit = 10
res = coll.get(where_document={"$contains": kw}, limit=10)
print(f"Total chunks retrieved with limit=10: {len(res['ids'])}")
for cid, doc in zip(res["ids"], res["documents"]):
    print(f"ID: {cid}")
    for l in doc.split("\n"):
        if "NAMA_LGKP:" in l:
            print("  ", l[:80])
