# MCP Knowledge & Network Intelligence Server

Enterprise-grade **Model Context Protocol (MCP) Server** with an integrated **Backoffice Management Suite**, multi-source knowledge ingestion, hybrid RAG (vector + graph), biometric face recognition, and an **OpenAI-compatible Chat API**.

Designed for seamless integration with **OpenWebUI**, **Claude Desktop**, **OpenAI SDK clients**, and autonomous LLM agents.

---

## 🌟 Key Capabilities

### 1. 🔌 MCP Server — OpenWebUI & Agent Integration
- **SSE** (`/sse`) and **JSON-RPC** (`/rpc`) transports for OpenWebUI and MCP-compatible clients.
- **Native MCP SDK** (`/mcp`, `/mcp/messages`) for Streamable HTTP transport.
- **API Key Authentication** (`mcp_<key>`) with per-key tool and knowledge base access control.
- **Dynamic tool discovery** from Backoffice API — new AI tools automatically appear in connected agents without restart.
- **Per-key permission scoping**: restrict which tools and knowledge bases each external client can access.

### 2. 🤖 OpenAI-Compatible Chat API
Full compliance with the **OpenAI Chat Completions standard** (based on the OpenAI API Postman collection):

| Feature | Detail |
|---|---|
| `POST /v1/chat/completions` | Drop-in replacement; accepts any OpenAI SDK client |
| `GET /v1/models` | Lists available LLM backends as OpenAI model objects |
| **Streaming** (`stream: true`) | Server-Sent Events — `data: {...}` chunks + `data: [DONE]` |
| **Structured Output** | `response_format: { type: "json_schema", json_schema: {...} }` |
| **Reasoning Models** | `reasoning_effort: low/medium/high` for o1/o3-family models |
| **Advanced Sampling** | `top_p`, `presence_penalty`, `frequency_penalty`, `seed`, `stop` |
| **Usage Tracking** | Returns `usage: { prompt_tokens, completion_tokens, total_tokens }` |
| **`finish_reason`** | `"stop"`, `"tool_calls"`, or `"length"` |
| **Response ID** | Unique `chatcmpl-{uuid}` per response |
| **`user` field** | End-user identifier forwarded to upstream LLM for abuse tracking |
| **`logprobs`** | Log probability support when backend provides it |

Streaming is also available on the Backoffice API at `POST /api/chat/stream`.

### 3. 📚 Hybrid RAG — Vector + Graph Knowledge Retrieval
- **ChromaDB Vector Store**: Semantic similarity search across all ingested documents.
- **Neo4j Knowledge Graph**: Entity & relationship extraction with multi-hop traversal.
- **Hybrid Scoring**: 70% semantic relevance + 30% authority validity score per chunk.
- **Validity Tier System** — every knowledge source is rated:
  - 🏆 **Tier 1 – Authoritative** (live DB/API queries, score 95/100)
  - ✅ **Tier 2 – Verified Internal** (trusted internal documents, 85/100)
  - 📄 **Tier 3 – Secondary Public** (web content, 65/100)
  - 📎 **Tier 4 – Unverified / Raw** (user uploads, external feeds)

### 4. 🗃️ Multi-Source Knowledge Ingestion
| Source Type | Supported Formats / Connectors |
|---|---|
| **Databases** | MySQL, PostgreSQL, Microsoft SQL Server, MongoDB, Oracle |
| **Documents** | PDF (with Tesseract OCR fallback for scanned pages), Word (`.docx`), Excel (`.xlsx`/`.xls`), CSV, Markdown, Text |
| **Web** | URL crawler (website), DuckDuckGo Web Search with deep scraping |
| **Google Drive** | Multi-account with Service Account / OAuth credential isolation |
| **REST APIs** | Dynamic token acquisition (OAuth2 / static Bearer), configurable endpoints |
| **MCP Servers** | Remote MCP server tool ingestion and live tool-call routing |
| **File Uploads** | In-chat document upload (PDF/DOCX/Excel/CSV/Text) with instant contextual RAG |

Ingestion is fully async via **Celery** + **Redis** workers with real-time job status tracking.

### 5. 🧰 Full MCP Tool Catalog

