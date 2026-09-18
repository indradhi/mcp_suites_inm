from services.chat_service import chat_service
from database import SessionLocal

db = SessionLocal()

query = "cari data kk 3603281409090014"
resp = chat_service.chat_with_knowledge(
    message=query,
    history=[],
    top_k=5,
    db=db
)

print("=== TOOLS EXECUTED ===")
for t in resp.get("tools_executed", []):
    print("Tool:", t.get("tool_name"))
    print("Args:", t.get("arguments"))
    data = t.get("data")
    if isinstance(data, list):
        print(f"Data list length: {len(data)}")
        for idx, item in enumerate(data):
            if isinstance(item, dict):
                print(f"  Item {idx}: NIK={item.get('NIK')}, NAMA={item.get('NAMA_LGKP')}, STAT_HBKEL={item.get('STAT_HBKEL')}")
    elif isinstance(data, dict):
        print(f"Data dict keys: {data.keys()}")

print("\n=== ANSWER ===")
print(resp.get("answer"))
