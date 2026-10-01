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

openapi_tags = [
    {
        "name": "OpenAI Compatible API",
        "description": (
            "### 🤖 OpenAI-Standard API (`/v1/*`)\n\n"
            "Full drop-in replacement for the official **OpenAI API**, compatible with the official **OpenAI SDK** "
            "(`openai-python`, `openai-node`, `openai-java`, `openai-go`), LangChain, LlamaIndex, OpenWebUI, Cursor, and Continue.\n\n"
            "#### 🔐 Authentication Options:\n"
            "Every `/v1/*` request supports dual authentication in the standard `Authorization: Bearer <token_or_key>` header:\n"
            "- **MCP API Key**: `Bearer mcp_<your_key>` (generated in Backoffice API Keys page)\n"
            "- **JWT Bearer Token**: `Bearer <access_token>` (obtained via `/api/auth/login`)\n\n"
            "#### 🚀 Endpoints Included:\n"
            "- **`POST /v1/chat/completions`**: Standard Chat Completions with Server-Sent Events (SSE) streaming (`stream: true`), structured output (`response_format`), reasoning models (`reasoning_effort`), and grounding via enterprise Hybrid RAG (ChromaDB + Neo4j).\n"
            "- **`GET /v1/models`**: List all available active LLM models and backends (local vLLM, Ollama, DeepSeek Cloud, OpenAI, etc.)."
        ),
        "externalDocs": {
            "description": "OpenAI Chat Completions Reference",
            "url": "https://platform.openai.com/docs/api-reference/chat",
        },
    },
    {
        "name": "AI Knowledge Chat",
        "description": "Internal Backoffice chat endpoints featuring multi-source RAG, biometric face recognition, document uploads, and remembered prompt flow orchestration.",
    },
    {
        "name": "API Keys",
        "description": "API Key management for external MCP and OpenAI clients, including tool scoping and expiration controls.",
    },
    {
        "name": "Knowledge Sources",
        "description": "CRUD and synchronization for multi-source knowledge (Databases, Documents, Web crawlers, Google Drive, REST APIs, and remote MCP servers).",
    },
    {
        "name": "LLM Backends & Models",
        "description": "Management of LLM provider backends (vLLM, Ollama, DeepSeek, OpenAI) and task model assignments.",
    },
    {
        "name": "Network Profiling & Graph",
        "description": "Neo4j graph traversal, entity relationship detection, and graph topology analytics.",
    },
    {
        "name": "Data Orchestration & Flows",
        "description": "Prompt Flow Memory for multi-step retrieval orchestration.",
    },
    {
        "name": "Face Recognition",
        "description": "Biometric face profile enrollment, matching, and image comparison.",
    },
    {
        "name": "MCP Personality Settings",
        "description": "Custom AI personas, instructions, tone, and missions.",
    },
    {
        "name": "Ingest Jobs",
        "description": "Background task and pipeline monitoring for asynchronous knowledge ingestion.",
    },
    {
        "name": "Authentication",
        "description": "User login, token refresh, and internal API key verification.",
    },
    {
        "name": "Users Management",
        "description": "User administration and Role-Based Access Control (RBAC).",
    },
    {
        "name": "Database Settings",
        "description": "Configuration profiles for external database connections.",
    },
]

app = FastAPI(
    title="MCP Backoffice & OpenAI Compatible API",
    description=(
        "## Enterprise Knowledge Management, Multi-source Ingestion, Hybrid RAG, & OpenAI Compatible API\n\n"
        "Welcome to the **MCP Backoffice API Documentation**. This service exposes:\n"
        "1. **OpenAI-Compatible API (`/v1/*`)**: Drop-in replacement for OpenAI SDK clients (`POST /v1/chat/completions`, `GET /v1/models`).\n"
        "2. **Backoffice Suite (`/api/*`)**: Knowledge sources, Celery ingest pipelines, Neo4j graphs, and AI personas.\n"
        "3. **Dual Authentication**: Supports both standard JWT Bearer tokens and `mcp_<key>` API keys.\n\n"
        "Use the **Authorize 🔒** button above to authenticate with either a JWT token or an `mcp_<key>` API key."
    ),
    version="1.1.0",
    openapi_tags=openapi_tags,
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
# Accepts standard OpenAI client requests at:
#   POST /v1/chat/completions  (standard JSON + SSE streaming)
#   GET  /v1/models             (list available backends as model objects)
app.include_router(openai_router)


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
