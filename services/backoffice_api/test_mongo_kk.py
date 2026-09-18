from pymongo import MongoClient

client = MongoClient("mongodb://192.168.1.30:27017/?authSource=admin")
db = client["dblake"]
coll = db["orang_api_dukcapil"]

# Test querying by NO_KK
kk = "3603281409090014"
recs = list(coll.find({"NO_KK": kk}))
print(f"Found {len(recs)} records in MongoDB for NO_KK {kk}:")
for r in recs:
    print(f"  NIK: {r.get('NIK')}, NAMA: {r.get('NAMA_LGKP')}, STAT_HBKEL: {r.get('STAT_HBKEL')}, HUB: {r.get('STATUS_KAWIN')}")
