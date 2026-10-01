import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from config import settings
from database import engine, Base, get_db, run_migrations
from models.user import User
from models.knowledge_source import KnowledgeSource
from models.ingest_job import IngestJob
from models.llm_backend import LLMBackend
from models.chat_feedback import ChatFeedback
from models.api_key import ApiKey
from security import get_current_user

from routers import auth, users, knowledge, jobs, graph, llm_backends, chat, face, personality, orchestrator, api_keys, database_settings
from routers.chat import openai_router, get_user_flexible
from models.orchestration_flow import OrchestrationFlow
from services.flow_orchestrator import flow_orchestrator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("backoffice_api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Backoffice API services...")
    try:
        Base.metadata.create_all(bind=engine)
        run_migrations()
        logger.info("Database tables verified.")

        # Seed default golden retrieval flows
        from database import SessionLocal
        from datetime import datetime
        db = SessionLocal()
        try:
            flow_orchestrator.seed_default_flows(db)

            # Recover any orphaned jobs stuck in 'processing' from a previous server restart
            stuck_jobs = db.query(IngestJob).filter(IngestJob.status == "processing").all()
            for sj in stuck_jobs:
                sj.status = "failed"
                sj.error_message = "Task interrupted by server restart"
                sj.completed_at = datetime.utcnow()
                if sj.source and sj.source.sync_status == "running":
                    sj.source.sync_status = "failed"
            if stuck_jobs:
                db.commit()
                logger.info(f"Cleaned up {len(stuck_jobs)} orphaned ingest jobs.")
        except Exception as e_clean:
            logger.warning(f"Notice during startup initialization: {e_clean}")
        finally:
            db.close()

    except Exception as e:
        logger.warning(f"Could not connect to database on startup: {e}")
    yield
    logger.info("Shutting down Backoffice API...")

app = FastAPI(
    title="MCP Backoffice API",
    description="Knowledge Management, Multi-source Ingestion, LLM Backends, and Network Profiling",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(llm_backends.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(face.router, prefix="/api")
app.include_router(personality.router, prefix="/api")
app.include_router(orchestrator.router, prefix="/api")
app.include_router(api_keys.router, prefix="/api")
app.include_router(database_settings.router, prefix="/api")

# ── OpenAI-Compatible API (/v1/...) ──────────────────────────────────────────
# This enables the backoffice API to accept standard OpenAI client requests at
# POST /v1/chat/completions  (standard + streaming)
# GET  /v1/models             (list available backends as model objects)
app.include_router(openai_router)


@app.get("/v1/models", tags=["OpenAI Compatible API"])
def list_openai_models(db: Session = Depends(get_db), user=Depends(get_user_flexible)):
    """
    OpenAI-compatible GET /v1/models — returns available LLM backends as model objects.
    Compatible with any OpenAI SDK client.
    """
    from models.llm_backend import LLMBackend
    import time
    backends = db.query(LLMBackend).filter(LLMBackend.is_active == True).all()
    model_objects = []
    for be in backends:
        for m in (be.available_models or []):
            model_objects.append({
                "id": m,
                "object": "model",
                "created": int(be.created_at.timestamp()) if getattr(be, 'created_at', None) else int(time.time()),
                "owned_by": be.name,
                "_backend": {"id": be.id, "api_base": be.api_base}
            })
    return {"object": "list", "data": model_objects}


@app.get("/health")
def health():
    return {"status": "healthy", "service": "backoffice-api", "version": "1.0.0"}

@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db), user = Depends(get_current_user)):
    total_sources = db.query(KnowledgeSource).count()
    total_jobs = db.query(IngestJob).count()
    active_backends = db.query(LLMBackend).filter(LLMBackend.is_active == True).count()
    failed_jobs = db.query(IngestJob).filter(IngestJob.status == "failed").count()

    return {
        "total_sources": total_sources,
        "total_jobs": total_jobs,
        "active_backends": active_backends,
        "failed_jobs": failed_jobs
    }
