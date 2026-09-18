from services.chat_service import chat_service
from database import SessionLocal

db = SessionLocal()

prompts = [
    "cari data kk 3603281409090014",
    "cari data kartu keluarga 3603281409090014",
    "cari data dengan nomor kk 3603281409090014",
    "tolong cari data kk 3603281409090014",
    "cari data orang dengan nomor kk 3603281409090014"
]

for p in prompts:
    print(f"\n==================== PROMPT: '{p}' ====================")
    resp = chat_service.chat_with_knowledge(
        message=p,
        history=[],
        top_k=5,
        db=db
    )
    ans = resp.get("answer", "")
    print(f"Answer length: {len(ans)}")
    print(ans[:400])
    print("...")
    print(ans[-400:])
    has_tiktik = "TIKTIK" in ans.upper()
    has_indradhi = "INDRADHI" in ans.upper()
    print(f"Has Indradhi: {has_indradhi}, Has Tiktik: {has_tiktik}")
