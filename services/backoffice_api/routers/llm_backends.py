from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.llm_backend import LLMBackend, ModelAssignment
from security import get_current_user, require_role
from services.llm_service import llm_service

router = APIRouter(prefix="/llm", tags=["LLM Backends & Models"])

class BackendCreate(BaseModel):
    name: str
    backend_type: str # vllm, ollama, openai, custom
    api_base: str
    api_key: Optional[str] = None
    description: Optional[str] = None
    available_models: Optional[List[str]] = []

class BackendTest(BaseModel):
    api_base: str
    api_key: Optional[str] = None

class AssignmentUpdate(BaseModel):
    task: str # entity_extraction, relationship_detection, summarization, general_qa
    backend_id: int
    model_name: str
    parameters: Optional[Dict[str, Any]] = None

@router.get("/backends")
def list_backends(db: Session = Depends(get_db), user = Depends(get_current_user)):
    backends = db.query(LLMBackend).all()
    results = []
    for b in backends:
        results.append({
            "id": b.id,
            "name": b.name,
            "backend_type": b.backend_type,
            "api_base": b.api_base,
            "api_key": "***" if b.api_key else None,
            "is_active": b.is_active,
            "available_models": b.available_models or [],
            "description": b.description,
            "created_at": b.created_at
        })
    return results

@router.post("/backends/test-connection")
async def test_connection(payload: BackendTest, user = Depends(get_current_user)):
    try:
        models = await llm_service.list_remote_models(payload.api_base, payload.api_key)
        return {"success": True, "message": f"Connected successfully. Found {len(models)} models.", "models": models}
    except Exception as e:
        return {"success": False, "message": str(e), "models": []}

@router.post("/backends", status_code=status.HTTP_201_CREATED)
def create_backend(
    payload: BackendCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    backend = LLMBackend(
        name=payload.name,
        backend_type=payload.backend_type,
        api_base=payload.api_base,
        api_key=payload.api_key,
        description=payload.description,
        available_models=payload.available_models or []
    )
    db.add(backend)
    db.commit()
    db.refresh(backend)
    return {"id": backend.id, "name": backend.name, "message": "LLM backend added"}

@router.post("/backends/{backend_id}/fetch-models")
async def fetch_and_save_models(
    backend_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    backend = db.query(LLMBackend).filter(LLMBackend.id == backend_id).first()
    if not backend:
        raise HTTPException(status_code=404, detail="Backend not found")

    try:
        models = await llm_service.list_remote_models(backend.api_base, backend.api_key)
        if models:
            backend.available_models = models
            db.commit()
        return {"success": True, "models": models}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed fetching models: {e}")

@router.delete("/backends/{backend_id}")
def delete_backend(
    backend_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    backend = db.query(LLMBackend).filter(LLMBackend.id == backend_id).first()
    if not backend:
        raise HTTPException(status_code=404, detail="Backend not found")

    db.delete(backend)
    db.commit()
    return {"message": "Backend deleted"}

@router.get("/assignments")
def list_assignments(db: Session = Depends(get_db), user = Depends(get_current_user)):
    assignments = db.query(ModelAssignment).all()
    results = []
    for a in assignments:
        results.append({
            "id": a.id,
            "task": a.task,
            "backend_id": a.backend_id,
            "backend_name": a.backend.name if a.backend else "Unknown",
            "model_name": a.model_name,
            "parameters": a.parameters,
            "updated_at": a.updated_at
        })
    return results

@router.post("/assignments")
def update_assignment(
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    backend = db.query(LLMBackend).filter(LLMBackend.id == payload.backend_id).first()
    if not backend:
        raise HTTPException(status_code=404, detail="Backend not found")

    assignment = db.query(ModelAssignment).filter(ModelAssignment.task == payload.task).first()
    if not assignment:
        assignment = ModelAssignment(
            task=payload.task,
            backend_id=payload.backend_id,
            model_name=payload.model_name,
            parameters=payload.parameters
        )
        db.add(assignment)
    else:
        assignment.backend_id = payload.backend_id
        assignment.model_name = payload.model_name
        assignment.parameters = payload.parameters

    db.commit()
    return {"message": f"Model assignment for '{payload.task}' updated to '{payload.model_name}'"}
