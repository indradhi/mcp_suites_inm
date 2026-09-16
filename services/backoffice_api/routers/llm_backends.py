from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.llm_backend import LLMBackend, ModelAssignment
from security import get_current_user, require_role
from services.llm_service import llm_service

router = APIRouter(prefix="/llm", tags=["LLM Backends & Models"])

CLOUD_PROVIDERS = [
    {
        "id": "openai",
        "name": "OpenAI",
        "category": "cloud",
        "description": "Frontier models: GPT-4o, GPT-4o-mini, o1, and o3 reasoning engines",
        "default_api_base": "https://api.openai.com/v1",
        "default_models": ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
        "api_key_placeholder": "sk-proj-...",
        "docs_url": "https://platform.openai.com/api-keys",
        "color": "#10a37f"
    },
    {
        "id": "groq",
        "name": "Groq Cloud LPU",
        "category": "cloud",
        "description": "Ultra-fast LPU inference (500+ tok/s) for LLaMA 3.3 and DeepSeek R1 Distill",
        "default_api_base": "https://api.groq.com/openai/v1",
        "default_models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b", "mixtral-8x7b-32768"],
        "api_key_placeholder": "gsk_...",
        "docs_url": "https://console.groq.com/keys",
        "color": "#f55036"
    },
    {
        "id": "deepseek",
        "name": "DeepSeek Cloud",
        "category": "cloud",
        "description": "Cost-effective high reasoning performance with DeepSeek V3 and R1",
        "default_api_base": "https://api.deepseek.com/v1",
        "default_models": ["deepseek-chat", "deepseek-reasoner"],
        "api_key_placeholder": "sk-...",
        "docs_url": "https://platform.deepseek.com/api_keys",
        "color": "#4d6bfe"
    },
    {
        "id": "openrouter",
        "name": "OpenRouter",
        "category": "cloud",
        "description": "Universal gateway to Claude 3.5 Sonnet, GPT-4o, Gemini 2.0, and open models",
        "default_api_base": "https://openrouter.ai/api/v1",
        "default_models": [
            "anthropic/claude-3.5-sonnet",
            "openai/gpt-4o",
            "google/gemini-2.0-flash-001",
            "deepseek/deepseek-r1",
            "meta-llama/llama-3.3-70b-instruct"
        ],
        "api_key_placeholder": "sk-or-v1-...",
        "docs_url": "https://openrouter.ai/keys",
        "color": "#6366f1"
    },
    {
        "id": "gemini",
        "name": "Google Gemini (OpenAI Endpoint)",
        "category": "cloud",
        "description": "Gemini 2.0 Flash & Gemini 1.5 Pro via Google's official OpenAI-compatible endpoint",
        "default_api_base": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "default_models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
        "api_key_placeholder": "AIzaSy...",
        "docs_url": "https://aistudio.google.com/app/apikey",
        "color": "#3b82f6"
    },
    {
        "id": "mistral",
        "name": "Mistral AI",
        "category": "cloud",
        "description": "European state-of-the-art open models: Mistral Large, Codestral, and NeMo",
        "default_api_base": "https://api.mistral.ai/v1",
        "default_models": ["mistral-large-latest", "codestral-latest", "mistral-small-latest", "open-mistral-nemo"],
        "api_key_placeholder": "...",
        "docs_url": "https://console.mistral.ai/api-keys/",
        "color": "#f97316"
    },
    {
        "id": "together",
        "name": "Together AI",
        "category": "cloud",
        "description": "Cloud hosting for open-source AI: Llama 3.3 70B, DeepSeek R1, Qwen 2.5",
        "default_api_base": "https://api.together.xyz/v1",
        "default_models": ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
        "api_key_placeholder": "...",
        "docs_url": "https://api.together.xyz/settings/api-keys",
        "color": "#0ea5e9"
    },
    {
        "id": "cohere",
        "name": "Cohere",
        "category": "cloud",
        "description": "Enterprise search, RAG-optimized Command R+ and Command R models",
        "default_api_base": "https://api.cohere.com/compatibility/v1",
        "default_models": ["command-r-plus-08-2024", "command-r-08-2024"],
        "api_key_placeholder": "...",
        "docs_url": "https://dashboard.cohere.com/api-keys",
        "color": "#10b981"
    },
    {
        "id": "vllm",
        "name": "Local vLLM Cluster",
        "category": "local",
        "description": "On-premises high-throughput vLLM cluster hosting Qwen or LLaMA",
        "default_api_base": "http://172.16.21.122:18000/v1",
        "default_models": ["Qwen/Qwen3.6-35B-A3B-FP8"],
        "api_key_placeholder": "Optional API Key",
        "docs_url": "",
        "color": "#8b5cf6"
    },
    {
        "id": "ollama",
        "name": "Local Ollama",
        "category": "local",
        "description": "Local workstation Ollama instance serving downloaded GGUF models",
        "default_api_base": "http://localhost:11434/v1",
        "default_models": ["llama3:latest", "qwen2.5:latest"],
        "api_key_placeholder": "EMPTY",
        "docs_url": "https://ollama.ai",
        "color": "#ec4899"
    },
    {
        "id": "custom",
        "name": "Custom Compatible",
        "category": "custom",
        "description": "Any self-hosted or proxy OpenAI-compatible API endpoint",
        "default_api_base": "https://...",
        "default_models": [],
        "api_key_placeholder": "Bearer API Key",
        "docs_url": "",
        "color": "#94a3b8"
    }
]

