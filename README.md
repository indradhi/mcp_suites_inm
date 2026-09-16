# MCP Knowledge & Network Intelligence Server

Enterprise-grade **Model Context Protocol (MCP) Server** with an integrated **Backoffice Management Suite**, multi-source knowledge ingestion, vector storage, and **network relation profiling & reasoning graph**.

Designed for seamless integration with **OpenWebUI**, **Claude Desktop**, and autonomous LLM agents.

---

## 🌟 Key Capabilities

1. **OpenWebUI Integration via MCP**:
   - High-throughput SSE (`/sse`) and JSON-RPC (`/rpc`) endpoints.
   - Dynamic tool discovery: semantic knowledge search (`search_knowledge_base`), entity relation profiling (`get_entity_network_profile`), multi-hop path analysis (`analyze_data_relationship`), and network insights (`get_graph_network_insights`).

2. **Multi-Source Knowledge Ingestion**:
   - **Databases**: Native connectors for **MySQL**, **PostgreSQL**, **Microsoft SQL Server**, **MongoDB**, and **Oracle Database**.
   - **Documents with Scanned Image OCR**: Ingests PDFs, Excel (`.xlsx`/`.xls`), Word (`.docx`), Markdown, CSV, and Text. **Automatic Tesseract OCR fallback** processes scanned/image-based PDFs.
   - **Web & Live Search**: Clean website URL crawling and **DuckDuckGo Web Search** ingestion with automatic top-result deep scraping.
   - **Google Drive**: Multi-account Google Drive framework with Service Account / OAuth credential isolation.
   - **APIs**: REST API connector with support for dynamic token acquisition (OAuth2 / Token endpoints) or static Bearer tokens.

3. **Data Network & Relation Profiling Graph**:
   - Uses **Neo4j** and **NetworkX** to extract entities and discover semantic relationship networks across disparate knowledge sources.
   - Interactive **Cytoscape.js** graph explorer in Backoffice UI with force-directed layouts, node centrality profiling, multi-hop path-finding, and AI narrative insights.

4. **Multi-LLM Backends & Model Routing**:
   - Add multiple **vLLM**, **Ollama**, or **OpenAI** backends.
   - Pre-configured out of the box with your remote vLLM cluster:
     - `OPENAI_API_BASE=http://172.16.21.122:18000/v1`
     - `OPENAI_API_KEY=sk-IrR7Bwxtin0haWagUnPrBgq5PurnUz86`
     - `OPENAI_MODEL=Qwen/Qwen3.6-35B-A3B-FP8`
   - Dynamically route tasks (Entity Extraction, Summarization, QA) to different models.

5. **Enterprise Data Persistence & Zero-Loss Protection**:
   - Host bind-mount directories (`./data/mysql`, `./data/redis`, `./data/chromadb`, `./data/neo4j`, `./data/uploads`, `./backups`).
   - Automated daily backup container executing MySQL dumps, Neo4j snapshots, ChromaDB backups, and Redis AOF persistence.

6. **Professional Backoffice UI/UX**:
   - Built with React 18, Vite, Lucide icons, Cytoscape.js, and dark-mode glassmorphism design.
   - Secure Role-Based Access Control (RBAC) backed by MySQL (`admin`, `editor`, `viewer`).

---

## 🏗️ Architecture Overview

```
                          ┌────────────────────────┐
                          │   OpenWebUI / Agent    │
                          └───────────┬────────────┘
                                      │ (SSE / JSON-RPC :8001)
                                      ▼
                          ┌────────────────────────┐
                          │       MCP Server       │
                          └─────┬────────────┬─────┘
                                │            │
                ┌───────────────┘            └───────────────┐
                ▼                                            ▼
      ┌──────────────────┐                         ┌──────────────────┐
      │  ChromaDB Vector │                         │   Neo4j Graph    │
      └──────────────────┘                         └──────────────────┘
                ▲                                            ▲
                │                                            │
┌───────────────┴────────────────────────────────────────────┴───────────────┐
│                           Celery Distributed Workers                        │
│          (Document Parsers, Tesseract OCR, LLM Entity Extractor)            │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
┌─────────────────────────────────────┴───────────────────────────────────────┐
│                     Backoffice API (FastAPI) & UI (Vite)                    │
│   MySQL RBAC · REST APIs · Ingest Orchestrator · Cytoscape Network Visualizer│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Environment Setup
Copy the environment template:
```bash
cp .env.example .env
```
*(The default predefined LLM backend settings for `http://172.16.21.122:18000/v1` are already configured inside `.env.example`).*

