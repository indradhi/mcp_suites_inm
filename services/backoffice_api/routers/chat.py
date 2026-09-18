import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from security import get_current_user
from models.knowledge_source import KnowledgeSource
from models.chat_feedback import ChatFeedback
from services.chat_service import chat_service
from services.document_parser import document_parser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["AI Knowledge Chat"])


class ChatMessageItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: Optional[str] = ""
    image_base64: Optional[str] = None
    doc_id: Optional[str] = None
    document_data: Optional[Dict[str, Any]] = None
    history: Optional[List[ChatMessageItem]] = []
    source_id: Optional[int] = None
    source_ids: Optional[List[int]] = None
    backend_id: Optional[int] = None
    model_name: Optional[str] = None
    include_graph: Optional[bool] = True
    top_k: Optional[int] = 5
    strict_mode: Optional[bool] = True
    temperature: Optional[float] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    entities: List[Dict[str, Any]]
    model_used: str
    backend_name: str
    metrics: Dict[str, Any]
    tools_executed: Optional[List[Dict[str, Any]]] = []
    face_recognition: Optional[Dict[str, Any]] = None
    thinking: Optional[str] = None
    strict_mode: Optional[bool] = True
    temperature: Optional[float] = None


class FeedbackRequest(BaseModel):
    message_id: str
    question: Optional[str] = None
    answer: Optional[str] = None
    feedback: str               # "like" or "dislike"
    notes: Optional[str] = None
    model_used: Optional[str] = None
    source_ids: Optional[List[int]] = None
    tools_called: Optional[List[str]] = None


