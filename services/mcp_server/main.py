import os
import re
import json
import base64
import copy
import hashlib
import logging
import asyncio
import time as _time
from typing import Dict, Any, List, Optional, Tuple
from contextlib import asynccontextmanager
import contextvars

# Context variables for API key permissions
api_key_allowed_tools = contextvars.ContextVar("api_key_allowed_tools", default=None)
api_key_allowed_kbs = contextvars.ContextVar("api_key_allowed_kbs", default=None)
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, Field
import httpx

from vector_client import VectorClient
from graph_client import GraphClient
from context_isolator import context_isolator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("mcp_server")

vector_client = VectorClient()
graph_client = GraphClient()

# ── API Key Auth Configuration ────────────────────────────────────────
MCP_AUTH_ENABLED = os.getenv("MCP_AUTH_ENABLED", "true").lower() in ("true", "1", "yes")
BACKOFFICE_API_URL_AUTH = os.getenv("BACKOFFICE_API_URL", "http://backoffice-api:8000")

# In-memory cache for validated API keys: { key_hash -> (expiry_timestamp, validation_result) }
_api_key_cache: Dict[str, tuple] = {}
_API_KEY_CACHE_TTL = 60  # seconds

AUTH_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class ApiKeyAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates MCP API keys via the backoffice API."""

    async def dispatch(self, request: Request, call_next):
        # Skip auth if disabled
        if not MCP_AUTH_ENABLED:
            return await call_next(request)

        # Skip auth for exempt paths and media serving routes
        if (
            request.url.path in AUTH_EXEMPT_PATHS
            or request.url.path.startswith(("/media/", "/api/chat/media/"))
        ):
            return await call_next(request)

        # Extract Bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": "Missing or invalid Authorization header. Use: Authorization: Bearer mcp_<your_key>"}
            )

        api_key = auth_header[7:].strip()  # Remove "Bearer " prefix
        if not api_key.startswith("mcp_"):
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid API key format. Keys must start with 'mcp_'"}
            )

        # Check cache first
        now = _time.time()
        cache_key = api_key  # Use the raw key as cache key
        if cache_key in _api_key_cache:
            expiry, cached_result = _api_key_cache[cache_key]
            if now < expiry:
                if cached_result.get("valid"):
                    api_key_allowed_tools.set(cached_result.get("allowed_tools"))
                    api_key_allowed_kbs.set(cached_result.get("allowed_kbs"))
                    return await call_next(request)
                else:
                    return JSONResponse(status_code=401, content={"error": cached_result.get("detail", "Invalid API key")})

        # Validate against backoffice API
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{BACKOFFICE_API_URL_AUTH}/api/auth/validate-api-key",
                    json={"api_key": api_key}
                )

            if resp.status_code == 200:
                result = resp.json()
                _api_key_cache[cache_key] = (now + _API_KEY_CACHE_TTL, result)
                api_key_allowed_tools.set(result.get("allowed_tools"))
                api_key_allowed_kbs.set(result.get("allowed_kbs"))
                return await call_next(request)
            else:
                detail = "Invalid or expired API key"
                try:
                    detail = resp.json().get("detail", detail)
                except Exception:
                    pass
                _api_key_cache[cache_key] = (now + _API_KEY_CACHE_TTL, {"valid": False, "detail": detail})
                return JSONResponse(status_code=401, content={"error": detail})

        except httpx.TimeoutException:
            logger.warning("Timeout validating API key against backoffice API")
            # On timeout, check if we have a stale cache entry — better to allow than block
            if cache_key in _api_key_cache:
                _, cached_result = _api_key_cache[cache_key]
                if cached_result.get("valid"):
                    api_key_allowed_tools.set(cached_result.get("allowed_tools"))
                    api_key_allowed_kbs.set(cached_result.get("allowed_kbs"))
                    return await call_next(request)
            return JSONResponse(status_code=503, content={"error": "Authentication service temporarily unavailable"})
        except Exception as e:
            logger.error(f"Error validating API key: {e}")
            return JSONResponse(status_code=503, content={"error": "Authentication service error"})


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing MCP Server connections...")
    if MCP_AUTH_ENABLED:
        logger.info("🔐 API Key authentication is ENABLED")
    else:
        logger.info("⚠️ API Key authentication is DISABLED (MCP_AUTH_ENABLED=false)")
    try:
        vector_client.get_collection()
        logger.info("Connected to ChromaDB successfully.")
    except Exception as e:
        logger.warning(f"Could not immediately connect to ChromaDB: {e}")

    try:
        graph_client.get_driver()
        logger.info("Connected to Neo4j successfully.")
    except Exception as e:
        logger.warning(f"Could not immediately connect to Neo4j: {e}")

    yield

    logger.info("Shutting down MCP Server connections...")
    await graph_client.close()

app = FastAPI(
    title="MCP Knowledge & Network Server",
    description="Model Context Protocol Server for OpenWebUI with Vector Search and Network Relation Profiling",
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

# API Key Authentication Middleware (added after CORS so CORS preflight works)
app.add_middleware(ApiKeyAuthMiddleware)


# ── Available Tools Definition (MCP / OpenWebUI schema) ───────────────
TOOLS_METADATA = [
    {
        "name": "search_knowledge_base",
        "description": "Search the knowledge base vector store for documents, PDFs (with OCR), spreadsheets, Word docs, web search results, and database records. Enforces Graph-Bounded Context Isolation: chunks from unrelated entities are blocked, only admitting data belonging to the focus entity or its Neo4j graph-mapped network.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or concept to find relevant knowledge for."
                },
                "focus_entity": {
                    "type": "string",
                    "description": "Target entity or topic name (person, company, case, NIK) to isolate context to. When provided or detected, ChromaDB retrieval is bounded strictly to this entity and its Neo4j graph network."
                },
                "session_id": {
                    "type": "string",
                    "description": "Conversation session ID to maintain active focus entity and topic isolation across multi-turn interactions (default 'default').",
                    "default": "default"
                },
                "isolate_context": {
                    "type": "boolean",
                    "description": "Whether to enforce strict context isolation bounded by Neo4j graph network (default true). Chunks from alien entities are discarded.",
                    "default": True
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of chunks to return (default 5).",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "set_chat_focus_context",
        "description": "Explicitly set or switch the active entity or topic focus for the current chat session. Binds subsequent ChromaDB searches and tool operations strictly to this entity and its Neo4j graph-mapped network, preventing context leakage.",
        "parameters": {
            "type": "object",
            "properties": {
                "entity_name": {
                    "type": "string",
                    "description": "The target person, organization, company, or case entity to anchor the session focus to."
                },
                "session_id": {
                    "type": "string",
                    "description": "The conversation or session identifier (default 'default').",
                    "default": "default"
                },
                "topic": {
                    "type": "string",
                    "description": "Optional investigation topic or case title."
                }
            },
            "required": ["entity_name"]
        }
    },
    {
        "name": "get_chat_focus_context",
        "description": "Inspect the currently active entity, topic, and Neo4j-mapped context boundary for a chat session.",
        "parameters": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "The conversation or session identifier (default 'default').",
                    "default": "default"
                }
            }
        }
    },
    {
        "name": "get_entity_network_profile",
        "description": "Retrieve comprehensive entity profile, attributes, and 1-hop relationship network from the knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "entity_name": {
                    "type": "string",
                    "description": "The exact or partial name of the person, organization, system, or entity to profile."
                }
            },
            "required": ["entity_name"]
        }
    },
    {
        "name": "analyze_data_relationship",
        "description": "Analyze network path and multi-hop connections between two data entities to generate contextual reasoning insights.",
        "parameters": {
            "type": "object",
            "properties": {
                "source_entity": {
                    "type": "string",
                    "description": "The starting entity."
                },
                "target_entity": {
                    "type": "string",
                    "description": "The destination entity."
                },
                "max_depth": {
                    "type": "integer",
                    "description": "Maximum path search depth (default 3).",
                    "default": 3
                }
            },
            "required": ["source_entity", "target_entity"]
        }
    },
    {
        "name": "get_graph_network_insights",
        "description": "Retrieve high-level network topology insights, top central hubs, and influential entities across the knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of top central entities to inspect.",
                    "default": 10
                }
            }
        }
    },
    {
        "name": "get_knowledge_orchestration_guidelines",
        "description": "Retrieve official AI guidelines, operational rules, query routing strategy, and active knowledge catalog for processing user input and searching information across the knowledge base.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Optional user query or topic to receive tailored routing instructions and tool recommendations."
                },
                "include_catalog": {
                    "type": "boolean",
                    "description": "Whether to include the full directory of active knowledge sources (default true).",
                    "default": True
                }
            }
        }
    },
    {
        "name": "orchestrate_knowledge_search",
        "description": "Orchestrate a multi-source intelligent search across all knowledge sources (Vector Store, Knowledge Graph, and dynamic Database/API sources) according to AI search guidelines. Enforces Neo4j Graph-Bounded Context Isolation to prevent context leakage across unrelated entities.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or user input to orchestrate across knowledge base sources."
                },
                "focus_entity": {
                    "type": "string",
                    "description": "Target entity to isolate search to. Vector chunks and graph nodes are filtered against this entity's Neo4j mapped network."
                },
                "session_id": {
                    "type": "string",
                    "description": "Conversation session ID to maintain active focus entity across turns (default 'default').",
                    "default": "default"
                },
                "isolate_context": {
                    "type": "boolean",
                    "description": "Whether to enforce strict context isolation bounded by Neo4j graph network (default true).",
                    "default": True
                },
                "search_strategy": {
                    "type": "string",
                    "description": "Search strategy: 'hybrid' (vector + graph + tool matching, default), 'semantic_only' (vector docs only), 'graph_only' (entities & relations only), or 'comprehensive'.",
                    "default": "hybrid"
                },
                "source_types": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter by source types: ['file', 'database', 'api', 'website', 'websearch']."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of document chunks to retrieve per search (default 5).",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "recognize_face",
        "description": "Recognize and identify a person's face from an image (provided as a local file path or Base64 string) against enrolled face records in the knowledge base.",
        "parameters": {
            "type": "object",
            "properties": {
                "image": {
                    "type": "string",
                    "description": "Image input as local file path, URL, or Base64 encoded string (supports raw base64 or data:image/...;base64)."
                },
                "min_confidence": {
                    "type": "number",
                    "description": "Minimum similarity confidence threshold (0.0 to 1.0, default 0.60) to consider a positive match.",
                    "default": 0.60
                },
                "max_candidates": {
                    "type": "integer",
                    "description": "Maximum number of closest matching face candidates to return (default 3).",
                    "default": 3
                }
            },
            "required": ["image"]
        }
    },
    {
        "name": "compare_faces",
        "description": "Compare two face images (provided as file paths or Base64 strings) to determine if they belong to the same person and calculate similarity confidence.",
        "parameters": {
            "type": "object",
            "properties": {
                "image_a": {
                    "type": "string",
                    "description": "First image as local file path or Base64 string."
                },
                "image_b": {
                    "type": "string",
                    "description": "Second image as local file path or Base64 string."
                },
                "threshold": {
                    "type": "number",
                    "description": "Similarity threshold to consider faces as the same person (default 0.70).",
                    "default": 0.70
                }
            },
            "required": ["image_a", "image_b"]
        }
    },
    {
        "name": "enroll_face",
        "description": "Enroll and index a new face profile into the biometric face recognition knowledge base with person identity and metadata.",
        "parameters": {
            "type": "object",
            "properties": {
                "image": {
                    "type": "string",
                    "description": "Face photo as local file path or Base64 string."
                },
                "person_name": {
                    "type": "string",
                    "description": "Full name of the person."
                },
                "person_id": {
                    "type": "string",
                    "description": "Optional unique identifier (e.g. employee ID, national ID, student ID)."
                },
                "metadata": {
                    "type": "object",
                    "description": "Optional metadata dictionary (e.g. {'department': 'Finance', 'role': 'Manager'})."
                }
            },
            "required": ["image", "person_name"]
        }
    },
    {
        "name": "list_enrolled_faces",
        "description": "List all enrolled face profiles and identities stored in the face recognition knowledge base.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of face profiles to retrieve (default 50).",
                    "default": 50
                }
            }
        }
    },
    {
        "name": "get_retrieval_flow_for_prompt",
        "description": "Dapatkan alur investigasi / perolehan informasi terpadu (Prompt Flow Memory) yang paling relevan untuk suatu pertanyaan/prompt. Mengembalikan tahapan langkah demi langkah sumber data/alat/graf yang harus dipanggil serta aturan prioritas validitas data.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Teks prompt atau pertanyaan investigasi yang akan dicari acuan alurnya."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "manage_retrieval_flow",
        "description": "Simpan atau perbarui alur perolehan informasi (Prompt Flow Memory) ke dalam Data Orchestrator agar menjadi acuan otomatis bagi prompt serupa di masa mendatang.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Nama alur (contoh: 'Alur Profiling NIK & Rekening Bank')"
                },
                "prompt_pattern": {
                    "type": "string",
                    "description": "Pola regex atau frasa pemicu (contoh: r'(\\b\\d{16}\\b|profil.*nik)')"
                },
                "trigger_keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Daftar kata kunci pemicu (contoh: ['nik', 'dukcapil', 'ktp', 'profiling'])"
                },
                "intent_category": {
                    "type": "string",
                    "description": "Kategori intent: 'identity_profiling', 'asset_tracing', 'corporate_network', 'regulatory_compliance', atau 'general'"
                },
                "description": {
                    "type": "string",
                    "description": "Deskripsi alur dan tujuannya"
                },
                "steps": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Daftar tahapan sekuensial alur perolehan informasi (step_number, action_type, target_name, description, required)"
                },
                "validity_priority_rule": {
                    "type": "string",
                    "description": "Aturan prioritas validitas (contoh: 'Tingkat 1 Dukcapil > Tingkat 2 BAP Internal > Tingkat 3 Berita')"
                }
            },
            "required": ["name", "prompt_pattern", "steps"]
        }
    }
]

# ── Health & Tools Endpoints ──────────────────────────────────────────

BACKOFFICE_API_URL = os.getenv("BACKOFFICE_API_URL", "http://backoffice-api:8000")
_cached_dynamic_tools: List[Dict[str, Any]] = []
_dynamic_tools_last_fetch: float = 0.0

async def fetch_dynamic_api_tools() -> List[Dict[str, Any]]:
    global _cached_dynamic_tools, _dynamic_tools_last_fetch
    import time
    import httpx
    now = time.time()
    if _cached_dynamic_tools and (now - _dynamic_tools_last_fetch < 10.0):
        return _cached_dynamic_tools

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"{BACKOFFICE_API_URL}/api/knowledge/api-tools")
            if resp.status_code == 200:
                data = resp.json()
                raw_tools = data.get("tools", [])
                converted_tools = []
                for item in raw_tools:
                    tool_name = item.get("name")
                    source_type = item.get("source_type", "api")
                    default_desc = f"Dynamic Database query tool for {item.get('title')}" if source_type == "database" else (f"Remote MCP tool '{item.get('raw_tool_name') or tool_name}' from {item.get('title')}" if source_type == "mcp" else f"Dynamic API tool for {item.get('title')}")
                    description = item.get("description") or default_desc
                    params_list = item.get("parameters", [])

                    properties = {}
                    required_fields = []
                    for p in params_list:
                        p_name = p.get("name")
                        if not p_name:
                            continue
                        p_type = p.get("type", "string").lower()
                        schema_type = "string"
                        if p_type in ["integer", "int"]:
                            schema_type = "integer"
                        elif p_type in ["number", "float"]:
                            schema_type = "number"
                        elif p_type in ["boolean", "bool"]:
                            schema_type = "boolean"

                        prop_def = {
                            "type": schema_type,
                            "description": p.get("description") or f"Parameter {p_name}"
                        }
                        if "default" in p and p["default"] is not None and str(p["default"]).strip() != "":
                            prop_def["default"] = p["default"]
                        properties[p_name] = prop_def

                        include_empty = bool(p.get("include_empty") or p.get("allow_empty"))
                        has_default = "default" in p and p["default"] is not None and str(p["default"]).strip() != ""
                        if p.get("required") and not include_empty and not has_default:
                            required_fields.append(p_name)

                    field_defs = item.get("field_definitions") or (item.get("config", {}) or {}).get("field_definitions", [])
                    if field_defs and isinstance(field_defs, list) and len(field_defs) > 0:
                        glossary_lines = ["\n\nField Definitions (Kamus Kolom Balikan):"]
                        for fd in field_defs:
                            fname = fd.get("name")
                            if fname:
                                fdesc = fd.get("description") or fd.get("type") or "Field value"
                                fsample = f" (contoh: {fd.get('sample')})" if fd.get("sample") else ""
                                glossary_lines.append(f"- {fname}: {fdesc}{fsample}")
                        description += "\n".join(glossary_lines)

                    converted_tools.append({
                        "name": tool_name,
                        "description": description,
                        "parameters": {
                            "type": "object",
                            "properties": properties,
                            "required": required_fields
                        },
                        "field_definitions": field_defs,
                        "_source_id": item.get("source_id"),
                        "_raw_tool_name": item.get("raw_tool_name"),
                        "_config": item.get("config")
                    })
                _cached_dynamic_tools = converted_tools
                _dynamic_tools_last_fetch = now
                return _cached_dynamic_tools
    except Exception as e:
        logger.debug(f"Could not fetch dynamic API tools from backoffice: {e}")

    return _cached_dynamic_tools

async def get_all_tools_metadata() -> List[Dict[str, Any]]:
    dynamic = await fetch_dynamic_api_tools()
    clean_dynamic = [
        {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["parameters"]
        }
        for t in dynamic
    ]
    all_tools = TOOLS_METADATA + clean_dynamic
    
    # Filter based on allowed_tools context var
    allowed = api_key_allowed_tools.get()
    if allowed is not None:
        all_tools = [t for t in all_tools if t["name"] in allowed]
        
    return all_tools

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "mcp-server",
        "version": "1.0.0"
    }

@app.get("/tools")
async def list_tools():
    all_tools = await get_all_tools_metadata()
    return {"tools": all_tools}

class ToolCallRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

async def execute_tool(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    import httpx
    
    # Check if tool is allowed
    allowed = api_key_allowed_tools.get()
    if allowed is not None and name not in allowed:
        return {"error": f"API key does not have permission to execute tool '{name}'"}

    if name == "search_knowledge_base":
        query = args.get("query", "")
        max_results = int(args.get("max_results", 5))
        if not query:
            return {"error": "Query parameter is required"}

        session_id = args.get("session_id")
        explicit_entity = args.get("focus_entity")
        isolate_context = args.get("isolate_context", True)

        focus_entity, is_shift, session_data = context_isolator.determine_active_focus(
            query=query,
            session_id=session_id,
            explicit_entity=explicit_entity
        )

        if isolate_context and focus_entity:
            # 1. Resolve Neo4j graph network boundary
            network_boundary = await context_isolator.get_graph_network_boundary(graph_client, focus_entity)
            # 2. Query expanded ChromaDB candidate pool
            candidates = await vector_client.search_knowledge(
                query_text=query,
                n_results=max_results,
                candidate_multiplier=3,
                focus_entity=focus_entity
            )
            # 3. Filter & isolate chunks against Neo4j network
            admitted, isolation_report = context_isolator.isolate_chunks(
                candidates=candidates,
                focus_entity=focus_entity,
                network_boundary=network_boundary,
                strict=True
            )
            final_results = admitted[:max_results]
            return {
                "tool": name,
                "query": query,
                "focus_entity": focus_entity,
                "session_id": session_id or "default",
                "count": len(final_results),
                "results": final_results,
                "context_isolation": isolation_report
            }
        else:
            results = await vector_client.search_knowledge(query_text=query, n_results=max_results)
            return {
                "tool": name,
                "query": query,
                "count": len(results),
                "results": results
            }

    elif name == "set_chat_focus_context":
        ent_name = args.get("entity_name", "")
        if not ent_name:
            return {"error": "entity_name parameter is required"}
        sid = args.get("session_id", "default")
        topic = args.get("topic")
        session_data = context_isolator.set_session_context(session_id=sid, entity_name=ent_name, topic=topic)
        net_bound = await context_isolator.get_graph_network_boundary(graph_client, session_data["focus_entity"])
        return {
            "tool": name,
            "status": "success",
            "session_id": sid,
            "focus_entity": session_data["focus_entity"],
            "is_mapped_in_neo4j": net_bound.get("is_mapped", False),
            "network_nodes_count": net_bound.get("total_network_size", 1),
            "network_nodes_sample": net_bound.get("allowed_names", [])[:12],
            "message": f"Konteks percakapan sesi '{sid}' berhasil diisolasi ke entitas '{session_data['focus_entity']}'. Pencarian berikutnya dibatasi secara ketat pada entitas ini dan jaringan yang terpetakan di Neo4j."
        }

    elif name == "get_chat_focus_context":
        sid = args.get("session_id", "default")
        session_data = context_isolator.get_session_context(sid)
        if not session_data or not session_data.get("focus_entity"):
            return {
                "tool": name,
                "session_id": sid,
                "has_focus": False,
                "message": f"Belum ada entitas fokus yang terkunci untuk sesi '{sid}'. Konteks bersifat dinamis."
            }
        f_ent = session_data["focus_entity"]
        net_bound = await context_isolator.get_graph_network_boundary(graph_client, f_ent)
        return {
            "tool": name,
            "session_id": sid,
            "has_focus": True,
            "focus_entity": f_ent,
            "topic": session_data.get("topic"),
            "updated_at": session_data.get("updated_at"),
            "is_mapped_in_neo4j": net_bound.get("is_mapped", False),
            "network_nodes_count": net_bound.get("total_network_size", 1),
            "network_nodes": net_bound.get("network_nodes", [])[:15],
            "allowed_names": net_bound.get("allowed_names", [])[:15]
        }

    elif name == "get_entity_network_profile":
        entity_name = args.get("entity_name", "")
        if not entity_name:
            return {"error": "entity_name parameter is required"}
        profile = await graph_client.get_entity_profile(entity_name=entity_name)
        return {
            "tool": name,
            "entity": entity_name,
            "found": bool(profile),
            "profile": profile
        }

    elif name == "analyze_data_relationship":
        src = args.get("source_entity", "")
        dst = args.get("target_entity", "")
        depth = int(args.get("max_depth", 3))
        if not src or not dst:
            return {"error": "Both source_entity and target_entity are required"}
        connections = await graph_client.find_connections(src, dst, max_depth=depth)
        return {
            "tool": name,
            "source": src,
            "target": dst,
            "connections": connections
        }

    elif name == "get_graph_network_insights":
        limit = int(args.get("limit", 10))
        insights = await graph_client.get_network_insights(limit=limit)
        return {
            "tool": name,
            "insights": insights
        }

    elif name in ["get_knowledge_orchestration_guidelines", "get_knowledge_guidelines"]:
        query = args.get("query")
        include_catalog = args.get("include_catalog", True)

        # 1. Attempt delegating to Backoffice API for full DB metadata
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                params = {"include_catalog": str(include_catalog).lower()}
                if query:
                    params["query"] = str(query)
                res = await client.get(f"{BACKOFFICE_API_URL}/api/knowledge/orchestration-guidelines", params=params)
                if res.status_code == 200:
                    data = res.json()
                    data["tool"] = name
                    return data
        except Exception as e:
            logger.debug(f"Backoffice guidelines fetch exception ({e}), falling back to local synthesis")

        # 2. Local Fallback Execution
        dynamic_tools = await fetch_dynamic_api_tools()
        tools_list = [
            {
                "tool_name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"].get("properties", {})
            }
            for t in dynamic_tools
        ]
        return {
            "tool": name,
            "status": "success (local synthesis)",
            "guidelines": {
                "core_mission": "Analis Intelijen & Penyelidikan BIN. Melakukan penelaahan bukti, penelusuran aset, profiling entitas terduga, verifikasi silang dokumen & data lapangan, serta menjaga integritas anti-halusinasi dan isolasi konteks.",
                "personality": {
                    "name": "Analis Intelijen & Penyelidikan BIN",
                    "role": "Analis Intelijen & Penyelidikan Strategis",
                    "tone_of_voice": "Formal, lugas, analitis, presisi, objektif, berintegritas tinggi",
                    "preset": "bin_investigator"
                },
                "input_processing_protocol": [
                    {
                        "step": 1,
                        "phase": "Context Isolation & Entity Anchoring",
                        "rules": [
                            "Tentukan entitas subjek atau topik yang sedang dibahas dalam sesi chat saat ini.",
                            "Gunakan 'focus_entity' atau panggil 'set_chat_focus_context' untuk mengunci batasan konteks ke jaringan Neo4j entitas tersebut.",
                            "ISOLASI KONTEKS MUTLAK: Seluruh data dalam bank pengetahuan ChromaDB tidak boleh dicampuradukkan. Jangan pernah menampilkan atau mengasumsikan data milik entitas lain yang tidak terhubung resmi dalam Neo4j."
                        ]
                    },
                    {
                        "step": 2,
                        "phase": "Source Routing Decision Tree",
                        "rules": [
                            "Rule A: Untuk data aset/tanah/kependudukan live, jalankan dynamic database/API tools (prioritas utama).",
                            "Rule B: Untuk jaringan hubungan, gunakan Neo4j (get_entity_network_profile, analyze_data_relationship).",
                            "Rule C: Untuk dokumen & berita, gunakan search_knowledge_base atau orchestrate_knowledge_search dengan batasan isolasi konteks."
                        ]
                    },
                    {
                        "step": 3,
                        "phase": "Grounding & Citations",
                        "rules": [
                            "Always cite Source Name and Document ID / Tool Name.",
                            "Do NOT invent or hallucinate missing data. Acknowledge missing records truthfully: 'Data tidak ditemukan dalam basis pengetahuan yang terhubung.'",
                            "Treat live API/Database tools as real-time source of truth."
                        ]
                    }
                ]
            },
            "catalog": {
                "available_ai_tools": tools_list,
                "vector_store": "ChromaDB (collection: knowledge_base, Graph-Bounded Isolation Active)",
                "knowledge_graph": "Neo4j Graph Database"
            },
            "query_recommendations": {
                "query": query,
                "suggested_action": "Use 'orchestrate_knowledge_search' for automated multi-source retrieval with context isolation."
            } if query else None
        }

    elif name == "orchestrate_knowledge_search":
        query = args.get("query", "")
        if not query:
            return {"error": "query parameter is required"}
        strategy = args.get("search_strategy", "hybrid")
        max_results = int(args.get("max_results", 5))
        source_types = args.get("source_types")
        session_id = args.get("session_id")
        explicit_entity = args.get("focus_entity")
        isolate_context = args.get("isolate_context", True)

        focus_entity, is_shift, session_data = context_isolator.determine_active_focus(
            query=query,
            session_id=session_id,
            explicit_entity=explicit_entity
        )

        # 1. Attempt delegating to Backoffice API
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/knowledge/orchestrate-search",
                    json={
                        "query": query,
                        "search_strategy": strategy,
                        "source_types": source_types,
                        "max_results": max_results,
                        "focus_entity": focus_entity,
                        "session_id": session_id or "default",
                        "isolate_context": isolate_context
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    data["tool"] = name
                    return data
        except Exception as e:
            logger.debug(f"Backoffice orchestrate-search exception ({e}), falling back to local synthesis")

        # 2. Local Fallback Multi-Source Orchestration with Graph-Bounded Context Isolation
        network_boundary = None
        if isolate_context and focus_entity:
            network_boundary = await context_isolator.get_graph_network_boundary(graph_client, focus_entity)

        vector_results = []
        isolation_report = None
        if strategy in ["hybrid", "semantic_only", "comprehensive"]:
            candidates = await vector_client.search_knowledge(
                query_text=query,
                n_results=max_results,
                candidate_multiplier=3,
                focus_entity=focus_entity
            )
            if isolate_context and focus_entity:
                admitted, isolation_report = context_isolator.isolate_chunks(
                    candidates=candidates,
                    focus_entity=focus_entity,
                    network_boundary=network_boundary,
                    strict=True
                )
                vector_results = admitted[:max_results]
            else:
                vector_results = candidates[:max_results]

        graph_entities = []
        if strategy in ["hybrid", "graph_only", "comprehensive"]:
            if focus_entity:
                prof = await graph_client.get_entity_profile(entity_name=focus_entity)
                if prof:
                    graph_entities.append(prof)
                if network_boundary and network_boundary.get("network_nodes"):
                    for nn in network_boundary["network_nodes"][:5]:
                        if nn.get("name") and nn["name"].upper() != focus_entity.upper():
                            p = await graph_client.get_entity_profile(entity_name=nn["name"])
                            if p and p not in graph_entities:
                                graph_entities.append(p)
            else:
                import re
                words = [w.strip() for w in re.findall(r'\w+', query) if len(w) >= 3]
                for w in words[:4]:
                    prof = await graph_client.get_entity_profile(entity_name=w)
                    if prof:
                        graph_entities.append(prof)

        dynamic_tools = await fetch_dynamic_api_tools()
        applicable_tools = []
        q_lower = query.lower()
        for t in dynamic_tools:
            t_name = t["name"].lower()
            t_desc = t["description"].lower()
            if t_name in q_lower or any(kw in q_lower for kw in t_desc.split() if len(kw) > 4):
                applicable_tools.append({
                    "tool_name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"]
                })

        guidelines = [
            f"Konteks terisolasi untuk entitas: '{focus_entity}' (Terpetakan di Neo4j: {bool(network_boundary and network_boundary.get('is_mapped'))})." if focus_entity else "Pencarian pengetahuan umum (tanpa isolasi entitas khusus).",
            f"Retrieved {len(vector_results)} document chunk(s) and {len(graph_entities)} graph entity profile(s).",
            "PRIORITAS SUMBER DATA: Data yang didapat langsung dari query database/API live adalah PRIORITAS UTAMA MUTLAK yang wajib ditampilkan terlebih dahulu kepada pengguna di atas dokumen RAG/vektor.",
            "ISOLASI KONTEKS: Jangan pernah mencantumkan atau mengaitkan data dari entitas/orang/perusahaan lain yang tidak terhubung dalam jaringan Neo4j.",
            "Ground your answer strictly in these findings. Cite document IDs and source names."
        ]

        resp_dict = {
            "tool": name,
            "query": query,
            "focus_entity": focus_entity,
            "session_id": session_id or "default",
            "strategy_applied": strategy,
            "retrieved_documents": vector_results,
            "graph_entities": graph_entities,
            "applicable_tools": applicable_tools,
            "ai_guidelines": guidelines
        }
        if isolation_report:
            resp_dict["context_isolation"] = isolation_report
        return resp_dict

    elif name == "recognize_face":
        image_input = args.get("image")
        if not image_input:
            return {"error": "image parameter (file path or base64) is required"}
        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/face/recognize",
                    json={
                        "image": image_input,
                        "min_confidence": float(args.get("min_confidence", 0.60)),
                        "max_candidates": int(args.get("max_candidates", 3))
                    }
                )
                data = res.json()
                data["tool"] = name
                return data
        except Exception as e:
            return {"tool": name, "error": f"Failed to execute face recognition: {str(e)}"}

    elif name == "compare_faces":
        img_a = args.get("image_a")
        img_b = args.get("image_b")
        if not img_a or not img_b:
            return {"error": "Both image_a and image_b parameters are required"}
        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/face/compare",
                    json={
                        "image_a": img_a,
                        "image_b": img_b,
                        "threshold": float(args.get("threshold", 0.70))
                    }
                )
                data = res.json()
                data["tool"] = name
                return data
        except Exception as e:
            return {"tool": name, "error": f"Failed to execute face comparison: {str(e)}"}

    elif name == "enroll_face":
        img = args.get("image")
        name_val = args.get("person_name")
        if not img or not name_val:
            return {"error": "Both image and person_name are required"}
        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/face/enroll",
                    json={
                        "image": img,
                        "person_name": name_val,
                        "person_id": args.get("person_id"),
                        "metadata": args.get("metadata", {})
                    }
                )
                data = res.json()
                data["tool"] = name
                return data
        except Exception as e:
            return {"tool": name, "error": f"Failed to enroll face: {str(e)}"}

    elif name == "list_enrolled_faces":
        limit = int(args.get("limit", 50))
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(
                    f"{BACKOFFICE_API_URL}/api/face/enrolled",
                    params={"limit": limit}
                )
                data = res.json()
                data["tool"] = name
                return data
        except Exception as e:
            return {"tool": name, "error": f"Failed to list enrolled faces: {str(e)}"}

    elif name == "get_retrieval_flow_for_prompt":
        query_val = args.get("query", "")
        if not query_val:
            return {"error": "Parameter query wajib diisi"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/orchestrator/flows/match",
                    json={"query": query_val}
                )
                data = res.json()
                data["tool"] = name
                return data
        except Exception as e:
            return {"tool": name, "error": f"Gagal mencocokkan alur perolehan informasi: {str(e)}"}

    elif name == "manage_retrieval_flow":
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/orchestrator/flows",
                    json=args
                )
                data = res.json()
                data["tool"] = name
                return data
        except Exception as e:
            return {"tool": name, "error": f"Gagal menyimpan alur perolehan informasi: {str(e)}"}

    else:
        # Check dynamic API tools
        dynamic_tools = await fetch_dynamic_api_tools()
        matched_tool = next((t for t in dynamic_tools if t["name"] == name), None)
        if matched_tool:
            source_id = matched_tool.get("_source_id")
            try:
                async with httpx.AsyncClient(timeout=35.0) as client:
                    res = await client.post(
                        f"{BACKOFFICE_API_URL}/api/knowledge/api-tools/{source_id}/execute",
                        json={
                            "tool_name": matched_tool.get("_raw_tool_name"),
                            "arguments": args
                        }
                    )
                    res_data = res.json()
                    return {
                        "tool": name,
                        "source_id": source_id,
                        "success": res.status_code == 200 and res_data.get("success", True),
                        "status_code": res_data.get("status_code", res.status_code),
                        "arguments": args,
                        "data_priority": "PRIORITAS_UTAMA_MUTLAK (Data diambil langsung secara real-time dari database/source data resmi BIN)",
                        "fetch_mode": "LIVE_DIRECT_DATABASE_QUERY",
                        "data": res_data.get("data"),
                        "text": res_data.get("text"),
                        "error": res_data.get("error") or (res_data.get("detail") if res.status_code >= 400 else None)
                    }
            except Exception as e:
                return {"tool": name, "error": f"Failed to execute dynamic tool: {str(e)}"}

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool '{name}' not recognized"
        )

# ── Helper for MCP Image Content Conversion (image, foto, photo, gambar, picture) ──
IMAGE_KEY_WORDS = {'image', 'foto', 'photo', 'gambar', 'picture', 'avatar', 'img', 'ktp', 'thumbnail'}

def detect_mime_type(b64: str) -> str:
    if b64.startswith('data:image/'):
        m = re.match(r'^data:image/([a-zA-Z0-9\+\-\.]+);base64,', b64)
        if m:
            sub = m.group(1).lower()
            return f'image/{sub}'
    clean = re.sub(r'^data:image/[^;]+;base64,', '', b64).strip()
    if clean.startswith('/9j/'):
        return 'image/jpeg'
    elif clean.startswith('iVBORw0KGgo'):
        return 'image/png'
    elif clean.startswith('R0lGOD'):
        return 'image/gif'
    elif clean.startswith('UklGR'):
        return 'image/webp'
    return 'image/jpeg'

def clean_b64_data(b64: str) -> str:
    clean = re.sub(r'^data:image/[^;]+;base64,', '', b64).strip()
    raw = "".join(clean.split())
    if len(raw) % 4 == 1:
        raw = raw[:-1]
    pad = (4 - len(raw) % 4) % 4
    return raw + ('=' * pad)

def is_b64_image_val(val: Any) -> bool:
    if not isinstance(val, str) or len(val) < 50:
        return False
    val_s = "".join(val.strip().split())
    return (
        val.strip().startswith('data:image/') or
        val_s.startswith('/9j/') or
        val_s.startswith('iVBORw0KGgo') or
        val_s.startswith('R0lGOD') or
        val_s.startswith('UklGR') or
        bool(re.match(r'^[A-Za-z0-9+/=]{100,}$', val_s))
    )

def get_mcp_media_base_url() -> str:
    url = (
        os.getenv("PUBLIC_MEDIA_URL") or
        os.getenv("PUBLIC_BASE_URL") or
        os.getenv("BACKOFFICE_URL") or
        os.getenv("MCP_PUBLIC_URL") or
        ""
    ).rstrip("/")
    return url

async def save_b64_image_cached(
    b64_val: str,
    ref_nik: Optional[str] = None,
    ref_name: Optional[str] = None,
    source_name: Optional[str] = None,
    base_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Converts base64 image data to a cached image file and returns direct image URLs.
    First tries Backoffice API /api/chat/media/convert (persisting to ChatMediaCache in DB),
    falling back to saving directly to /app/uploads/chat_temp/media/.
    """
    clean_b64 = clean_b64_data(b64_val)
    if not clean_b64 or len(clean_b64) < 40:
        return {"url": "", "full_url": "", "filename": "", "mime_type": "image/jpeg"}

    mime = detect_mime_type(b64_val)
    effective_base = (base_url or get_mcp_media_base_url()).rstrip("/")

    # 1. Try Backoffice API conversion (persists into DB ChatMediaCache)
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(
                f"{BACKOFFICE_API_URL}/api/chat/media/convert",
                json={
                    "data": b64_val,
                    "ref_nik": ref_nik,
                    "ref_name": ref_name,
                    "source_name": source_name,
                    "base_url": effective_base,
                    "prefer_full_url": True
                }
            )
            if resp.status_code == 200:
                res_data = resp.json()
                media_info = res_data.get("media") or {}
                chosen_url = res_data.get("url") or media_info.get("full_url") or media_info.get("url")
                if chosen_url:
                    return {
                        "url": chosen_url,
                        "full_url": media_info.get("full_url") or chosen_url,
                        "filename": media_info.get("filename", ""),
                        "markdown": res_data.get("markdown") or f"![Foto]({chosen_url})",
                        "mime_type": media_info.get("mime_type", mime)
                    }
    except Exception as be:
        logger.debug(f"Notice connecting to backoffice media converter: {be}")

    # 2. Local File Save Fallback
    try:
        raw_bytes = base64.b64decode(clean_b64)
        ext = "jpg"
        if "png" in mime:
            ext = "png"
        elif "webp" in mime:
            ext = "webp"
        elif "gif" in mime:
            ext = "gif"

        hash_id = hashlib.sha256(raw_bytes).hexdigest()[:16]
        if ref_nik:
            safe_nik = re.sub(r'[^0-9a-zA-Z_-]', '', str(ref_nik))
            filename = f"img_{safe_nik}_{hash_id}.{ext}"
        else:
            filename = f"img_{hash_id}.{ext}"

        possible_dirs = [
            "/app/uploads/chat_temp/media",
            "./data/uploads/chat_temp/media",
            "uploads/chat_temp/media"
        ]
        target_dir = possible_dirs[0]
        for d in possible_dirs:
            if os.path.exists(os.path.dirname(d)):
                target_dir = d
                break

        os.makedirs(target_dir, exist_ok=True)
        fpath = os.path.join(target_dir, filename)
        if not os.path.exists(fpath) or os.path.getsize(fpath) == 0:
            with open(fpath, "wb") as f:
                f.write(raw_bytes)

        rel_url = f"/api/chat/media/{filename}"
        full_url = f"{effective_base}{rel_url}" if effective_base else rel_url
        label = f"Foto - {ref_name}" if ref_name else "Foto"
        return {
            "url": full_url,
            "full_url": full_url,
            "filename": filename,
            "markdown": f"![{label}]({full_url})",
            "mime_type": mime
        }
    except Exception as le:
        logger.warning(f"Error saving local base64 image: {le}")

    return {"url": "", "full_url": "", "filename": "", "mime_type": mime}


