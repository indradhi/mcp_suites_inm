import os
import re
import json
import base64
import copy
import logging
import asyncio
import time as _time
from typing import Dict, Any, List, Optional, Tuple
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, Field
import httpx

from vector_client import VectorClient
from graph_client import GraphClient

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

        # Skip auth for exempt paths
        if request.url.path in AUTH_EXEMPT_PATHS:
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
        "description": "Search the knowledge base vector store for documents, PDFs (with OCR), spreadsheets, Word docs, web search results, and database records relevant to the query.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or concept to find relevant knowledge for."
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
        "description": "Orchestrate a multi-source intelligent search across all knowledge sources (Vector Store, Knowledge Graph, and dynamic Database/API sources) according to AI search guidelines. Analyzes user input, queries relevant sources simultaneously, extracts entity relationships, suggests or invokes real-time tools, and returns a consolidated, grounded context package with guidelines for final response generation.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or user input to orchestrate across knowledge base sources."
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

                        properties[p_name] = {
                            "type": schema_type,
                            "description": p.get("description") or f"Parameter {p_name}"
                        }
                        if p.get("required"):
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
    return TOOLS_METADATA + clean_dynamic

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
    if name == "search_knowledge_base":
        query = args.get("query", "")
        max_results = int(args.get("max_results", 5))
        if not query:
            return {"error": "Query parameter is required"}
        results = await vector_client.search_knowledge(query_text=query, n_results=max_results)
        return {
            "tool": name,
            "query": query,
            "count": len(results),
            "results": results
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
                "core_mission": "Analis Intelijen & Penyelidikan KPK. Melakukan penelaahan bukti, penelusuran aset, profiling entitas terduga, verifikasi silang dokumen & data lapangan, serta menjaga integritas anti-halusinasi.",
                "personality": {
                    "name": "Analis Intelijen & Penyelidikan KPK",
                    "role": "Analis Intelijen & Penyelidikan Korupsi",
                    "tone_of_voice": "Formal, lugas, analitis, presisi, objektif, berintegritas tinggi",
                    "preset": "kpk_investigator"
                },
                "input_processing_protocol": [
                    {
                        "step": 1,
                        "phase": "Query Intent Classification",
                        "rules": [
                            "Classify query into factual document search, graph network inquiry, or live database/API lookup.",
                            "Extract key named entities, proper nouns, dates, and identifiers."
                        ]
                    },
                    {
                        "step": 2,
                        "phase": "Source Routing Decision Tree",
                        "rules": [
                            "Rule A: For live land/asset ownership or database records, invoke matching tools (e.g. cari_tanah_bpn, db_*).",
                            "Rule B: For relationships between people or companies, query Neo4j with 'get_entity_network_profile' or 'analyze_data_relationship'.",
                            "Rule C: For documents, policies, and files, query ChromaDB with 'search_knowledge_base' or 'orchestrate_knowledge_search'."
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
                "vector_store": "ChromaDB (collection: knowledge_base)",
                "knowledge_graph": "Neo4j Graph Database"
            },
            "query_recommendations": {
                "query": query,
                "suggested_action": "Use 'orchestrate_knowledge_search' for automated multi-source retrieval."
            } if query else None
        }

    elif name == "orchestrate_knowledge_search":
        query = args.get("query", "")
        if not query:
            return {"error": "query parameter is required"}
        strategy = args.get("search_strategy", "hybrid")
        max_results = int(args.get("max_results", 5))
        source_types = args.get("source_types")

        # 1. Attempt delegating to Backoffice API
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{BACKOFFICE_API_URL}/api/knowledge/orchestrate-search",
                    json={
                        "query": query,
                        "search_strategy": strategy,
                        "source_types": source_types,
                        "max_results": max_results
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    data["tool"] = name
                    return data
        except Exception as e:
            logger.debug(f"Backoffice orchestrate-search exception ({e}), falling back to local synthesis")

        # 2. Local Fallback Multi-Source Orchestration
        vector_results = []
        if strategy in ["hybrid", "semantic_only", "comprehensive"]:
            vector_results = await vector_client.search_knowledge(query_text=query, n_results=max_results)

        graph_entities = []
        if strategy in ["hybrid", "graph_only", "comprehensive"]:
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

        return {
            "tool": name,
            "query": query,
            "strategy_applied": strategy,
            "retrieved_documents": vector_results,
            "graph_entities": graph_entities,
            "applicable_tools": applicable_tools,
            "ai_guidelines": [
                f"Retrieved {len(vector_results)} document chunk(s) and {len(graph_entities)} graph entity profile(s).",
                "PRIORITAS SUMBER DATA: Data yang didapat langsung dari query database/API live adalah PRIORITAS UTAMA MUTLAK yang wajib ditampilkan terlebih dahulu kepada pengguna di atas dokumen RAG/vektor.",
                "Ground your answer strictly in these findings. Cite document IDs and source names.",
                "If information is missing, clearly state that it is not found in the knowledge repository."
            ]
        }

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
                        "data_priority": "PRIORITAS_UTAMA_MUTLAK (Data diambil langsung secara real-time dari database/source data resmi KPK)",
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
IMAGE_KEY_WORDS = {'image', 'foto', 'photo', 'gambar', 'picture', 'avatar', 'img'}

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

def extract_mcp_images(obj: Any, max_images: int = 10) -> Tuple[Any, List[Dict[str, str]]]:
    """
    Scans tool output data for any image, foto, photo, gambar, or picture base64 data.
    Converts and extracts them into standard Model Context Protocol (MCP) image content blocks:
      {"type": "image", "data": "<base64_payload>", "mimeType": "image/jpeg" | "image/png" ...}
    Supports multiline wrapped base64, dictionary keys, and pipe/colon delimiters in text.
    Also replaces long base64 strings in the text JSON with concise placeholder notes
    so LLM token budget is preserved while images are properly rendered in OpenWebUI/Claude.
    """
    images: List[Dict[str, str]] = []

    # Regex matching keyword-prefixed base64 or explicit image base64, supporting multiline wraps
    text_img_regex = re.compile(
        r'(?P<prefix>(?:(?:foto|photo|image|gambar|picture)[\s_]*[:=]\s*)|(?:[\|\n]\s*))'
        r'(?P<data>(?:data:image/[^;\s]+;base64,[A-Za-z0-9+/=\s\r\n]{40,}|/9j/[A-Za-z0-9+/=]{40,}(?:\r?\n[A-Za-z0-9+/=]{40,})*(?:\r?\n[A-Za-z0-9+/=]+={0,2})?|iVBORw0KGgo[A-Za-z0-9+/=]{40,}(?:\r?\n[A-Za-z0-9+/=]{40,})*(?:\r?\n[A-Za-z0-9+/=]+={0,2})?))',
        re.IGNORECASE
    )

    def _traverse(node: Any) -> Any:
        if len(images) >= max_images:
            return node

        if isinstance(node, dict):
            new_dict = {}
            for k, v in node.items():
                k_lower = str(k).lower()
                is_img_key = any(w in k_lower for w in IMAGE_KEY_WORDS)
                if is_img_key and is_b64_image_val(v):
                    if len(images) < max_images:
                        mime = detect_mime_type(v)
                        raw_b64 = clean_b64_data(v)
                        images.append({"type": "image", "data": raw_b64, "mimeType": mime})
                        new_dict[k] = f"[IMAGE_ATTACHED: {mime}, length={len(raw_b64)} chars]"
                    else:
                        new_dict[k] = v
                elif is_img_key and isinstance(v, str) and os.path.isfile(v) and any(v.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']):
                    try:
                        with open(v, 'rb') as f:
                            raw_b64 = base64.b64encode(f.read()).decode('utf-8')
                            mime = 'image/png' if v.lower().endswith('.png') else ('image/webp' if v.lower().endswith('.webp') else 'image/jpeg')
                            images.append({"type": "image", "data": raw_b64, "mimeType": mime})
                            new_dict[k] = f"[IMAGE_ATTACHED: {mime}, file={os.path.basename(v)}]"
                    except Exception:
                        new_dict[k] = v
                else:
                    new_dict[k] = _traverse(v)
            return new_dict

        elif isinstance(node, list):
            return [_traverse(item) for item in node]

        elif isinstance(node, str) and len(node) >= 60:
            def _replace_embedded(match):
                if len(images) >= max_images:
                    return match.group(0)
                prefix = match.group('prefix')
                b64_content = match.group('data')
                raw_b64 = clean_b64_data(b64_content)
                if len(raw_b64) < 100:
                    return match.group(0)
                mime = detect_mime_type(b64_content)
                images.append({"type": "image", "data": raw_b64, "mimeType": mime})
                return f"{prefix}[IMAGE_ATTACHED: {mime}, length={len(raw_b64)} chars]"

            return text_img_regex.sub(_replace_embedded, node)

        return node

    cleaned = _traverse(copy.deepcopy(obj))
    return cleaned, images

@app.post("/call_tool")
async def call_tool_endpoint(call: ToolCallRequest):
    result = await execute_tool(call.name, call.arguments)
    clean_result, images = extract_mcp_images(result)
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
        p_name = "Analis Intelijen & Penyelidikan KPK"
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
                "Anda adalah asisten AI resmi KPK (Komisi Pemberantasan Korupsi) dengan spesialisasi "
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
            clean_output, images = extract_mcp_images(output)

            content_blocks = [
                {
                    "type": "text",
                    "text": json.dumps(clean_output, indent=2)
                }
            ]
            for img in images:
                content_blocks.append(img)

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
            clean_output, images = extract_mcp_images(output)
            
            content_blocks = []
            content_blocks.append(
                types.TextContent(
                    type="text",
                    text=json.dumps(clean_output, indent=2)
                )
            )
            for img in images:
                content_blocks.append(
                    types.ImageContent(
                        type="image",
                        data=img["data"],
                        mimeType=img["mimeType"]
                    )
                )
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

