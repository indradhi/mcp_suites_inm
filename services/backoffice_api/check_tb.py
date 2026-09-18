from database import SessionLocal
from services.llm_service import llm_service

db = SessionLocal()
api_base, api_key, model = llm_service.get_task_backend("general_qa", db)
print("api_base:", api_base)
print("model:", model)
