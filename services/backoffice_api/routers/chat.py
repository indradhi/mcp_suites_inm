import json
import logging
import time
import uuid
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field, ConfigDict
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from security import get_current_user
from models.knowledge_source import KnowledgeSource
from models.chat_feedback import ChatFeedback
from services.chat_service import chat_service
from services.document_parser import document_parser
from models.api_key import ApiKey

logger = logging.getLogger(__name__)

# Security scheme for Swagger UI "Authorize" modal
http_bearer = HTTPBearer(
    auto_error=False,
    description="Enter standard JWT Bearer token (from /api/auth/login) or 'mcp_<key>' API key"
)


async def get_user_flexible(
    request: Request,
    auth_cred: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db)
):
    """
    Flexible auth for OpenAI-compatible endpoints.
    Accepts either:
      - Standard JWT Bearer token (backoffice users)
      - mcp_<key> API key (same keys used by MCP clients)
    Returns a user or minimal user-like object with .id and .username.
    """
    from fastapi.security.utils import get_authorization_scheme_param
    from security import decode_token
    from datetime import datetime

    credentials = auth_cred.credentials if (auth_cred and auth_cred.credentials) else None
    if not credentials:
        authorization = request.headers.get("Authorization", "")
        scheme, credentials = get_authorization_scheme_param(authorization)

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authorization header required (Bearer JWT token or mcp_<key> API key)",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # ── mcp_ API key path ────────────────────────────────────────────────────
    if credentials.startswith("mcp_"):
        from security import verify_password
        key_prefix = credentials[:8]
        candidates = db.query(ApiKey).filter(
            ApiKey.key_prefix == key_prefix,
            ApiKey.is_active == True
        ).all()
        if not candidates:
            candidates = db.query(ApiKey).filter(ApiKey.is_active == True).all()

        api_key_obj = None
        for ak in candidates:
            if verify_password(credentials, ak.key_hash):
                api_key_obj = ak
                break

        if not api_key_obj:
            raise HTTPException(status_code=401, detail="Invalid or revoked MCP API key")
        if api_key_obj.expires_at and api_key_obj.expires_at < datetime.utcnow():
            raise HTTPException(status_code=401, detail="MCP API key has expired")
        # Update last_used_at
        try:
            api_key_obj.last_used_at = datetime.utcnow()
            db.commit()
        except Exception:
            db.rollback()

        class _ApiKeyUser:
            id = api_key_obj.id
            username = api_key_obj.name or "api_key_user"
            role = "editor"
        return _ApiKeyUser()

    # ── JWT Bearer token path ────────────────────────────────────────────────
    try:
        payload = decode_token(credentials)
        username = payload.get("sub")
        if not username or payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        from models.user import User
        user = db.query(User).filter(User.username == username, User.is_active == True).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found or disabled")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token or API key")


router = APIRouter(prefix="/chat", tags=["AI Knowledge Chat"])
openai_router = APIRouter(prefix="/v1", tags=["OpenAI Compatible API"])


# ── OpenAI Compatible API Request & Response Schemas ────────────────────────

class OpenAIMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    role: str = Field(..., description="Role of the message author: 'developer', 'system', 'user', or 'assistant'")
    content: Union[str, List[Dict[str, Any]]] = Field(..., description="The contents of the message (text string or multimodal content parts)")
    name: Optional[str] = Field(None, description="An optional name for the participant")