| Tool | Description |
|---|---|
| `search_knowledge_base` | Semantic vector search across all ingested documents |
| `get_entity_network_profile` | Deep relational graph for a named entity (Neo4j traversal) |
| `analyze_data_relationship` | Multi-hop path analysis between two entities |
| `get_graph_network_insights` | Global graph topology — top hubs, centrality, cluster analysis |
| `get_knowledge_orchestration_guidelines` | Fetch AI routing rules & active knowledge source catalog |
| `orchestrate_knowledge_search` | Full hybrid multi-source search (vector + graph + tool routing) |
| `recognize_face` | Identify a person from a photo against enrolled face profiles |
| `compare_faces` | Compute similarity score between two face images |
| `enroll_face` | Enroll a new face identity into the biometric database |
| `list_enrolled_faces` | List all enrolled face profiles |
| `get_retrieval_flow_for_prompt` | Fetch the matching remembered orchestration flow for a query |
| **Dynamic tools** | Any Database/API/MCP knowledge source marked `is_tool=true` is auto-exposed |

### 6. 🎭 AI Personality System
- **Multiple named personalities** (Curated Presets + Custom) — each with a unique name, tone, mission, and anti-hallucination level.
- **Greeting-based personality activation**: saying "Hello Jarvis" dynamically switches to the matching persona.
- **Configurable presets**: KPK Investigator, Customer Service, General Assistant, Technical Analyst, and more.
- **System prompt override** per personality for full LLM instruction control.

### 7. 🔁 Prompt Flow Memory (Orchestration Flows)
- Define **multi-step retrieval workflows** (tool call → graph traversal → vector search → synthesis) that are automatically matched and injected when a user query matches a known intent.
- **Default Golden Flows** pre-seeded:
  - NIK Identity Profiling & Dukcapil Verification
  - Land Asset & BPN Certificate Tracing
  - Business Entity & SIKAP Company Investigation
- Custom flows editable via the **Data Orchestrator** UI.

### 8. 👤 Biometric Face Recognition
- Enroll face profiles with person identity metadata (name, ID, department).
- Real-time identification during chat — images attached to messages are automatically scanned.
- Confidence-threshold matching with multi-candidate ranking.
- Inline photo rendering in chat responses via Markdown image tags.

### 9. 🌐 Data Network & Relation Profiling Graph
- **Neo4j** + **NetworkX**: entity extraction, semantic relationship discovery, multi-hop path-finding.
- Interactive **Cytoscape.js** graph explorer in Backoffice UI with force-directed layouts, node centrality, and AI narrative insights.

### 10. 🤖 Multi-LLM Backend Routing
- Register multiple **vLLM**, **Ollama**, **OpenAI**, **DeepSeek**, **OpenRouter**, **Groq**, **Mistral**, or **Gemini** backends.
- Task-based routing: assign different models for `general_qa`, `entity_extraction`, `summarization`, etc.
- **Reasoning model support**: automatic `max_completion_tokens` mode and `reasoning_effort` forwarding for o1/o3-family models.
- **Configurable timeouts**: `CLOUD_LLM_TIMEOUT` (default 60s) and `LOCAL_LLM_TIMEOUT` (default 600s).
- Live model listing via `/v1/models` or the Backoffice UI **LLM Management** page.

### 11. 💬 Advanced Chat Features
- **Few-shot auto-tuning**: user "👍 liked" responses are injected as style examples for future answers.
- **Negative feedback correction**: user "👎 disliked" notes are injected to prevent repeated mistakes.
- **Strict / Hallucination-free mode**: temperature=0, grounded exclusively on retrieved context.
- **Tool result caching**: configurable TTL per knowledge source with stale-while-revalidate background refresh.
- **Result deduplication**: SQL join / pagination duplicates automatically removed before LLM sees data.
- **Thinking / reasoning transparency**: `<think>` blocks and `reasoning_content` extracted and returned separately.
- **Photo auto-healing**: entity-aware base64 photo injection from tool results matched to LLM output.

### 12. 🔐 Security & RBAC
- **JWT-based authentication** with role-based access: `admin`, `editor`, `viewer`.
- **API Keys** with scoped permissions (tool allowlist, knowledge base allowlist).
- Middleware-level key validation with **in-memory caching** (60s TTL) to minimize latency.
- `MCP_AUTH_ENABLED` toggle for development environments.

### 13. 🗄️ Enterprise Data Persistence & Zero-Loss Protection
- Host bind-mount volumes under `./data/` survive container restarts and rebuilds.
- **Automated daily backups**: MySQL dumps, Neo4j snapshots, ChromaDB archives, Redis AOF — all packaged into timestamped `.tar.gz` in `./backups/`.

---

## 🏗️ Architecture Overview

