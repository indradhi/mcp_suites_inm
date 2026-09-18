from database import SessionLocal
from models.knowledge_source import KnowledgeSource

db = SessionLocal()
sources = db.query(KnowledgeSource).filter(KnowledgeSource.source_type.in_(["database", "api"])).all()
for s in sources:
    cfg = s.config or {}
    print(f"ID: {s.id}, Name: '{s.name}', is_tool={cfg.get('is_tool')}, tool_name={cfg.get('tool_name')}")
    if cfg.get("parameters"):
        print("  Params:", [p.get("name") for p in cfg.get("parameters")])
