from database import SessionLocal
from services.chat_service import chat_service
import json

db = SessionLocal()

def test_query(label, source_ids):
    print(f"\n==========================================")
    print(f"TEST: {label} (source_ids={source_ids})")
    print(f"==========================================")
    res = chat_service.chat_with_knowledge(
        message="siapa indradhi nugraha mulyanto?",
        source_ids=source_ids,
        source_id=source_ids[0] if source_ids and len(source_ids) == 1 else None,
        top_k=5,
        db=db
    )
    print(f"Chunks retrieved: {len(res['sources'])}")
    for idx, s in enumerate(res['sources']):
        meta = s.get('metadata', {})
        print(f"  [{idx+1}] Score: {s.get('score')} | Source ID: {meta.get('source_id')} | Name: {meta.get('source_name')} | Content snippet: {s.get('content')[:120]}")
    print(f"Entities retrieved: {len(res['entities'])}")
    for e in res['entities']:
        print(f"  Entity: {e.get('name')} ({e.get('type')})")
    print(f"Tools executed: {len(res['tools_executed'])}")
    print(f"Answer snippet: {res['answer'][:300]}")

test_query("All sources (source_ids=None)", None)
test_query("Source 7 only (Dukcapil API KB)", [7])
test_query("Source 7 and Source 5", [7, 5])
test_query("Source 7 and Source 2", [7, 2])
test_query("Source 5 only (Tool mode)", [5])