### 2. Run on Development Laptop
To run locally with hot-reloading:
```bash
make dev
# or:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```
Access points:
- **Backoffice UI**: [http://localhost:5173](http://localhost:5173) (or `http://localhost:80` in prod)
- **Backoffice API Docs**: [http://localhost:8002/docs](http://localhost:8002/docs) (or [http://localhost:5173/docs](http://localhost:5173/docs))
- **MCP Server Endpoint**: [http://localhost:8001/sse](http://localhost:8001/sse)
- **Neo4j Browser**: [http://localhost:7474](http://localhost:7474)

Default Admin Credentials:
- **Username**: `admin`
- **Password**: `admin123`

### 3. Deploy to Linux Production Server
For production with Nginx reverse proxy, resource constraints, and auto-restart:
```bash
make prod
# or:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## 🔌 Service Access Points & Connecting OpenWebUI

<details open>
<summary><b>🌐 Click to Expand/Collapse Available Access Points & OpenWebUI Guide</b></summary>

### 📍 Available Access Points (Clickable)

| Service | Development URL | Production URL (Nginx) | Description |
| :--- | :--- | :--- | :--- |
| **MCP SSE Endpoint** | [http://localhost:8001/sse](http://localhost:8001/sse) | [http://<server-ip>/sse](http://localhost/sse) *(or `:8001/sse`)* | Primary SSE stream for OpenWebUI & MCP clients |
| **Backoffice Web UI** | [http://localhost:5173](http://localhost:5173) | [http://<server-ip>/](http://localhost/) | Knowledge Base management, face enrollment & AI chat |
| **Backoffice API Docs** | [http://localhost:8002/docs](http://localhost:8002/docs) | [http://<server-ip>/docs](http://localhost/docs) | Interactive Swagger OpenAPI documentation |
| **Neo4j Graph Browser** | [http://localhost:7474](http://localhost:7474) | [http://<server-ip>:7474](http://localhost:7474) | Interactive Cypher graph visualizer |

### 🛠️ How to Connect OpenWebUI

In your OpenWebUI settings:
1. Navigate to **Admin Panel** > **Settings** > **Tools** (or **Connections** > **MCP Servers**).
2. Click **Add MCP Server**:
   - **Type**: `SSE`
   - **URL (Production via Nginx)**: `http://<host-ip>/sse`
   - **URL (Direct Port)**: `http://<host-ip>:8001/sse`
3. Click **Save & Test Connection**.
4. Discovered AI Tools:
   - `search_knowledge_base`: Retrieves semantically relevant context chunks.
   - `get_entity_network_profile`: Fetches deep relational graphs for named entities.
   - `analyze_data_relationship`: Multi-hop reasoning between entities.
   - `get_graph_network_insights`: Global network topology and cluster hubs.
   - `recognize_face`: Facial recognition against enrolled person profiles.

</details>

---

## 📦 Data Storage & Backup Commands

Host data directories are preserved outside the container filesystem under `./data/`:
- `./data/mysql` (Backoffice schema, users, jobs, backends)
- `./data/chromadb` (Persistent knowledge embeddings)
- `./data/neo4j` (Entity relation graph)
- `./data/redis` (Queue persistence)
- `./data/uploads` (Uploaded documents)
- `./backups` (Automated daily snapshots)

Manual backup & restore:
```bash
# Run backup immediately:
make backup

# List all existing backups:
ls -la backups/

# Restore from backup archive:
make restore BACKUP_FILE=backups/backup_YYYYMMDD_HHMMSS.tar.gz
```