```
                    ┌───────────────────────────────────────────┐
                    │  OpenWebUI / Claude Desktop / OpenAI SDK  │
                    └──────────────┬────────────────────────────┘
                                   │ SSE · JSON-RPC · /v1/chat/completions
                                   ▼
                    ┌──────────────────────────┐
                    │        MCP Server        │  ← API Key Auth · Dynamic Tool Discovery
                    │  :8001 (SSE/RPC/MCP)     │    Tool permission scoping per key
                    └────────┬─────────────────┘
                             │ REST (internal)
                             ▼
          ┌──────────────────────────────────────────────┐
          │         Backoffice API (FastAPI :8000)        │
          │                                              │
          │  /api/chat          – Hybrid RAG Chat        │
          │  /api/chat/stream   – Streaming SSE Chat     │
          │  /v1/chat/completions – OpenAI-Compatible    │
          │  /v1/models         – Model Listing          │
          │  /api/knowledge     – Source Management      │
          │  /api/personality   – AI Personality         │
          │  /api/orchestrator  – Flow Memory            │
          │  /api/llm-backends  – LLM Backend CRUD       │
          │  /api/face          – Face Enrollment        │
          └──┬───────────────────┬──────────────────┬────┘
             │                   │                  │
             ▼                   ▼                  ▼
  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
  │ ChromaDB Vectors │  │  Neo4j Graph   │  │ MySQL (RBAC) │
  └──────────────────┘  └────────────────┘  └──────────────┘
             ▲
  ┌──────────┴──────────────────────────────────────────────┐
  │              Celery Workers + Redis Queue               │
  │   PDF OCR · Document Parser · LLM Entity Extractor     │
  │   API Ingester · DB Ingester · MCP Tool Syncer         │
  └─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Environment Setup
```bash
cp .env.example .env
```
The `.env.example` ships with a pre-configured vLLM backend. Edit `.env` to point to your own LLM endpoints.

### 2. Development (with hot-reload)
```bash
make dev
# or:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### 3. Production (with Nginx reverse proxy)
```bash
make prod
# or:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Default admin credentials: **`admin`** / **`admin123`**

---

## 📍 Access Points

| Service | Dev URL | Production URL | Description |
|---|---|---|---|
| **Backoffice UI** | [http://localhost:5173](http://localhost:5173) | `http://<server-ip>/` (or `:8092`) | Full management dashboard |
| **OpenAI-compat API (via UI Proxy)** | [http://localhost:5173/v1](http://localhost:5173/v1) | — | OpenAI API proxied through Vite dev server |
| **OpenAI-compat API (Direct)** | [http://localhost:8002/v1](http://localhost:8002/v1) | `http://<server-ip>/v1` (or `:8092/v1`) | Full OpenAI Chat Completions & Models API |
| **Backoffice API Docs** | [http://localhost:8002/docs](http://localhost:8002/docs) | `http://<server-ip>/docs` | Interactive Swagger UI |
| **MCP SSE Endpoint** | [http://localhost:8001/sse](http://localhost:8001/sse) | `http://<server-ip>/sse` | OpenWebUI / MCP clients |
| **Neo4j Browser** | [http://localhost:7474](http://localhost:7474) | `http://<server-ip>:7474` | Graph explorer |

> **Authentication Note for `/v1/*` endpoints**:
> Both standard **JWT Bearer tokens** and **`mcp_<key>` API keys** (created in Backoffice API Keys page) are accepted in the `Authorization: Bearer <token_or_key>` header!

---

## 🔌 Connecting Clients

### OpenWebUI (MCP via SSE)
1. Go to **Admin Panel → Settings → Tools** (or **Connections → MCP Servers**).
2. Click **Add MCP Server**:
   - **Type**: `SSE`
   - **URL**: `http://<host>:8001/sse`
   - **Authorization**: `Bearer mcp_<your_api_key>`
3. **Save & Test** — discovered tools appear automatically.

### OpenAI SDK Client
Works with standard Python or TypeScript `openai` library using either a Backoffice JWT token or an `mcp_<key>` API key:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:5173/v1",  # Or http://localhost:8002/v1
    api_key="mcp_02caa26affbe30263fe91f894a3a16a82fdb3e8e5d8efd80665b73f9fa54af9f"  # MCP API Key or JWT token
)

# Standard chat completion — fully OpenAI-compatible
response = client.chat.completions.create(
    model="Qwen/Qwen3.6-35B-A3B-FP8",
    messages=[
        {"role": "developer", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Who won the world series in 2020?"},
        {"role": "assistant", "content": "The Los Angeles Dodgers won the World Series in 2020."},
        {"role": "user", "content": "Where was it played?"}
    ],
    temperature=0.0
)
print(response.choices[0].message.content)

# Streaming completion
stream = client.chat.completions.create(
    model="Qwen/Qwen3.6-35B-A3B-FP8",
    messages=[{"role": "user", "content": "Explain hybrid RAG in two sentences."}],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)

# List available models
models = client.models.list()
for m in models.data:
    print(m.id, "-", m.owned_by)
```

### curl Examples

#### 1. Standard Chat Completion (Non-Streaming)
```bash
curl --location 'http://localhost:5173/v1/chat/completions' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer mcp_02caa26affbe30263fe91f894a3a16a82fdb3e8e5d8efd80665b73f9fa54af9f' \
  --data '{
    "model": "Qwen/Qwen3.6-35B-A3B-FP8",
    "messages": [
      {"role": "developer", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Who won the world series in 2020?"},
      {"role": "assistant", "content": "The Los Angeles Dodgers won the World Series in 2020."},
      {"role": "user", "content": "Where was it played?"}
    ]
  }'
```

#### 2. Streaming Chat Completion (SSE)
```bash
curl -N --location 'http://localhost:5173/v1/chat/completions' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer mcp_02caa26affbe30263fe91f894a3a16a82fdb3e8e5d8efd80665b73f9fa54af9f' \
  --data '{
    "model": "Qwen/Qwen3.6-35B-A3B-FP8",
    "messages": [{"role": "user", "content": "Halo, sebutkan fitur utama MCP ini"}],
    "stream": true
  }'
```

#### 3. List Available Models
```bash
curl --location 'http://localhost:5173/v1/models' \
  --header 'Authorization: Bearer mcp_02caa26affbe30263fe91f894a3a16a82fdb3e8e5d8efd80665b73f9fa54af9f'
```

---

## 🖥️ Backoffice UI Pages

| Page | Description |
|---|---|
| **Dashboard** | System stats — sources, jobs, backends, feedback metrics |
| **Knowledge Sources** | CRUD for all knowledge sources with per-source validity tier config |
| **Ingest Jobs** | Real-time job monitoring with logs and retry |
| **LLM Backends** | Add/test/route LLM backends; task-model assignments |
| **Chat** | Full RAG chat UI with streaming, file upload, face scan, source citations |
| **Network Explorer** | Interactive Cytoscape.js graph — multi-hop path-finding, cluster analysis |
| **Data Orchestrator** | Prompt Flow Memory — create/edit/test multi-step retrieval flows |
| **MCP Personality** | Configure AI personas, tone, mission, and custom instructions |
| **API Keys** | Manage MCP API keys with tool and KB scoping |
| **Database Settings** | Configure connection parameters for database sources |
| **Users** | User management with RBAC role assignment |

---

## 📦 Data Storage & Backup

Host-persisted directories under `./data/`:

| Directory | Contents |
|---|---|
| `./data/mysql` | Backoffice schema — users, jobs, backends, feedback, flows |
| `./data/chromadb` | Vector embeddings (ChromaDB) |
| `./data/neo4j` | Entity knowledge graph (Neo4j) |
| `./data/redis` | Celery task queue (Redis AOF) |
| `./data/uploads` | Uploaded document files |
| `./backups` | Automated daily `.tar.gz` snapshots |

```bash
# Manual backup now:
make backup

# List backups:
ls -la backups/

# Restore from snapshot:
make restore BACKUP_FILE=backups/backup_YYYYMMDD_HHMMSS.tar.gz
```

---

## ⚙️ Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_OPENAI_API_BASE` | `http://172.16.21.122:18000/v1` | Primary LLM backend URL |
| `DEFAULT_OPENAI_MODEL` | `Qwen/Qwen3.6-35B-A3B-FP8` | Default model name |
| `MCP_AUTH_ENABLED` | `true` | Enable/disable MCP API key auth |
| `CLOUD_LLM_TIMEOUT` | `60` | Timeout (seconds) for cloud LLMs |
| `LOCAL_LLM_TIMEOUT` | `600` | Timeout (seconds) for local/vLLM |
| `SECRET_KEY` | *(set in .env)* | JWT signing secret |
| `MYSQL_*` | *(see .env.example)* | MySQL connection settings |
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j connection |
| `CHROMADB_HOST` | `chromadb` | ChromaDB host |
| `REDIS_URL` | `redis://redis:6379/0` | Redis for Celery |

---

## 🛠️ Makefile Commands

```bash
make dev       # Start in development mode (hot-reload)
make prod      # Start in production mode (Nginx + resource limits)
make down      # Stop all containers
make logs      # Tail all service logs
make backup    # Run backup immediately
make restore BACKUP_FILE=<path>  # Restore from backup
```