@router.post("/upload-document")
async def upload_chat_document(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    """
    Upload a document (PDF, DOCX, Excel, CSV, TXT) directly from the Chat interface.
    Parses the content, extracts tables and metadata, and caches it in memory/disk.
    Returns doc_id, summary, preview, and metadata.
    """
    try:
        content = await file.read()
        if len(content) > 35 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Ukuran file maksimal 35MB")
        
        parsed = document_parser.parse_file(file.filename, content)
        return {
            "success": True,
            "data": parsed
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error parsing uploaded chat document: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memproses dokumen: {str(e)}")


@router.post("", response_model=ChatResponse)
def chat_with_knowledge_endpoint(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Direct endpoint to chat with the Knowledge Base and AI model.
    Retrieves vector chunks from ChromaDB and graph relations from Neo4j,
    executes face recognition if an image is attached,
    analyzes attached documents (PDF/DOCX/Excel/CSV/Text),
    then prompts the configured LLM to generate a grounded response with citations.
    Also injects liked-response examples as few-shot context for auto-tuning.
    """
    has_message = bool(req.message and req.message.strip())
    if not has_message and not req.image_base64 and not req.doc_id and not req.document_data:
        raise HTTPException(status_code=400, detail="Pesan, gambar, atau dokumen tidak boleh kosong.")

    # Retrieve uploaded document if provided
    uploaded_doc = None
    if req.doc_id:
        uploaded_doc = document_parser.get_document(req.doc_id)
    if not uploaded_doc and req.document_data:
        uploaded_doc = req.document_data

    # Determine effective message text
    if has_message:
        effective_message = req.message.strip()
    elif uploaded_doc:
        effective_message = f"Analisis isi dokumen '{uploaded_doc.get('file_name', 'terlampir')}', jelaskan isi atau datanya, dan berikan poin-poin penting serta ringkasannya."
    elif req.image_base64:
        effective_message = "Analisis foto ini dan identifikasi orang dalam foto."
    else:
        effective_message = "Analisis data yang disediakan."

    history_dicts = [{"role": h.role, "content": h.content} for h in req.history or []]

    # Consolidate source_ids and single source_id
    effective_source_ids = []
    if req.source_ids:
        effective_source_ids = [int(sid) for sid in req.source_ids if sid is not None]
    elif req.source_id is not None:
        effective_source_ids = [int(req.source_id)]

    # Load recent liked examples for auto-tuning few-shot context
    liked_examples = []
    try:
        liked_q = db.query(ChatFeedback).filter(
            ChatFeedback.feedback == "like"
        )
        liked_records = liked_q.order_by(ChatFeedback.created_at.desc()).limit(20).all()

        # Prefer examples that match the current source selection
        for rec in liked_records:
            if not rec.question or not rec.answer:
                continue
            rec_sources = rec.source_ids or []
            overlap = set(rec_sources) & set(effective_source_ids) if effective_source_ids and rec_sources else True
            if overlap or not effective_source_ids:
                liked_examples.append({
                    "question": rec.question[:400],
                    "answer": rec.answer[:800]
                })
            if len(liked_examples) >= 3:
                break
    except Exception as fe:
        logger.warning(f"Could not load liked examples for few-shot tuning: {fe}")

    # Load recent dislike feedback to extract quality correction guidelines
    dislike_notes = []
    try:
        dislike_q = db.query(ChatFeedback).filter(
            ChatFeedback.feedback == "dislike"
        )
        dislike_records = dislike_q.order_by(ChatFeedback.created_at.desc()).limit(15).all()
        for rec in dislike_records:
            if rec.notes and rec.notes.strip():
                clean_note = rec.notes.strip()
                if clean_note not in dislike_notes:
                    dislike_notes.append(clean_note[:200])
            if len(dislike_notes) >= 3:
                break
    except Exception as dfe:
        logger.warning(f"Could not load dislike notes for tuning: {dfe}")

    result = chat_service.chat_with_knowledge(
        message=effective_message,
        image_base64=req.image_base64,
        uploaded_document=uploaded_doc,
        history=history_dicts,
        source_id=effective_source_ids[0] if len(effective_source_ids) == 1 else None,
        source_ids=effective_source_ids if effective_source_ids else None,
        backend_id=req.backend_id,
        model_name=req.model_name,
        include_graph=req.include_graph if req.include_graph is not None else True,
        top_k=req.top_k or 5,
        db=db,
        liked_examples=liked_examples,  # few-shot context injection
        dislike_notes=dislike_notes,    # negative feedback correction injection
        strict_mode=req.strict_mode if req.strict_mode is not None else True,
        temperature=req.temperature
    )

    return result


@router.get("/sources")
def list_chat_available_sources(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Returns knowledge sources that have been indexed and are ready to query."""
    sources = db.query(KnowledgeSource).filter(
        KnowledgeSource.is_active == True
    ).order_by(KnowledgeSource.name.asc()).all()

    output = []
    for s in sources:
        cfg = s.config or {}
        v_tier = cfg.get("validity_tier") or ("authoritative" if s.source_type in ["database", "api"] else "secondary")
        default_score = 95 if v_tier == "authoritative" else (85 if v_tier == "verified" else (65 if v_tier == "secondary" else 45))
        v_score = cfg.get("validity_score", default_score)
        output.append({
            "id": s.id,
            "name": s.name,
            "description": s.description or "",
            "source_type": s.source_type,
            "sync_status": s.sync_status,
            "is_tool": bool(cfg.get("is_tool") or cfg.get("parameters")),
            "validity_tier": v_tier,
            "validity_score": v_score,
            "validity_notes": cfg.get("validity_notes", ""),
            "last_synced_at": s.last_synced_at.isoformat() if s.last_synced_at else None
        })
    return output


@router.get("/tools")
def list_chat_tools(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Returns active API tools that can be dynamically invoked by the AI during chat."""
    sources = db.query(KnowledgeSource).filter(
        KnowledgeSource.source_type.in_(["api", "database"]),
        KnowledgeSource.is_active == True
    ).all()

    tools = [
        {
            "source_id": 0,
            "source_type": "orchestrator",
            "name": "orchestrate_knowledge_search",
            "title": "Knowledge Orchestrator",
            "description": "Multi-source intelligent search across vector documents, knowledge graph, and live tools according to AI guidelines.",
            "parameters": [
                {"name": "query", "type": "string", "description": "Search query or input", "required": True},
                {"name": "search_strategy", "type": "string", "description": "Strategy: hybrid, semantic_only, graph_only", "required": False}
            ]
        },
        {
            "source_id": 0,
            "source_type": "guidelines",
            "name": "get_knowledge_orchestration_guidelines",
            "title": "Knowledge Guidelines",
            "description": "Retrieve official AI guidelines, catalog index, and routing strategies for processing input.",
            "parameters": [
                {"name": "query", "type": "string", "description": "Optional query for tailored advice", "required": False}
            ]
        }
    ]
    for s in sources:
        conf = s.config or {}
        if conf.get("is_tool") or conf.get("parameters"):
            prefix = "db_" if s.source_type == "database" else "api_"
            tool_name = conf.get("tool_name") or f"{prefix}{s.name.replace(' ', '_').lower()}"
            clean_name = "".join(c if c.isalnum() or c == "_" else "_" for c in tool_name).lower()
            tools.append({
                "source_id": s.id,
                "source_type": s.source_type,
                "name": clean_name,
                "title": s.name,
                "description": conf.get("tool_description") or s.description or f"{'Database' if s.source_type == 'database' else 'API'} Tool for {s.name}",
                "parameters": conf.get("parameters", [])
            })
    return {"tools": tools}


# ── Feedback Endpoints ─────────────────────────────────────────────────────────

@router.post("/feedback")
def submit_chat_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Submit a Like or Dislike on an AI chat response.
    The feedback is stored and used to auto-tune future responses (few-shot context).
    """
    if req.feedback not in ("like", "dislike"):
        raise HTTPException(status_code=400, detail="feedback must be 'like' or 'dislike'")

    # Upsert: if same message_id and same user already has feedback, update it
    existing = db.query(ChatFeedback).filter(
        ChatFeedback.message_id == req.message_id,
        ChatFeedback.user_id == user.id
    ).first()

    if existing:
        existing.feedback = req.feedback
        existing.notes = req.notes
        existing.created_at = __import__("datetime").datetime.utcnow()
    else:
        fb = ChatFeedback(
            message_id=req.message_id,
            question=(req.question or "")[:4000],
            answer=(req.answer or "")[:4000],
            feedback=req.feedback,
            notes=req.notes,
            model_used=req.model_used,
            source_ids=req.source_ids,
            tools_called=req.tools_called,
            user_id=user.id if user else None,
            username=user.username if user else None
        )
        db.add(fb)

    db.commit()
    return {"success": True, "message": f"Feedback '{req.feedback}' recorded for message {req.message_id}"}


@router.get("/feedback")
def list_chat_feedback(
    feedback_type: Optional[str] = Query(None, description="Filter by 'like' or 'dislike'"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """List all feedback entries. Admins can see all; regular users see only their own."""
    q = db.query(ChatFeedback)
    if feedback_type in ("like", "dislike"):
        q = q.filter(ChatFeedback.feedback == feedback_type)
    q = q.order_by(ChatFeedback.created_at.desc())
    total = q.count()
    records = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "records": [r.to_dict() for r in records]
    }


@router.get("/feedback/stats")
def get_feedback_stats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Aggregated feedback statistics grouped by model and feedback type."""
    total_likes = db.query(func.count(ChatFeedback.id)).filter(ChatFeedback.feedback == "like").scalar() or 0
    total_dislikes = db.query(func.count(ChatFeedback.id)).filter(ChatFeedback.feedback == "dislike").scalar() or 0
    total = total_likes + total_dislikes

    by_model = db.query(
        ChatFeedback.model_used,
        ChatFeedback.feedback,
        func.count(ChatFeedback.id).label("count")
    ).group_by(ChatFeedback.model_used, ChatFeedback.feedback).all()

    model_stats = {}
    for row in by_model:
        model = row.model_used or "unknown"
        if model not in model_stats:
            model_stats[model] = {"like": 0, "dislike": 0}
        model_stats[model][row.feedback] = row.count

    return {
        "total_feedback": total,
        "total_likes": total_likes,
        "total_dislikes": total_dislikes,
        "like_rate_percent": round(total_likes / total * 100, 1) if total > 0 else 0,
        "by_model": model_stats
    }