class BackendCreate(BaseModel):
    name: str
    backend_type: str # vllm, ollama, openai, groq, deepseek, openrouter, gemini, mistral, together, cohere, custom
    api_base: str
    api_key: Optional[str] = None
    description: Optional[str] = None
    available_models: Optional[List[str]] = []

class BackendUpdate(BaseModel):
    name: Optional[str] = None
    backend_type: Optional[str] = None
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    description: Optional[str] = None
    available_models: Optional[List[str]] = None
    is_active: Optional[bool] = None

class BackendTest(BaseModel):
    api_base: str
    api_key: Optional[str] = None

class AssignmentUpdate(BaseModel):
    task: str # entity_extraction, relationship_detection, summarization, general_qa
    backend_id: int
    model_name: str
    parameters: Optional[Dict[str, Any]] = None

@router.get("/cloud-providers")
def get_cloud_providers(user = Depends(get_current_user)):
    """
    Returns curated 1-click cloud provider templates for UI configuration.
    """
    return CLOUD_PROVIDERS

@router.get("/active-models")
def get_active_models(db: Session = Depends(get_db), user = Depends(get_current_user)):
    """
    Returns all online/active LLM backends and their models for selection in Chat and tasks.
    """
    backends = db.query(LLMBackend).filter(LLMBackend.is_active == True).all()
    qa_assign = db.query(ModelAssignment).filter(ModelAssignment.task == "general_qa").first()
    
    results = []
    for b in backends:
        models = b.available_models or []
        is_default_backend = bool(qa_assign and qa_assign.backend_id == b.id)
        default_model = qa_assign.model_name if is_default_backend else (models[0] if models else "")
        results.append({
            "backend_id": b.id,
            "backend_name": b.name,
            "backend_type": b.backend_type,
            "api_base": b.api_base,
            "models": models,
            "is_default": is_default_backend,
            "default_model": default_model
        })
    return results

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
        count = len(models)
        return {
            "success": True,
            "message": f"Koneksi berhasil terhubung! Ditemukan {count} model remote.",
            "models": models
        }
    except Exception as e:
        err_msg = str(e)
        if "401" in err_msg or "unauthorized" in err_msg.lower():
            err_msg = "Autentikasi gagal (401 Unauthorized): Periksa apakah API Key sudah benar."
        elif "403" in err_msg or "forbidden" in err_msg.lower():
            err_msg = "Akses ditolak (403 Forbidden): Kuota habis atau API Key tidak memiliki izin."
        elif "connect" in err_msg.lower() or "timeout" in err_msg.lower():
            err_msg = f"Koneksi gagal atau timeout ke '{payload.api_base}'. Pastikan server dapat mengakses internet atau endpoint dapat dijangkau."
        return {"success": False, "message": err_msg, "models": []}

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

@router.put("/backends/{backend_id}")
def update_backend(
    backend_id: int,
    payload: BackendUpdate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    backend = db.query(LLMBackend).filter(LLMBackend.id == backend_id).first()
    if not backend:
        raise HTTPException(status_code=404, detail="Backend not found")

    if payload.name is not None:
        backend.name = payload.name
    if payload.backend_type is not None:
        backend.backend_type = payload.backend_type
    if payload.api_base is not None:
        backend.api_base = payload.api_base
    if payload.api_key is not None and payload.api_key != "***":
        backend.api_key = payload.api_key
    if payload.description is not None:
        backend.description = payload.description
    if payload.available_models is not None:
        backend.available_models = payload.available_models
    if payload.is_active is not None:
        backend.is_active = payload.is_active

    db.commit()
    db.refresh(backend)
    return {"id": backend.id, "name": backend.name, "message": "LLM backend updated"}

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