async def extract_and_convert_mcp_images(
    obj: Any,
    base_url: Optional[str] = None,
    max_images: int = 15
) -> Tuple[Any, List[Dict[str, Any]]]:
    """
    Scans tool output data for any image/foto base64 data.
    Converts base64 data into directly accessible cached image files and URLs.
    Replaces raw base64 values with direct image URLs (and companion _url / _markdown fields).
    NEVER sends heavy raw base64 over the wire.
    """
    images: List[Dict[str, Any]] = []

    async def _walk(node: Any, parent_nik: Optional[str] = None, parent_name: Optional[str] = None) -> Any:
        if len(images) >= max_images:
            return node

        if isinstance(node, dict):
            rec_nik = str(node.get("NIK") or node.get("nik") or node.get("no_ktp") or node.get("id") or parent_nik or "").strip() or None
            rec_name = str(node.get("NAMA_LGKP") or node.get("nama") or node.get("name") or node.get("full_name") or parent_name or "").strip() or None

            new_dict = {}
            for k, v in node.items():
                k_lower = str(k).lower()
                is_img_key = any(w in k_lower for w in IMAGE_KEY_WORDS)
                if is_img_key and is_b64_image_val(v):
                    if len(images) < max_images:
                        info = await save_b64_image_cached(
                            v,
                            ref_nik=rec_nik,
                            ref_name=rec_name,
                            base_url=base_url
                        )
                        if info.get("url"):
                            chosen_url = info["url"]
                            new_dict[k] = chosen_url
                            new_dict[f"{k}_url"] = chosen_url
                            label = f"Foto - {rec_name}" if rec_name else f"Foto {k.title()}"
                            new_dict[f"{k}_markdown"] = f"![{label}]({chosen_url})"
                            images.append({
                                "type": "image_url",
                                "url": chosen_url,
                                "filename": info.get("filename", ""),
                                "mimeType": info.get("mime_type", "image/jpeg")
                            })
                        else:
                            new_dict[k] = "[IMAGE: invalid base64]"
                    else:
                        new_dict[k] = v
                elif is_img_key and isinstance(v, str) and os.path.isfile(v) and any(v.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']):
                    try:
                        with open(v, 'rb') as f:
                            raw_b64 = base64.b64encode(f.read()).decode('utf-8')
                        info = await save_b64_image_cached(
                            raw_b64,
                            ref_nik=rec_nik,
                            ref_name=rec_name,
                            base_url=base_url
                        )
                        if info.get("url"):
                            chosen_url = info["url"]
                            new_dict[k] = chosen_url
                            new_dict[f"{k}_url"] = chosen_url
                            label = f"Foto - {rec_name}" if rec_name else f"Foto {k.title()}"
                            new_dict[f"{k}_markdown"] = f"![{label}]({chosen_url})"
                            images.append({
                                "type": "image_url",
                                "url": chosen_url,
                                "filename": info.get("filename", ""),
                                "mimeType": info.get("mime_type", "image/jpeg")
                            })
                        else:
                            new_dict[k] = os.path.basename(v)
                    except Exception:
                        new_dict[k] = v
                elif isinstance(v, (dict, list)):
                    new_dict[k] = await _walk(v, parent_nik=rec_nik, parent_name=rec_name)
                elif isinstance(v, str) and len(v) >= 100 and is_b64_image_val(v):
                    info = await save_b64_image_cached(
                        v,
                        ref_nik=rec_nik,
                        ref_name=rec_name,
                        base_url=base_url
                    )
                    if info.get("url"):
                        chosen_url = info["url"]
                        new_dict[k] = chosen_url
                        new_dict[f"{k}_url"] = chosen_url
                        label = f"Foto - {rec_name}" if rec_name else "Foto"
                        new_dict[f"{k}_markdown"] = f"![{label}]({chosen_url})"
                        images.append({
                            "type": "image_url",
                            "url": chosen_url,
                            "filename": info.get("filename", ""),
                            "mimeType": info.get("mime_type", "image/jpeg")
                        })
                    else:
                        new_dict[k] = v
                else:
                    new_dict[k] = v
            return new_dict

        elif isinstance(node, list):
            res_list = []
            for item in node:
                res_list.append(await _walk(item, parent_nik=parent_nik, parent_name=parent_name))
            return res_list

        elif isinstance(node, str) and len(node) >= 60:
            if is_b64_image_val(node):
                info = await save_b64_image_cached(node, ref_nik=parent_nik, ref_name=parent_name, base_url=base_url)
                if info.get("url"):
                    images.append({
                        "type": "image_url",
                        "url": info["url"],
                        "filename": info.get("filename", ""),
                        "mimeType": info.get("mime_type", "image/jpeg")
                    })
                    return info["url"]
            return node

        return node

    cleaned = await _walk(copy.deepcopy(obj))
    return cleaned, images

def extract_mcp_images(obj: Any, max_images: int = 10) -> Tuple[Any, List[Dict[str, str]]]:
    """Synchronous fallback alias."""
    return obj, []

@app.get("/media/{filename}")
@app.get("/api/chat/media/{filename}")
async def get_media_file_proxy(filename: str):
    """
    Serves converted temporary image files directly from local storage or proxies from Backoffice API.
    Exempt from API key auth so images load seamlessly in browser/chat without bearer token.
    """
    clean_name = os.path.basename(filename.replace("\\", "/"))
    
    # 1. Check local uploads directory
    possible_dirs = [
        "/app/uploads/chat_temp/media",
        "./data/uploads/chat_temp/media",
        "uploads/chat_temp/media"
    ]
    for d in possible_dirs:
        fpath = os.path.join(d, clean_name)
        if os.path.isfile(fpath) and os.path.getsize(fpath) > 0:
            ext = clean_name.rsplit(".", 1)[-1].lower() if "." in clean_name else "jpg"
            mime_map = {
                "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "png": "image/png", "webp": "image/webp",
                "gif": "image/gif"
            }
            return FileResponse(fpath, media_type=mime_map.get(ext, "image/jpeg"), filename=clean_name)
    
    # 2. Proxy from Backoffice API if not found on local disk
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BACKOFFICE_API_URL}/api/chat/media/{clean_name}")
            if resp.status_code == 200:
                return Response(
                    content=resp.content,
                    media_type=resp.headers.get("content-type", "image/jpeg"),
                    headers={"Cache-Control": "public, max-age=86400"}
                )
    except Exception as e:
        logger.warning(f"Error proxying media file '{clean_name}': {e}")
    
    raise HTTPException(status_code=404, detail="Media not found or expired")

