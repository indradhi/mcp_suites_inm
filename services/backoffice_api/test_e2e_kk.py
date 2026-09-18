from services.chat_service import chat_service
from database import SessionLocal

db = SessionLocal()

queries = [
    "cari data kartu keluarga 3603281409090014",
    "cari data kk 3603281409090014"
]

for q in queries:
    print(f"\n==================== QUERY: {q} ====================")
    resp = chat_service.chat_with_knowledge(
        message=q,
        history=[],
        top_k=5,
        db=db
    )
    ans = resp.get("answer", "")
    print(ans)
