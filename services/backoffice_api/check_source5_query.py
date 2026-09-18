from database import SessionLocal
from models.knowledge_source import KnowledgeSource
import json

db = SessionLocal()
s5 = db.query(KnowledgeSource).filter(KnowledgeSource.id == 5).first()
if s5:
    cfg = s5.config or {}
    print("Tool name:", cfg.get("tool_name"))
    print("Query:", cfg.get("query"))
    print("Parameters:", cfg.get("parameters"))
