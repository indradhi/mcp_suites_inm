from services.chat_service import chat_service
from database import SessionLocal

db = SessionLocal()
resp = chat_service.chat_with_knowledge(
    message="cari data kartu keluarga 3603281409090014",
    history=[],
    top_k=5,
    db=db
)
ans = resp.get("answer", "")
print("=== FULL ANSWER ===")
print(ans)
