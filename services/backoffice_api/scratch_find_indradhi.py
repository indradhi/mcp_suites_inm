from database import SessionLocal
from models.knowledge_source import KnowledgeSource
from services.vector_store import vector_store
from services.graph.neo4j_client import neo4j_client
import json

db = SessionLocal()
sources = db.query(KnowledgeSource).all()
print("=== KNOWLEDGE SOURCES ===")
for s in sources:
    print(f"ID={s.id}, Name='{s.name}', Type='{s.source_type}', is_tool={bool((s.config or {}).get('is_tool'))}")

print("\n=== CHROMA DB SEARCH ===")
col = vector_store.get_collection()
try:
    res = col.get(where_document={"$contains": "indradhi"})
    print("Chroma contains 'indradhi' matches:", len(res['ids']) if res and 'ids' in res else 0)
    if res and res['ids']:
        for doc, meta in zip(res['documents'][:3], res['metadatas'][:3]):
            print(f"  Source ID: {meta.get('source_id')}, meta: {meta}")
            print(f"  Content snippet: {doc[:200]}")
except Exception as e:
    print("Error querying Chroma by document content:", e)

# Also try lowercase and uppercase
try:
    res2 = col.get(where_document={"$contains": "INDRADHI"})
    print("Chroma contains 'INDRADHI' matches:", len(res2['ids']) if res2 and 'ids' in res2 else 0)
    if res2 and res2['ids']:
        for doc, meta in zip(res2['documents'][:3], res2['metadatas'][:3]):
            print(f"  Source ID: {meta.get('source_id')}, meta: {meta}")
            print(f"  Content snippet: {doc[:200]}")
except Exception as e:
    print("Error querying Chroma by document content uppercase:", e)

print("\n=== NEO4J SEARCH ===")
try:
    records = neo4j_client.execute_read("MATCH (e:Entity) WHERE toLower(e.name) CONTAINS 'indradhi' RETURN e.name, e.type, e.description", {})
    print("Neo4j entities:", records)
except Exception as e:
    print("Neo4j error:", e)
