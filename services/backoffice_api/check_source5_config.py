from database import SessionLocal
from models.knowledge_source import KnowledgeSource
import json

db = SessionLocal()
s5 = db.query(KnowledgeSource).filter(KnowledgeSource.id == 5).first()
if s5:
    print("Source 5 config:")
    print(json.dumps(s5.config, indent=2))