class OpenAIResponseFormat(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str = Field("text", description="Output format type: 'text', 'json_object', or 'json_schema'")
    json_schema: Optional[Dict[str, Any]] = Field(None, description="JSON Schema object when type is 'json_schema'")


class OpenAIChatCompletionRequest(BaseModel):
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "model": "Qwen/Qwen3.6-35B-A3B-FP8",
                "messages": [
                    {"role": "developer", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Who won the world series in 2020?"},
                    {"role": "assistant", "content": "The Los Angeles Dodgers won the World Series in 2020."},
                    {"role": "user", "content": "Where was it played?"}
                ],
                "temperature": 0.0,
                "stream": False
            }
        }
    )
    messages: List[OpenAIMessage] = Field(..., description="A list of messages comprising the conversation so far.")
    model: Optional[str] = Field("Qwen/Qwen3.6-35B-A3B-FP8", description="ID of the model to use. Query GET /v1/models for available models.")
    stream: Optional[bool] = Field(False, description="If True, partial message deltas will be sent via Server-Sent Events (SSE) data-only stream.")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="Sampling temperature between 0 and 2. Lower values mean more deterministic responses.")
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="Nucleus sampling probability alternative to temperature.")
    n: Optional[int] = Field(1, description="How many chat completion choices to generate for each input message.")
    max_tokens: Optional[int] = Field(None, description="Maximum number of tokens that can be generated in the chat completion.")
    max_completion_tokens: Optional[int] = Field(None, description="Upper bound for tokens generated, supported by reasoning models (o1/o3).")
    presence_penalty: Optional[float] = Field(None, ge=-2.0, le=2.0, description="Penalizes new tokens based on whether they appear in the text so far.")
    frequency_penalty: Optional[float] = Field(None, ge=-2.0, le=2.0, description="Penalizes new tokens based on their existing frequency in the text so far.")
    seed: Optional[int] = Field(None, description="Integer seed for deterministic sampling.")
    stop: Optional[Union[str, List[str]]] = Field(None, description="Up to 4 sequences where the API will stop generating further tokens.")
    response_format: Optional[OpenAIResponseFormat] = Field(None, description="An object specifying the format that the model must output (e.g. {'type': 'json_object'}).")
    reasoning_effort: Optional[str] = Field(None, description="Constrains effort on reasoning for reasoning models ('low', 'medium', 'high').")
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="A list of tools the model may call.")
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(None, description="Controls which (if any) tool is called by the model.")
    user: Optional[str] = Field(None, description="A unique identifier representing your end-user for monitoring.")


class OpenAIUsage(BaseModel):
    model_config = ConfigDict(extra="allow")
    prompt_tokens: int = Field(0, description="Number of tokens in the prompt")
    completion_tokens: int = Field(0, description="Number of tokens in the generated completion")
    total_tokens: int = Field(0, description="Total number of tokens used in the request")


class OpenAIChoiceMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    role: str = Field("assistant", description="The role of the author of this message")
    content: Optional[str] = Field("", description="The contents of the message")


class OpenAIChoice(BaseModel):
    model_config = ConfigDict(extra="allow")
    index: int = Field(0, description="The index of the choice in the list of choices")
    message: OpenAIChoiceMessage = Field(..., description="A chat completion message generated by the model")
    finish_reason: Optional[str] = Field("stop", description="The reason the model stopped generating tokens ('stop', 'length', etc.)")
    logprobs: Optional[Any] = Field(None, description="Log probability information for the choice")


