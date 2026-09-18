from database import SessionLocal
from models.llm_backend import LLMBackend

db = SessionLocal()
b = db.query(LLMBackend).filter(LLMBackend.id == 1).first()
if b:
    print("Backend 1 api_base:", b.api_base)
    print("Backend 1 models:", b.available_models)