@app.post("/call_tool")
async def call_tool_endpoint(call: ToolCallRequest):
    result = await execute_tool(call.name, call.arguments)
    clean_result, images = await extract_and_convert_mcp_images(result)
    if images:
        clean_result["_mcp_images"] = images
    return JSONResponse(content=clean_result)

# ── JSON-RPC 2.0 & SSE Support for OpenWebUI / Claude / MCP Clients ──

class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[Any] = None
    method: str
    params: Optional[Dict[str, Any]] = None

@app.post("/rpc")
async def rpc_endpoint(req: JsonRpcRequest):
    method = req.method
    params = req.params or {}

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req.id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {},
                    "prompts": {"listChanged": False}
                },
                "serverInfo": {
                    "name": "mcp-knowledge-server",
                    "version": "1.0.0"
                }
            }
        }

    elif method == "prompts/list":
        # Dynamic discovery of MCP default personality prompt
        p_name = "Analis Intelijen & Penyelidikan BIN"
        p_desc = "Default personality and system instructions for this MCP knowledge assistant (configured via Backoffice)"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{BACKOFFICE_API_URL}/api/settings/personality")
                if res.status_code == 200:
                    p_data = res.json().get("personality", {})
                    if p_data.get("name"):
                        p_name = p_data["name"]
                        p_desc = f"[{p_name}] {p_data.get('role', '')} - {p_data.get('tone_of_voice', '')}".strip(" - ")
        except Exception:
            pass

        return {
            "jsonrpc": "2.0",
            "id": req.id,
            "result": {
                "prompts": [
                    {
                        "name": "default_personality",
                        "description": p_desc,
                        "arguments": [
                            {
                                "name": "user_context",
                                "description": "Optional user context or specific investigation query",
                                "required": False
                            }
                        ]
                    }
                ]
            }
        }

    elif method == "prompts/get":
        prompt_name = params.get("name")
        args_data = params.get("arguments", {}) or {}
        user_context = args_data.get("user_context", "")

        system_instruction = ""
        prompt_title = "Default MCP Personality"

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{BACKOFFICE_API_URL}/api/settings/personality")
                if res.status_code == 200:
                    data = res.json()
                    system_instruction = data.get("system_instruction", "")
                    p_data = data.get("personality", {})
                    prompt_title = p_data.get("name", prompt_title)
        except Exception as e:
            logger.warning(f"Could not fetch personality from backoffice: {e}")

        if not system_instruction:
            system_instruction = (
                "Anda adalah asisten AI resmi BIN (Badan Intelijen Nasional) dengan spesialisasi "
                "sebagai Analis Intelijen & Penyelidikan. Tugas utama Anda adalah membantu analisis kasus, "
                "penelusuran aset, profiling entitas, dan verifikasi silang data.\n"
                "Gunakan Bahasa Indonesia yang formal, lugas, presisi, objektif, dan berlandaskan fakta hukum. "
                "Jangan pernah mengarang informasi (anti-halusinasi)."
            )

        full_prompt_text = system_instruction
        if user_context:
            full_prompt_text += f"\n\n### KONTEKS TAMBAHAN PENGGUNA:\n{user_context}"

        return {
            "jsonrpc": "2.0",
            "id": req.id,
            "result": {
                "description": prompt_title,
                "messages": [
                    {
                        "role": "user",
                        "content": {
                            "type": "text",
                            "text": full_prompt_text
                        }
                    }
                ]
            }
        }

    elif method == "tools/list":
        all_tools = await get_all_tools_metadata()
        return {
            "jsonrpc": "2.0",
            "id": req.id,
            "result": {
                "tools": [
                    {
                        "name": t["name"],
                        "description": t["description"],
                        "inputSchema": t["parameters"]
                    }
                    for t in all_tools
                ]
            }
        }

    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        try:
            output = await execute_tool(tool_name, tool_args)
            clean_output, images = await extract_and_convert_mcp_images(output)

            content_blocks = [
                {
                    "type": "text",
                    "text": json.dumps(clean_output, indent=2)
                }
            ]

            return {
                "jsonrpc": "2.0",
                "id": req.id,
                "result": {
                    "content": content_blocks
                }
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": req.id,
                "error": {
                    "code": -32603,
                    "message": str(e)
                }
            }

    else:
        return {
            "jsonrpc": "2.0",
            "id": req.id,
            "error": {
                "code": -32601,
                "message": f"Method {method} not found"
            }
        }

