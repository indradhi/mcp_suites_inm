from database import SessionLocal
from models.llm_backend import LLMBackend, ModelAssignment

db = SessionLocal()
assignments = db.query(ModelAssignment).all()
print("=== MODEL ASSIGNMENTS ===")
for a in assignments:
    be_name = a.backend.name if a.backend else "None"
    print(f"Task: {a.task} -> Model: {a.model_name}, Backend: {be_name}")

backends = db.query(LLMBackend).all()
print("\n=== BACKENDS ===")
for b in backends:
    print(f"ID: {b.id}, Name: {b.name}, Type: {b.backend_type}, Models: {b.available_models}")