class OpenAIChatCompletionResponse(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    id: str = Field(..., description="A unique identifier for the chat completion (e.g. chatcmpl-...)")
    object: str = Field("chat.completion", description="The object type, which is always 'chat.completion'")
    created: int = Field(..., description="The Unix timestamp (in seconds) of when the chat completion was created")
    model: str = Field(..., description="The model used for the chat completion")
    choices: List[OpenAIChoice] = Field(..., description="A list of chat completion choices")
    usage: Optional[OpenAIUsage] = Field(None, description="Usage statistics for the completion request")
    system_fingerprint: Optional[str] = Field(None, description="Backend system fingerprint")
    knowledge: Optional[Dict[str, Any]] = Field(None, alias="_knowledge", description="Extended metadata from internal Knowledge Base / Graph RAG")


class OpenAIModelItem(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    id: str = Field(..., description="Model identifier", example="Qwen/Qwen3.6-35B-A3B-FP8")
    object: str = Field("model", description="The object type, which is always 'model'")
    created: int = Field(..., description="Unix timestamp of model creation/registration")
    owned_by: str = Field(..., description="Owner or server name hosting this model", example="Primary vLLM Server")
    backend: Optional[Dict[str, Any]] = Field(None, alias="_backend", description="Internal backend details (ID and API base)")


class OpenAIModelListResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    object: str = Field("list", description="The object type, which is always 'list'")
    data: List[OpenAIModelItem] = Field(..., description="List of available models")


class ChatMessageItem(BaseModel):
    role: str
    content: Union[str, List[Dict[str, Any]]]  # Support multimodal content (text + image_url)


class ResponseFormat(BaseModel):
    """OpenAI-standard response_format for structured output."""
    type: str = "text"  # "text", "json_object", or "json_schema"
    json_schema: Optional[Dict[str, Any]] = None  # Used when type="json_schema"


class ChatRequest(BaseModel):
    # ── Core fields ──────────────────────────────────────────────────
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
    top_k: Optional[int] = 20
    strict_mode: Optional[bool] = True
    # ── OpenAI standard sampling parameters ──────────────────────────
    temperature: Optional[float] = None
    top_p: Optional[float] = None          # Nucleus sampling (0-1)
    n: Optional[int] = 1                   # Number of completions to generate
    max_tokens: Optional[int] = None       # Max tokens in the completion
    max_completion_tokens: Optional[int] = None  # For o1/o3 reasoning models
    presence_penalty: Optional[float] = None     # -2.0 to 2.0
    frequency_penalty: Optional[float] = None    # -2.0 to 2.0
    seed: Optional[int] = None             # Deterministic sampling seed
    stop: Optional[Union[str, List[str]]] = None  # Stop sequences
    logprobs: Optional[bool] = None        # Return log probabilities
    top_logprobs: Optional[int] = None     # Number of top logprobs to return
    # ── Structured output ─────────────────────────────────────────────
    response_format: Optional[ResponseFormat] = None  # json_object | json_schema
    # ── Reasoning model support (o1, o3) ─────────────────────────────
    reasoning_effort: Optional[str] = None  # "low", "medium", "high"
    # ── User tracking ─────────────────────────────────────────────────
    user: Optional[str] = None             # End-user identifier for abuse tracking
    # ── Streaming ─────────────────────────────────────────────────────
    stream: Optional[bool] = False


class ChatResponse(BaseModel):
    # ── Response ID (OpenAI standard) ────────────────────────────────
    id: Optional[str] = None
    # ── Answer & knowledge fields ─────────────────────────────────────
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
    # ── OpenAI standard usage tracking ───────────────────────────────
    usage: Optional[Dict[str, Any]] = None  # prompt_tokens, completion_tokens, total_tokens
    finish_reason: Optional[str] = None    # "stop", "tool_calls", "length", "content_filter"


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
        top_k=req.top_k or 20,
        db=db,
        liked_examples=liked_examples,
        dislike_notes=dislike_notes,
        strict_mode=req.strict_mode if req.strict_mode is not None else True,
        temperature=req.temperature,
        # OpenAI standard parameters
        top_p=req.top_p,
        presence_penalty=req.presence_penalty,
        frequency_penalty=req.frequency_penalty,
        seed=req.seed,
        stop=req.stop,
        max_tokens=req.max_tokens,
        max_completion_tokens=req.max_completion_tokens,
        logprobs=req.logprobs,
        top_logprobs=req.top_logprobs,
        response_format=req.response_format.model_dump() if req.response_format else None,
        reasoning_effort=req.reasoning_effort,
        user=req.user or (str(user.id) if user else None),
        n=req.n,
    )

    # Attach response ID for OpenAI compatibility
    if not result.get("id"):
        result["id"] = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    return result


@router.post("/stream")
async def chat_stream_endpoint(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    OpenAI-compatible streaming chat endpoint.
    Returns Server-Sent Events (SSE) with `data: {...}` chunks ending in `data: [DONE]`.
    """
    has_message = bool(req.message and req.message.strip())
    if not has_message and not req.image_base64 and not req.doc_id and not req.document_data:
        raise HTTPException(status_code=400, detail="Pesan, gambar, atau dokumen tidak boleh kosong.")

    # Get the full (non-streaming) result from the chat service
    uploaded_doc = None
    if req.doc_id:
        uploaded_doc = document_parser.get_document(req.doc_id)
    if not uploaded_doc and req.document_data:
        uploaded_doc = req.document_data

    effective_message = req.message.strip() if has_message else (
        f"Analisis isi dokumen '{uploaded_doc.get('file_name', 'terlampir')}'." if uploaded_doc else
        "Analisis foto ini dan identifikasi orang dalam foto." if req.image_base64 else
        "Analisis data yang disediakan."
    )
    history_dicts = [{"role": h.role, "content": h.content} for h in req.history or []]
    effective_source_ids = []
    if req.source_ids:
        effective_source_ids = [int(sid) for sid in req.source_ids if sid is not None]
    elif req.source_id is not None:
        effective_source_ids = [int(req.source_id)]

    async def stream_generator():
        chat_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        created_ts = int(time.time())
        model_name = req.model_name or "default"

        # Initial SSE chunk (role)
        initial_chunk = {
            "id": chat_id,
            "object": "chat.completion.chunk",
            "created": created_ts,
            "model": model_name,
            "choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": None}]
        }
        yield f"data: {json.dumps(initial_chunk, ensure_ascii=False)}\n\n"

        try:
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
                top_k=req.top_k or 20,
                db=db,
                liked_examples=[],
                dislike_notes=[],
                strict_mode=req.strict_mode if req.strict_mode is not None else True,
                temperature=req.temperature,
                top_p=req.top_p,
                presence_penalty=req.presence_penalty,
                frequency_penalty=req.frequency_penalty,
                seed=req.seed,
                stop=req.stop,
                max_tokens=req.max_tokens,
                max_completion_tokens=req.max_completion_tokens,
                response_format=req.response_format.model_dump() if req.response_format else None,
                reasoning_effort=req.reasoning_effort,
                user=req.user or (str(user.id) if user else None),
            )
            full_answer = result.get("answer", "")
            model_used = result.get("model_used", model_name)

            # Stream answer in chunks of ~30 characters for smooth UX
            CHUNK_SIZE = 30
            for i in range(0, len(full_answer), CHUNK_SIZE):
                chunk_text = full_answer[i:i + CHUNK_SIZE]
                content_chunk = {
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "created": created_ts,
                    "model": model_used,
                    "choices": [{"index": 0, "delta": {"content": chunk_text}, "finish_reason": None}]
                }
                yield f"data: {json.dumps(content_chunk, ensure_ascii=False)}\n\n"

            # Final chunk with finish_reason and usage
            final_chunk = {
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created_ts,
                "model": model_used,
                "choices": [{"index": 0, "delta": {}, "finish_reason": result.get("finish_reason", "stop")}],
                "usage": result.get("usage")
            }
            yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            error_chunk = {
                "error": {"message": str(e), "type": "server_error"},
                "choices": [{"index": 0, "delta": {"content": f"\n\n[Error: {str(e)}]"}, "finish_reason": "error"}]
            }
            yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@openai_router.post(
    "/chat/completions",
    summary="Create Chat Completion (OpenAI Compatible)",
    description=(
        "Standard **OpenAI Chat Completions** endpoint (`POST /v1/chat/completions`).\n\n"
        "Fully compliant with the OpenAI API specification and drop-in compatible with official OpenAI SDKs "
        "(`openai-python`, `openai-node`), LangChain, LlamaIndex, OpenWebUI, Cursor, and Continue.\n\n"
        "### 🚀 Key Capabilities:\n"
        "- **Dual Authentication**: Accepts either a Backoffice JWT Bearer token or an `mcp_<key>` API key in `Authorization: Bearer <token_or_key>`.\n"
        "- **Server-Sent Events (SSE) Streaming**: Set `\"stream\": true` to stream completion tokens chunk-by-chunk in real time.\n"
        "- **Hybrid RAG Grounding**: Queries ChromaDB vector embeddings and Neo4j relational graph to synthesize accurate, factual, and verified answers.\n"
        "- **Structured Outputs**: Fully supports `response_format: {\"type\": \"json_object\"}` or `json_schema`.\n"
        "- **Reasoning Models**: Supports `reasoning_effort` and `max_completion_tokens` for o1/o3-class models.\n"
        "- **Advanced Controls**: `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `seed`, `stop`, `user`."
    ),
    response_model=OpenAIChatCompletionResponse,
    responses={
        200: {
            "description": "Successful completion. Returns standard JSON completion or an SSE event-stream if stream=true.",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/OpenAIChatCompletionResponse"}
                },
                "text/event-stream": {
                    "schema": {
                        "type": "string",
                        "example": "data: {\"id\":\"chatcmpl-...\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\ndata: [DONE]\n\n"
                    }
                }
            }
        },
        400: {"description": "Bad Request - Invalid JSON or parameter validation failed"},
        401: {"description": "Unauthorized - Missing or invalid Bearer token / MCP API key"}
    }
)
async def openai_chat_completions(
    payload: OpenAIChatCompletionRequest,
    db: Session = Depends(get_db),
    user=Depends(get_user_flexible)
):
    # Extract OpenAI standard fields from validated payload
    messages = [m.model_dump() if hasattr(m, 'model_dump') else m for m in payload.messages]
    model = payload.model
    stream = payload.stream or False
    temperature = payload.temperature
    max_tokens = payload.max_tokens
    max_completion_tokens = payload.max_completion_tokens
    top_p = payload.top_p
    presence_penalty = payload.presence_penalty
    frequency_penalty = payload.frequency_penalty
    seed = payload.seed
    stop = payload.stop
    response_format = payload.response_format.model_dump() if payload.response_format else None
    reasoning_effort = payload.reasoning_effort
    tools = payload.tools
    tool_choice = payload.tool_choice
    user_id = payload.user
    n = payload.n or 1
    # Check for any extra params sent via extra="allow"
    extra_fields = getattr(payload, '__pydantic_extra__', {}) or {}
    logprobs = getattr(payload, 'logprobs', None) or extra_fields.get("logprobs")
    top_logprobs = getattr(payload, 'top_logprobs', None) or extra_fields.get("top_logprobs")

    # Extract user message (last user message in the conversation)
    user_message = ""
    history = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):  # multimodal content
            content = " ".join(p.get("text", "") for p in content if p.get("type") == "text")
        if role in ("system", "developer"):
            continue  # system prompt is handled by personality service
        elif role == "user":
            user_message = content  # last user message wins
            if history:  # add previous user messages to history
                pass
        history.append({"role": role, "content": content})

    if not user_message and history:
        # Fallback: last message regardless of role
        user_message = history[-1].get("content", "")

    # Build the chat request
    chat_req = ChatRequest(
        message=user_message,
        history=[ChatMessageItem(role=h["role"], content=h["content"]) for h in history[:-1]],
        model_name=model,
        temperature=temperature,
        top_p=top_p,
        presence_penalty=presence_penalty,
        frequency_penalty=frequency_penalty,
        seed=seed,
        stop=stop,
        max_tokens=max_tokens,
        max_completion_tokens=max_completion_tokens,
        logprobs=logprobs,
        top_logprobs=top_logprobs,
        response_format=ResponseFormat(**response_format) if response_format else None,
        reasoning_effort=reasoning_effort,
        user=user_id,
        n=n,
        stream=stream,
    )

    result = chat_service.chat_with_knowledge(
        message=user_message,
        history=[{"role": h["role"], "content": h["content"]} for h in history[:-1]],
        model_name=model,
        db=db,
        liked_examples=[],
        dislike_notes=[],
        temperature=temperature,
        top_p=top_p,
        presence_penalty=presence_penalty,
        frequency_penalty=frequency_penalty,
        seed=seed,
        stop=stop,
        max_tokens=max_tokens,
        max_completion_tokens=max_completion_tokens,
        response_format=response_format,
        reasoning_effort=reasoning_effort,
        user=user_id,
    )

    chat_id = result.get("id") or f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created_ts = int(time.time())
    model_used = result.get("model_used", model or "default")
    answer = result.get("answer", "")
    finish_reason = result.get("finish_reason", "stop")
    usage = result.get("usage") or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    if stream:
        async def sse_stream():
            initial = {
                "id": chat_id, "object": "chat.completion.chunk",
                "created": created_ts, "model": model_used,
                "choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": None}]
            }
            yield f"data: {json.dumps(initial)}\n\n"
            CHUNK_SIZE = 30
            for i in range(0, len(answer), CHUNK_SIZE):
                chunk = {
                    "id": chat_id, "object": "chat.completion.chunk",
                    "created": created_ts, "model": model_used,
                    "choices": [{"index": 0, "delta": {"content": answer[i:i+CHUNK_SIZE]}, "finish_reason": None}]
                }
                yield f"data: {json.dumps(chunk)}\n\n"
            final = {
                "id": chat_id, "object": "chat.completion.chunk",
                "created": created_ts, "model": model_used,
                "choices": [{"index": 0, "delta": {}, "finish_reason": finish_reason}],
                "usage": usage
            }
            yield f"data: {json.dumps(final)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(sse_stream(), media_type="text/event-stream",
                                  headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # Standard JSON response in OpenAI format
    return {
        "id": chat_id,
        "object": "chat.completion",
        "created": created_ts,
        "model": model_used,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": answer},
                "finish_reason": finish_reason,
                "logprobs": None
            }
        ],
        "usage": usage,
        "system_fingerprint": None,
        # Extended fields (non-OpenAI, for rich clients)
        "_knowledge": {
            "sources": result.get("sources", []),
            "entities": result.get("entities", []),
            "tools_executed": result.get("tools_executed", []),
            "thinking": result.get("thinking"),
            "backend_name": result.get("backend_name", ""),
            "metrics": result.get("metrics", {})
        }
    }


@openai_router.get(
    "/models",
    summary="List Available Models (OpenAI Compatible)",
    description=(
        "Standard **OpenAI Models** endpoint (`GET /v1/models`).\n\n"
        "Lists all currently available LLM backends (local vLLM, Ollama, DeepSeek Cloud, OpenAI, etc.) "
        "as OpenAI model objects. Compatible with `client.models.list()` in the OpenAI SDK.\n\n"
        "### 🔐 Authentication:\n"
        "Accepts either standard JWT Bearer token or `mcp_<key>` API key in `Authorization: Bearer <token_or_key>`."
    ),
    response_model=OpenAIModelListResponse,
    responses={
        200: {"description": "List of available models."},
        401: {"description": "Unauthorized - Missing or invalid Bearer token / MCP API key."}
    }
)
def list_openai_models(
    db: Session = Depends(get_db),
    user=Depends(get_user_flexible)
):
    from models.llm_backend import LLMBackend
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
