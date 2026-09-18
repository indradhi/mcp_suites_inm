from database import SessionLocal
from models.chat import ChatMessage, ChatSession

db = SessionLocal()
sessions = db.query(ChatSession).order_by(ChatSession.updated_at.desc()).limit(5).all()
for s in sessions:
    print(f"\nSession ID: {s.id}, Title: {s.title}, Updated: {s.updated_at}")
    msgs = db.query(ChatMessage).filter(ChatMessage.session_id == s.id).order_by(ChatMessage.created_at.desc()).limit(4).all()
    for m in reversed(msgs):
        print(f"  [{m.role.upper()}]: {m.content[:200]}...")
        if m.role == "assistant":
            print(f"    Full assistant len: {len(m.content)}")
            print(f"    Last 300 chars: {m.content[-300:]}")