# OpenWebUI SSE Endpoint
@app.get("/sse")
async def sse_endpoint(request: Request):
    async def event_generator():
        # Send initial endpoint information
        init_event = {
            "type": "endpoint",
            "endpoint": "/rpc"
        }
        yield {
            "event": "endpoint",
            "data": json.dumps(init_event)
        }

        # Keep-alive heartbeat
        while True:
            if await request.is_disconnected():
                break
            await asyncio.sleep(15)
            yield {
                "event": "ping",
                "data": "{}"
            }

    return EventSourceResponse(event_generator())

# ── Native MCP Protocol Endpoint ──────────────────────────────────────

try:
    from mcp.server import Server
    from mcp.server.sse import SseServerTransport
    import mcp.types as types
    HAS_MCP = True
except ImportError:
    HAS_MCP = False
    logger.warning("mcp library not found. Native MCP Protocol endpoints will not be available. Please rebuild the container.")

if HAS_MCP:
    mcp_native = Server("mcp_knowledge_network")
    sse = SseServerTransport("/mcp/messages")

    async def handle_list_tools(params: types.PaginatedRequestParams | None = None) -> types.ListToolsResult:
        all_tools = await get_all_tools_metadata()
        mcp_tools = []
        for t in all_tools:
            mcp_tools.append(
                types.Tool(
                    name=t["name"],
                    description=t["description"],
                    inputSchema=t["parameters"]
                )
            )
        return types.ListToolsResult(tools=mcp_tools)
    mcp_native.add_request_handler("tools/list", types.PaginatedRequestParams, handle_list_tools)

    async def handle_call_tool(params: types.CallToolRequestParams) -> types.CallToolResult:
        name = params.name
        arguments = params.arguments or {}
        try:
            output = await execute_tool(name, arguments)
            clean_output, images = await extract_and_convert_mcp_images(output)
            
            content_blocks = [
                types.TextContent(
                    type="text",
                    text=json.dumps(clean_output, indent=2)
                )
            ]
            return types.CallToolResult(content=content_blocks)
        except Exception as e:
            return types.CallToolResult(content=[
                types.TextContent(
                    type="text",
                    text=f"Error executing tool {name}: {str(e)}"
                )
            ])
    mcp_native.add_request_handler("tools/call", types.CallToolRequestParams, handle_call_tool)

    @app.get("/mcp")
    async def handle_mcp_sse(request: Request):
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as (read_stream, write_stream):
            await mcp_native.run(
                read_stream,
                write_stream,
                mcp_native.create_initialization_options()
            )

    @app.post("/mcp/messages")
    async def handle_mcp_messages(request: Request):
        await sse.handle_post_message(request.scope, request.receive, request._send)

