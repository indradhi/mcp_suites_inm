from services.vector_store import vector_store
import re

coll = vector_store.get_collection()
query = "cari data kartu keluarga 3603281409090014"
n_results = 8

# Let's test the improved keyword retrieval logic
id_matches = re.findall(r'\b\d{6,20}\b', query)
print("ID matches:", id_matches)

exact_matched_chunks = []
seen_ids = set()
seen_niks = set()

for kw in id_matches:
    kw_res = coll.get(where_document={"$contains": kw}, limit=15)
    for cid, doc, meta in zip(kw_res["ids"], kw_res["documents"], kw_res.get("metadatas", [])):
        # Extract NIK
        nik_m = re.search(r'NIK:\s*(\d+)', doc)
        nik = nik_m.group(1) if nik_m else cid
        name_m = re.search(r'NAMA_LGKP:\s*([^\n|]+)', doc)
        name = name_m.group(1).strip() if name_m else "Unknown"

        # Check if we already have this exact NIK from bank data
        is_dup = nik in seen_niks and cid.startswith("bank_")
        if not is_dup:
            seen_niks.add(nik)
            exact_matched_chunks.append({
                "id": cid,
                "name": name,
                "nik": nik,
                "content_len": len(doc)
            })

print(f"Retrieved {len(exact_matched_chunks)} distinct chunks:")
for c in exact_matched_chunks:
    print(f"  CID: {c['id']}, Name: {c['name']}, NIK: {c['nik']}")
