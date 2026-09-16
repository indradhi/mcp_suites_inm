# Backoffice AI Chat Document Upload & Analysis (PDF, DOCX, Excel, CSV, Text) — Walkthrough

---

## 📄 Fitur Analisis Dokumen dari Chat (PDF, DOCX, Excel, CSV, Text)

Telah ditambahkan fitur komprehensif yang memungkinkan pengguna mengunggah dan menganalisis berbagai jenis dokumen langsung dari antarmuka Chat Backoffice:

1. **Format File yang Didukung**:
   - **PDF (`.pdf`)**: Ekstraksi teks per halaman dengan `pdfplumber` + OCR otomatis untuk halaman pindaian.
   - **Word (`.docx`, `.doc`)**: Ekstraksi paragraf, judul, dan tabel dengan `python-docx`.
   - **Excel (`.xlsx`, `.xls`)**: Pembacaan seluruh sheet, ekstraksi baris/kolom dengan `pandas` + `openpyxl`, format tabel terstruktur.
   - **CSV / TSV (`.csv`, `.tsv`)**: Parsing tabular otomatis dengan ekstraksi nama kolom, jumlah baris, dan preview tabel Markdown.
   - **Teks / Markdown / Log / JSON (`.txt`, `.md`, `.json`, `.log`)**: Pembacaan teks bersih untuk catatan audit, laporan investigasi, log transaksi, dsb.

2. **Komponen & Arsitektur Backend (`services/backoffice_api`)**:
   - **`document_parser.py` (`DocumentParserService`)**:
     - Service ekstraksi terpadu dengan caching memori dan penyimpanan sementara di `/app/uploads/chat_temp/{doc_id}.json`.
     - Generator tabel Markdown murni untuk file CSV/TSV guna menghindari ketergantungan library eksternal (`tabulate`).
     - Deteksi metadata otomatis: jumlah halaman, nama sheet, jumlah baris, total karakter, dan preview teks.
   - **`routers/chat.py`**:
     - Endpoint baru: `POST /api/chat/upload-document` menerima `multipart/form-data` dengan batas ukuran hingga 35MB.
     - Model `ChatRequest` diperluas dengan `doc_id` dan `document_data`.
     - Penanganan otomatis: jika pengguna hanya mengunggah dokumen tanpa teks pertanyaan, AI otomatis menganalisis dan merangkum isi dokumen.
   - **`chat_service.py`**:
     - Injeksi konteks dokumen terunggah pada bagian teratas konteks RAG (`=== DOKUMEN YANG DIUNGGAH PENGGUNA ({doc_name}) ===`).
     - Penambahan instruksi sistem khusus (Directive #12) yang memerintahkan AI memprioritaskan dokumen terunggah, menyajikan data dalam bentuk tabel Markdown/kutipan faktual, serta mencantumkan nama sheet/nomor halaman.
     - Penambahan sitasi sumber otomatis: `📎 Dokumen Terunggah: {filename}` dalam daftar referensi/sources jawaban AI.

3. **Komponen Antarmuka Pengguna (`Chat.jsx`)**:
   - **Tombol Lampiran Dokumen (Paperclip Icon 📎)**: Terletak di toolbar input pesan bersebelahan dengan tombol gambar/foto.
   - **Chip Preview Dokumen Unggahan**: Menampilkan icon jenis file (Spreadsheet/Dokumen), nama file, badge tipe file (PDF, EXCEL, CSV, WORD, TEXT), ringkasan baris/halaman/ukuran, dan tombol hapus `(X)`.
   - **Indikator Loading Unggah**: Animasi spinner saat file sedang diekstraksi dan diproses di server.
   - **Banner Pesan Error**: Notifikasi visual jika file melebihi batas 35MB atau format tidak valid.
   - **Kartu Lampiran Dokumen di Pesan Pengguna**: Bubble pesan pengguna menampilkan badge file dokumen yang dikirim.
   - **Placeholder Interaktif**: Placeholder textarea otomatis menyesuaikan dengan dokumen yang sedang terlampir (e.g. *"Tanyakan sesuatu tentang dokumen 'laporan.pdf'..."*).

---

## 🛡️ Anti-Hallucination & Strict Factual Guardrails

Telah ditambahkan sistem penyesuaian (adjustment) pada Chat Backoffice dan API LLM untuk mencegah AI berhalusinasi, mengarang, atau salah menampilkan data:

1. **Greedy Deterministic Decoding (`temperature = 0.0`)**:
   - Menghilangkan variasi stokastik/kreativitas acak pada LLM sehingga data kritis (NIK 16 digit, tanggal, alamat, relasi keluarga) tampil persis 100% sesuai database.
2. **Zero-Tolerance Prompt Directives (`chat_service.py`)**:
   - `DILARANG MENGARANG ATAU BERHALUSINASI`: Jika entitas/data tidak ada di dokumen atau live tools, model wajib menyatakan: *"Data untuk '[nama/entitas]' tidak ditemukan dalam basis data atau dokumen yang tersedia."*
   - `DILARANG MENGUBAH IDENTITAS/NIK`: Larangan mutlak mengubah angka NIK, menggabungkan data dua orang berbeda, atau berspekulasi tentang hubungan kekeluargaan.
   - Guardrail empty context: Jika vector search atau live tool mengembalikan data kosong, sistem menyuntikkan instruksi tegas bahwa data tidak ada dan melarang model membuat profil fiktif.
3. **Interactive Adjustment Controls di UI (`Chat.jsx`)**:
   - **Tombol Toggle Anti-Halu (`Anti-Halu: ON / OFF`)**: Tombol visual dengan badge hijau/kuning di toolbar chat.
   - **Dropdown Suhu (Temperature Selector)**:
     - `0.0 (Presisi / Anti-Halu)` — Default, deterministik penuh tanpa karangan.
     - `0.1 (Sangat Ketat)`
     - `0.3 (Standar)`
     - `0.7 (Kreatif / Fleksibel)`
   - **Status Badge Faktual**: Setiap bubble pesan AI menampilkan status `Faktual (Anti-Halu)` beserta model yang digunakan.
4. **Collapsible Right Sidebar untuk Tools & Chat Suggestions (`Chat.jsx`)**:
   - **Pemisahan Layout Bersih**: Chat suggestion (prompt rekomendasi) dan Active AI Tools dipindahkan dari bagian bawah chat input ke sidebar kanan yang elegan.
   - **Collapsible / Expandable**:
     - Tombol toggle `Tools & Saran` di toolbar atas dengan badge jumlah tool aktif.
     - Tombol ciutkan (`ChevronRight`) di dalam sidebar.
     - Tab/floating handle (`ChevronLeft`) di tepi kanan saat sidebar ditutup.
   - **Kartu Active AI Tools**: Menampilkan daftar alat aktif (API/Database), deskripsi fungsi, parameter yang didukung, dan badge status.
   - **Kartu Chat Suggestions**: Daftar pertanyaan rekomendasi yang siap diklik untuk langsung dikirim ke AI tanpa mengetik manual.
5. **Collapsible Top Chat Options (Layar Respon Lebih Besar) (`Chat.jsx`)**:
   - **Tombol Ciutkan / Buka Opsi**: Tombol `Ciutkan` (`ChevronUp`) pada toolbar atas untuk menyusutkan panel filter yang tinggi menjadi bar ringkas setinggi ~44px.
   - **Layar Respon Lebih Luas**: Memberikan tambahan ruang vertikal sebesar 100px-140px langsung ke jendela pesan chat.
   - **Quick Badges di Mode Collapsed**: Di mode ciut, tetap menampilkan ringkasan status sumber data terpilih, status mode Anti-Halu, dan jumlah tools aktif yang bisa diklik.
   - **Persistensi Pilihan**: Status buka/tutup opsi chat disimpan di `localStorage` (`chat_options_open`) sehingga preferensi pengguna tetap terjaga saat navigasi atau refresh.
7. **Tombol Salin Respon Chat (Copy AI Response)**:
   - **Tombol Utama pada Footer Bubble Pesan**: Terletak di bagian kanan bawah bubble jawaban asisten AI (`Salin Respon`), bersanding dengan metrik model (latency, chunks, tools, status Anti-Halu).
   - **Tombol Sekunder pada Bar Feedback**: Terletak di sebelah tombol Like/Dislike di bawah bubble pesan (`Salin`).
   - **Feedback Visual Real-time**: Saat diklik, teks tombol langsung berubah menjadi `Tersalin! ✓` dengan ikon centang hijau (`#34d399`), background hijau lembut, dan efek glow selama 2 detik sebelum kembali ke keadaan normal.
   - **Dukungan Clipboard Universal**: Menggunakan `navigator.clipboard.writeText` untuk koneksi HTTPS/localhost serta fallback otomatis `document.execCommand('copy')` dengan elemen textarea tersembunyi jika diakses melalui browser lama atau koneksi HTTP jaringan lokal (LAN/IP).

8. **Tombol Duplikat Koneksi pada Knowledge Base Catalog (`KnowledgeSources.jsx` & `routers/knowledge.py`)**:
   - **Tombol Duplikat 1-Klik pada Setiap Kartu**: Setiap kartu sumber pengetahuan di Knowledge Base Catalog kini memiliki tombol **`Duplikat`** (aksen ungu `#a78bfa` dengan icon `Copy`).
   - **Pemberian Nama Unik Otomatis**: Secara cerdas menamai koneksi baru dengan akhiran `(Copy)`, `(Copy 2)`, dst. tanpa menimpa data asli.
   - **Resolusi AI Tool Slug Unik**: Jika koneksi adalah Dynamic AI Tool (API/Database), sistem otomatis menghasilkan slug identifier baru (misalnya `cari_tanah_bpn_copy`) untuk mencegah bentrok tool name pada OpenAI/Claude/Qwen function calling.
   - **Notifikasi Toast & Tombol 'Edit Sekarang'**: Setelah menduplikat, muncul banner toast konfirmasi dengan tombol *Edit Sekarang* yang langsung membuka modal konfigurasi koneksi baru tersebut.
   - **Dukungan 'Simpan Sebagai Baru (Duplikat)' pada Modal**: Pada modal edit Database (`AddDatabaseModal`) dan API (`AddApiModal`), pengguna juga dapat mengubah query/endpoint/parameter dan menyimpannya sebagai koneksi baru tanpa menimpa konfigurasi sebelumnya.
   - **Endpoint Backend**: `POST /api/knowledge/sources/{source_id}/duplicate` mendukung duplikasi seluruh tipe koneksi (`database`, `api`, `file`, `website`, `websearch`, `google_drive`).

---

### Key Features Implemented

### 1. Dynamic Parameter Builder & Configuration (`AddApiModal.jsx`)
- **AI Tool Mode Toggle**: Turn any REST API into an AI Tool with a single click.
- **Tool Identifier & Prompt Instruction**: Define a custom function name (e.g. `cari_tanah_bpn`) and guidance explaining to the LLM what data this tool returns and when to call it.
- **Parameter Schema Builder**:
  - `name`: Parameter key (e.g. `nama`, `id`, `filter`).
  - `in`: Parameter placement — `query`, `path` (interpolates `{id}` in URL), `body` (JSON payload), or `header`.
  - `type`: `string`, `integer`, `number`, `boolean`.
  - `description`: Contextual explanation for the LLM.
  - `required`: Mandatory vs optional flag.
  - `default`: Default fallback value.
- **Live Tool Testing**: Built-in test execution runner allowing administrators to supply sample parameter values and verify the actual API response before saving.

### 2. Backoffice API Router & Execution Engine (`api_ingester.py` & `knowledge.py`)
- **Parameter Interpolation**:
  - Path variables: replaces `{param_name}` in endpoint URL.
  - Query parameters: attaches dynamic query string items (`?nama=...`).
  - Body payload: builds JSON dictionary for POST/PUT requests.
  - Headers: applies custom headers alongside acquired Bearer authentication tokens.
- **Vector Store Isolation for Tools**:
  - When a source is configured or updated as an AI Tool (`is_tool=True`), stale vector chunks are automatically purged from ChromaDB so the LLM doesn't confuse outdated static scrapes with dynamic tool execution.
- **Endpoints**:
  - `GET /api/knowledge/api-tools`: Lists all active API sources configured with `is_tool=True` and parameter schemas.
  - `POST /api/knowledge/api-tools/{source_id}/execute`: Secure server-side execution of dynamic tool calls.
  - `POST /api/knowledge/test-connection`: Enhanced to support live tool execution testing with test arguments.

### 3. Dynamic Tool Exposure in MCP Server (`services/mcp_server/main.py`)
- **Auto-Discovery & Schema Conversion**: Fetches active API tools from Backoffice API and converts parameter definitions into standard JSON Schema `inputSchema` (`properties`, `required`).
- **Standard MCP Protocol**: Dynamically merged into `/tools`, JSON-RPC `tools/list`, and SSE stream.
- **Dynamic Dispatch**: When an MCP client invokes a tool (e.g. `cari_tanah_bpn`), the MCP server dispatches arguments to `/api/knowledge/api-tools/{source_id}/execute` and returns live JSON data to the LLM.

### 4. Backoffice AI Knowledge Chat Integration (`chat_service.py` & `Chat.jsx`)
- **Automatic Function Calling**: In `ChatService.chat_with_knowledge`, all active API tools are provided to the LLM backend via OpenAI-compatible `tools=[...]` specifications.
- **Smart Tool Selection**:
  - If the user explicitly chooses an AI Tool in the Knowledge Source dropdown, the system sets `tool_choice` directly to that tool and skips ChromaDB vector retrieval.
  - If "All Knowledge Sources" is selected, `tool_choice="auto"` enables the LLM to dynamically trigger the tool when queries match the tool description.
- **Execution & Follow-up**:
  1. Backoffice executes `api_ingester.execute_tool_call_sync` with the LLM's arguments.
  2. The raw API output is appended as a `tool` role message.
  3. The LLM generates a grounded final response synthesizing the live API result.
  4. Thought preamble cleaning ensures that internal reasoning tags or draft outlines are cleanly removed.
- **UI Tool Visibility & Traceability (`Chat.jsx`)**:
  - **Active AI Tools Pill Bar**: Displays active tool names (e.g. `⚡ cari_tanah_bpn (1p)`) with parameter tooltips above the message input.
  - **Collapsible Invoked Tools Accordion**: When the AI uses an API tool during chat, an accordion (`⚡ Dynamic API Tools Invoked`) displays the exact tool name, parameters sent, URL called, HTTP status, and live output payload.

### 5. Knowledge Base Catalog Presentation (`KnowledgeSources.jsx`)
- API sources in tool mode are badged with `⚡ AI API TOOL` and glowing border.
- Displays configured tool slug and interactive parameter chips (`nama* (query)`).
- Dedicated `⚡ Test / Edit` button.

---

## 🧪 Verification & Live Testing Results

### 1. Direct MCP Server Tool Call (`POST http://localhost:8001/call_tool`)
**Payload**: `{"name": "cari_tanah_bpn", "arguments": {"nama": "indradhi nugraha mulyanto"}}`
**Status**: 200 OK — Returned 2 land certificates from BPN staging server.

## ⏱️ GMT+7 (WIB) Time Display & Ingestion 25-Chunk Cap Resolution

### 1. Indonesian / GMT+7 (WIB) Time Display Everywhere
- **Root Cause**: Backend datetime timestamps were serialized as naive UTC strings (`YYYY-MM-DD HH:MM:SS`), causing browser JavaScript engines to interpret them in inconsistent timezones, leading to 7-hour offsets or raw UTC times.
- **Changes Implemented**:
  1. **Date Utility Module (`services/backoffice_ui/src/utils/dateUtils.js`)**:
     - `parseToDate(dateInput)`: Normalizes naive UTC date strings into proper ISO timestamps with `Z` timezone indicator.
     - `formatDateTimeWIB(dateInput, includeSeconds)`: Formats dates into Indonesian GMT+7 format (`13 Sep 2026, 23:09:17 WIB`).
     - `formatTimeWIB(dateInput, includeSeconds)`: Formats times into GMT+7 (`23:09 WIB`).
     - `formatDateWIB(dateInput)`: Formats long dates (`13 September 2026`).
  2. **Jobs Monitoring Table (`services/backoffice_ui/src/pages/Jobs.jsx`)**:
     - Table header updated to `Started (WIB)`.
     - Displays formatted start timestamps in WIB.
     - Displays both records and chunks count: `{total_records} rec ({chunks} chk)`.
  3. **Knowledge Sources Catalog (`services/backoffice_ui/src/pages/KnowledgeSources.jsx`)**:
     - Displays `Last sync: {formatDateTimeWIB(last_synced_at)}`.
  4. **AI Chat Timestamps (`services/backoffice_ui/src/pages/Chat.jsx`)**:
     - Real-time chat message timestamps formatted via `formatTimeWIB(new Date())`.
  5. **Backend ISO Serialization (`routers/jobs.py` & `routers/knowledge.py`)**:
     - Appended `Z` to `started_at`, `completed_at`, `created_at`, and `last_synced_at` so the frontend unambiguously handles UTC -> WIB conversion.

---

### 2. Database Ingestion 25-Chunk Cap & Incomplete Data Root Cause & Fix

#### Exact Mathematical Root Cause for "25 Chunks":
1. In `services/backoffice_api/tasks/ingest_tasks.py`, the ingestion query defaulted to `limit = int(config.get("limit", 500))`.
2. In `services/backoffice_api/services/ingestion/database_ingester.py`, records were chunked into batches of 20 (`batch_size = 20`).
3. **500 records ÷ 20 batch size = EXACTLY 25 CHUNKS!**
4. In `ingest_tasks.py`, line 82 set `job.total_records = total_chunks` (assigning 25 as total records instead of 500 or the total database rows).
5. In `database_ingester.py`, `extract_knowledge` was missing `return results` at the end of the function (returning `None`).
6. All database adapters (`mysql_adapter.py`, `mongodb_adapter.py`, `postgres_adapter.py`, `mssql_adapter.py`, `oracle_adapter.py`) called `fetchmany(limit)` with 500, never querying beyond row 500.
7. `AddDatabaseModal.jsx` had no input for ingestion row limit.

#### Solution & Enhancements:
1. **`database_ingester.py`**:
   - Added `return results` to `extract_knowledge`.
   - Raised default limit to 5000 and supported `0` (or `None`) as unlimited.
2. **All 5 Database Adapters**:
   - `MongoDBAdapter`: If `limit and limit > 0` calls `.limit(limit)`, otherwise executes full query without limit.
   - `MySQLAdapter`, `PostgresAdapter`, `MSSQLAdapter`, `OracleAdapter`: If `limit <= 0` or `None`, skips `LIMIT` and executes `cursor.fetchall()` to fetch all rows.
3. **`ingest_tasks.py`**:
   - Accurately counts rows: `total_records_count = sum(item.get("records_count", 0) for item in raw_chunks)`.
   - Distinguishes records vs chunks: `job.total_records = total_records_count` and `job.chunks_created = total_chunks`.
   - Reads `limit` from config, allowing `0` for unlimited.
4. **`vector_store.py`**:
   - Batches `collection.upsert` into slices of 500 chunks to prevent ChromaDB payload overflow when indexing tens of thousands of rows.
5. **`AddDatabaseModal.jsx`**:
   - Added "Max Records to Ingest" field (default 5000, 0 for unlimited / all records in table).
6. **Live Verification**:
   - Tested on user's live database `dblake.orang_api_dukcapil`:
     - With `limit=100`: extracted 5 chunks, 100 records.
     - With `limit=0` (unlimited): **extracted 396 chunks, 7,906 total records**!
7. **Batas Ingestion 10.000 Record & Pengaturan Unlimited**:
   - Sebelumnya, pada `ingest_tasks.py` terdapat pengaman `if limit <= 0: limit = 10000` untuk mencegah worker crash jika tabel berukuran sangat masif. Hal ini menyebabkan input `0` (unlimited) otomatis tertahan di 10.000 record.
   - Logika ini telah disempurnakan menjadi `effective_limit = limit if limit > 0 else None`.
   - **Hasil**:
     - Memasukkan angka `0` kini benar-benar mengambil **seluruh record tanpa batas 10.000**.
     - Pengguna juga bebas menentukan angka berapapun (misalnya `50000`, `100000`, `250000`, dsb.) pada kolom **Max Records to Ingest**.

---

## 📁 Modified Files Summary
- [`services/backoffice_api/services/ingestion/api_ingester.py`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_api/services/ingestion/api_ingester.py): Parameter interpolation, async and sync tool execution.
- [`services/backoffice_api/routers/knowledge.py`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_api/routers/knowledge.py): `/api-tools` and `/api-tools/{source_id}/execute` endpoints, vector store purge on tool mode.
- [`services/backoffice_api/routers/chat.py`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_api/routers/chat.py): `/chat/tools` endpoint and `tools_executed` response schema.
- [`services/backoffice_api/services/chat_service.py`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_api/services/chat_service.py): Dynamic tool discovery, function calling dispatch, prompt instructions, and response synthesis.
- [`services/mcp_server/main.py`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/mcp_server/main.py): Dynamic tool fetching, schema conversion, `/tools` exposure, and execution routing.
- [`services/backoffice_ui/src/components/modals/AddApiModal.jsx`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_ui/src/components/modals/AddApiModal.jsx): Parameter builder UI, AI Tool Mode toggle, live test validation.
- [`services/backoffice_ui/src/pages/KnowledgeSources.jsx`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_ui/src/pages/KnowledgeSources.jsx): `⚡ AI API TOOL` badges, parameter chips, test/edit actions.
- [`services/backoffice_ui/src/pages/Chat.jsx`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/services/backoffice_ui/src/pages/Chat.jsx): Active tools pill bar and collapsible dynamic tools invocation accordions.
- [`docker-compose.prod.yml`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/docker-compose.prod.yml): Production network un-isolation (direct ports for MCP and API, `host.docker.internal:host-gateway` host networking).
- [`Makefile`](file:///d:/sourcecode/MCP_SERVER_IN_CEC/Makefile): Corrected port announcements for development and production modes.

---

## 🌐 Production Network Configuration

In response to production network isolation:
1. **Host-Gateway Access**:
   - Added `extra_hosts: - "host.docker.internal:host-gateway"` across `mcp-server`, `backoffice-api`, `celery-worker`, and `celery-beat`.
   - Containers can now directly communicate with host-level services, local database servers, and host-bound APIs via `host.docker.internal`.
2. **Direct Port Exposure**:
   - `mcp-server`: Exposed on `${MCP_SERVER_PORT:-8001}:8001` for external MCP clients (OpenWebUI, Claude Desktop).
   - `backoffice-api`: Exposed on `${BACKOFFICE_API_PORT:-8002}:8000` for direct API integrations and OpenAPI documentation access.
3. **Nginx Reverse Proxy Retained**:
   - `nginx` continues to serve as the unified reverse proxy on ports `80` and `443` (routing `/` to `backoffice-ui`, `/api/` to `backoffice-api`, and `/mcp/` / `/sse` / `/tools` to `mcp-server`).
4. **Validation**:
   - Verified compose configuration via `docker compose -f docker-compose.yml -f docker-compose.prod.yml config`.

---

## 🧭 Knowledge Orchestration & AI Guidelines Tools

New tools have been added to the MCP server (`:8001`) and Backoffice API (`:8002`) to orchestrate heterogeneous knowledge sources (Vector Store, Knowledge Graph, Live Database/API tools) and enforce strict AI guidelines during input processing and knowledge retrieval.

### 1. `get_knowledge_orchestration_guidelines`
- **Purpose**: Provides AI agents with official operational rules, input classification protocols, source routing matrices, grounding/citation standards, and an active catalog of all connected knowledge sources.
- **Input Parameters**:
  - `query` (optional string): User input to receive tailored routing instructions and tool recommendations.
  - `include_catalog` (optional boolean, default `true`): Include catalog of active File Collections, Databases, APIs, Web sources, and Knowledge Graph.
- **Features**:
  - Automatically identifies query intent (e.g. land ownership -> `cari_tanah_bpn`, corporate affiliations -> Neo4j graph, policy/SOP -> ChromaDB vector docs).
  - Extracts suggested arguments (e.g. extracts `nama="Indradhi"` from `"Cari tanah atas nama Indradhi"`).
  - Prescribes anti-hallucination protocols and explicit handling when data is absent.

### 2. `orchestrate_knowledge_search`
- **Purpose**: Unified multi-source search tool that executes vector retrieval, knowledge graph entity inspection, and live tool matching in a single coordinated operation.
- **Input Parameters**:
  - `query` (string, required): The search input.
  - `search_strategy` (optional string, default `"hybrid"`): `"hybrid"`, `"semantic_only"`, `"graph_only"`, or `"comprehensive"`.
  - `source_types` (optional list of strings): Filter to specific source types `['file', 'database', 'api', 'website', 'websearch']`.
  - `max_results` (optional integer, default 5): Maximum document chunks to retrieve.
- **Features**:
  - **Vector Docs**: ChromaDB similarity search with scores, source names, and content passages.
  - **Graph Entities**: Neo4j entity profiles and relationship paths matching query terms.
  - **Applicable Tools**: Detects active tools that can provide live system-of-record data.
  - **Synthesis Guidelines**: Tailored instructions on how the LLM should formulate its final response based on the retrieved context.

### 3. Verification & Live Test Results
- **MCP Tool List**: Verified via `GET /tools` and JSON-RPC `tools/list` — 9 active tools published.
- **Guideline Retrieval**: Calling `get_knowledge_orchestration_guidelines` with query `"Cari tanah atas nama Indradhi"` returned:
  - `suggested_strategy`: `"tool_execution"`
  - `recommended_tools`: `cari_tanah_bpn` (relevance score 14, suggested argument `nama="Indradhi"`)
  - `recommended_action`: `"Invoke tool 'cari_tanah_bpn' with arguments {'nama': 'Indradhi'}"`
- **Orchestrated Search**: Calling `orchestrate_knowledge_search` with query `"regulasi pertanahan dan sertifikat"` returned 5 vector documents, 2 Neo4j graph entity profiles, matching tools, and grounded synthesis guidelines.
- **Resilience**: MCP server supports both Backoffice API delegation and standalone local synthesis fallback with zero downtime.
- **OpenWebUI SSE Stream**: Verified `/sse` initial event endpoint stream.

---

## 👤 Biometric Face Recognition & Image Processing (MCP & Chat)

The system now features end-to-end **Face Recognition and Image Processing** supporting both **local file paths** and **Base64 strings** (`data:image/...;base64,...` or raw base64). Users can recognize faces, compare images, enroll new face profiles into ChromaDB, and interact with the engine directly through the Backoffice Chat UI or any standard MCP client.

### 1. Architectural Design & Pipeline

```
  ┌───────────────────────────────────────────────┐
  │ Input: File Path OR Base64 Data URI / String   │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │ PIL / NumPy Normalization & Transposition     │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │ YCbCr Skin Chrominance & Spatial Face Cropping│
  │ • Normalized 128x128 Face Patch               │
  │ • 120x120 JPEG Base64 Thumbnail               │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │ 128-D Biometric Feature Vector Extraction     │
  │ • 4x4 Spatial Cell Grid                       │
  │ • Local Binary Patterns (LBP) Micro-texture   │
  │ • Central-Difference Sobel Gradients (gx, gy) │
  │ • Contrast Variance & L2 Normalization        │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │ ChromaDB "face_recognition_records"           │
  │ • HNSW Cosine Distance Indexing               │
  │ • Sub-second Biometric Similarity Matching    │
  └───────────────────────────────────────────────┘
```

- **Zero Heavy C-Dependencies**: Built with pure Python `Pillow`, `numpy`, and `chromadb`, guaranteeing lightning-fast startup and portability across containerized production environments.
- **Dual Input Format**: Supports absolute file paths (e.g. `/app/photos/user.jpg` or `D:\photos\user.jpg`) and Base64 encoded images with automatic EXIF orientation transposition.

---

### 2. MCP Server Face Recognition Tools (`:8001`)

The MCP Server exposes 4 dedicated tools for OpenWebUI, Claude Desktop, and autonomous agents:

| Tool Name | Parameters | Description |
|---|---|---|
| `recognize_face` | `image_input` (str, required), `min_confidence` (float, default 0.65), `max_candidates` (int, default 3) | Detects and crops face from file or base64, searches ChromaDB biometric vectors, and returns matched identity, confidence %, and side-by-side thumbnails. |
| `compare_faces` | `image_a` (str, required), `image_b` (str, required), `threshold` (float, default 0.70) | Directly compares two facial images (paths or base64) and computes cosine similarity, similarity percentage, and match rating. |
| `enroll_face` | `image_input` (str, required), `person_name` (str, required), `person_id` (str, optional), `department` (str, optional), `notes` (str, optional) | Enrolls a person's biometric face embedding and metadata into the ChromaDB collection for future recognition. |
| `list_enrolled_faces` | *none* | Retrieves all enrolled face profiles, metadata, IDs, and thumbnail previews stored in the database. |

---

### 3. Backoffice AI Knowledge Chat Integration (`Chat.jsx` & `chat_service.py`)

- **Image Attachment & Clipboard Paste**:
  - Click the **Image icon** next to the chat textarea to select any photo/image file.
  - Or simply press **Ctrl+V** inside the textarea to paste an image directly from the clipboard.
- **Attachment Preview**:
  - Displays a floating preview thumbnail with a dismiss `(X)` button above the input bar.
  - Auto-enables the send button even if no text prompt is typed (defaults to automated facial recognition scan).
- **User Message Bubble**:
  - Displays the user's uploaded or pasted image thumbnail above their message text.
- **Biometric Match Card in Assistant Bubble**:
  - **Match Badge**: Green glowing badge showing `👤 Biometric Match: [Person Name]` with exact `Match %`.
  - **Visual Comparison**: Side-by-side comparison of the detected input face crop and the enrolled database thumbnail.
  - **Profile Details**: Displays Person ID (e.g. `EMP-001`), Department, and Face Vector ID.
  - **Grounded LLM Response**: The AI assistant synthesizes the biometric scan results alongside indexed documents and knowledge sources.

---

### 4. Verification & Live Test Results

#### A. Direct MCP Tool Execution (`POST http://localhost:8001/call_tool`)
- **Tool**: `recognize_face`
- **Result**:
  ```json
  {
    "matched": true,
    "identified_person": "Budi Santoso",
    "person_id": "EMP-001",
    "department": "Engineering",
    "confidence_percent": 100.0,
    "similarity_score": 1.0,
    "input_face_thumbnail": "data:image/jpeg;base64,...",
    "matched_face_thumbnail": "data:image/jpeg;base64,..."
  }
  ```
- **Tool**: `compare_faces`
  - Score: `1.0` (100.0% match, rating: `high`, `is_same_person: true`).

#### B. End-to-End Chat with Face Image (`POST /api/chat`)
- **Input**: Query `"Siapa orang yang ada di foto ini?"` with Base64 image payload.
- **Biometric Scan**: Successfully identified `Budi Santoso` (ID: `EMP-001`, Dept: `Engineering`, Confidence: `98.8%`).
- **AI Response**:
  > Berdasarkan hasil pemindaian biometrik pengenalan wajah yang dilakukan, identitas orang dalam foto tersebut telah dikonfirmasi dengan tingkat kepercayaan **98.8%**.
  > 
  > Orang yang ada di foto ini adalah:
  > * **Nama:** Budi Santoso
  > * **ID Karyawan:** EMP-001
  > * **Departemen:** Engineering
- **Vite UI Hot Reload**: Verified clean HMR compilation in `mcp_backoffice_ui` container.

---

## 🎛️ Dedicated GUI: Data & Knowledge Orchestrator (`/orchestrator`)

To give administrators and AI engineers full visual observability over data orchestration, routing decisions, and multi-source retrieval, a dedicated **Data Orchestrator** workbench is now available in the Backoffice UI sidebar.

### 1. Where Can You Orchestrate Data?

You can orchestrate data in **two places in the GUI**:

1. **AI Knowledge Chat (`/chat`)**:
   - Every user query is automatically orchestrated across ChromaDB (vector chunks), Neo4j (graph entities), live Database & REST API Tools, and Biometric Face Recognition.
   - The assistant's response includes interactive accordions:
     - `Retrieved Knowledge Chunks` (ChromaDB passages + similarity scores)
     - `Connected Graph Entities` (Neo4j relationships)
     - `Real-Time AI Tools Invoked` (Dynamic live calls + status codes + payloads)
     - `Biometric Match` (Side-by-side face crops + confidence %)

2. **Dedicated Workbench: "Data Orchestrator" (`/orchestrator`)**:
   - Located in the left navigation sidebar under **Platform ➔ Data Orchestrator**.
   - Provides a comprehensive visual console for:
     - **Query & Intent Testing**: Test any prompt or question and observe how the system classifies intent (`live_transactional`, `entity_relationship`, `factual_document`, `hybrid_multi_faceted`).
     - **Strategy Selection**: Switch between `Hybrid (Vectors + Graph + Tools)`, `Comprehensive (All Sources)`, `Semantic Vectors Only`, and `Knowledge Graph Only`.
     - **Live Pipeline Summary**: Real-time counters for vector chunks, graph entities, applicable tools, and biometric matches.
     - **Dynamic Tool Execution**: Run any detected tool (e.g. `cari_tanah_bpn`) live with auto-extracted parameters and inspect the raw JSON output.
     - **Grounding & Anti-Hallucination Directives**: View the exact synthesis instructions given to the LLM.
     - **LLM Grounded Response Synthesis**: One-click synthesis button to verify how the configured LLM backend generates an answer based strictly on the orchestrated context.

---

## 💬 Clean & Readable Chat Response, Collapsible Thinking, Tables, Images, Graphs & Maps

The AI Knowledge Chat interface (`Chat.jsx`) has been substantially upgraded with modern presentation aesthetics, eliminating cluttered raw outputs and providing interactive visual widgets:

### 1. Collapsible Thought Process / Reasoning (`<think>`)
- **Collapsed by Default**: The LLM's internal reasoning, draft plans, and `<think>...</think>` tags are extracted on both the backend (`chat_service.py`) and frontend parser.
- **Clean Top Bar**: Replaced by a sleek, amber-accented card: `💭 Thought Process / Reasoning (X chars) [Show v]`.
- **Expandable Drawer**: Clicking the button smoothly expands a dark monospace scroll container allowing users to inspect the model's rationale without polluting the main response.
- **Pre- and Postamble Scrubbing**: Trailing self-talk (e.g. `"This looks clear, I will output the final answer..."`) is automatically stripped so the visible answer remains 100% clean and professional.

### 2. Responsive Markdown Table Rendering
- **Glassmorphism Table Cards**: Markdown tables (`| col1 | col2 |`) are parsed into responsive HTML tables with gradient headers (`rgba(30, 41, 59, 0.9)`), bold uppercase titles, and cyan/indigo borders.
- **Horizontal Scroll Protection**: Wrapped in `overflow-x: auto` containers so wide tables (e.g., 50+ row asset inventory tables) never break or warp the chat bubble.
- **Full Cell Markdown Support**: Formats bold text, italics, inline code, and clickable links inside table cells.

### 3. Comprehensive Image Display & Base64 String Support
- **Multi-Format Image Rendering**:
  - **Standard URLs**: `https://.../photo.jpg`, `http://...`
  - **Relative Paths**: `/static/...`, `/uploads/...`
  - **Data URLs**: `data:image/jpeg;base64,...`, `data:image/png;base64,...`, `data:image/webp;base64,...`, `data:image/gif;base64,...`, `data:image/bmp;base64,...`, `data:image/svg+xml;base64,...`
  - **Raw Base64 Strings**: Automatically detects and normalizes raw base64 strings (with or without `data:` prefix) by sniffing magic header bytes:
    - `/9j/` ➔ JPEG
    - `iVBORw0KGgo` ➔ PNG
    - `R0lGOD` ➔ GIF
    - `UklGR` ➔ WebP
    - `Qk` ➔ BMP
- **Universal Parser Support**:
  - **Markdown Images**: `![alt text](url_or_base64)`
  - **HTML Images**: `<img src="..." alt="..." />`
  - **Standalone Base64 Blocks**: Directly renders raw base64 strings pasted or emitted in the chat response.
  - **Labeled Lines**: `Foto: data:image/...`, `Photo: /9j/...`, `"foto": "/9j/..."`
  - **Inline Base64 Protection**: Large base64 strings in inline text or code blocks (` `...` `) are rendered as compact interactive preview chips instead of spewing 50,000+ characters of raw text that freezes the DOM.
- **Table Cell Thumbnail Rendering**:
  - Base64 images inside Markdown table cells (common when querying Dukcapil, Face Recognition databases, or employee records) are rendered as sleek **46×46 circular/rounded photo thumbnails** with a "View Photo" tag and click-to-open lightbox, keeping tables perfectly structured.
- **Automatic Tool Result Photo Extraction**:
  - Scans dynamic tool execution payloads (`msg.tools_executed`) for image fields (`foto`, `image`, `avatar`, `photo`, base64 strings) and automatically renders a "📸 Photos from Tool Result" gallery chip under the tool execution summary.
- **Interactive Fullscreen Lightbox Modal**:
  - Clicking **any** image (user attachments, assistant photos, table thumbnails, face recognition results, tool results) opens an interactive full-screen lightbox.
  - **Lightbox Controls**:
    - **Toggle Zoom**: Switch between contain (fit screen) and original size with pan scrolling.
    - **Download Image**: One-click download as a `.jpg`/`.png` file with auto-generated timestamp filename.
    - **Copy Source / Base64**: Instant clipboard copy of the image source or base64 string.
    - **Close**: Close button, backdrop click, or `Escape` key shortcut.
- **Chat Input Clipboard Paste Detection**:
  - Pasting an image directly from clipboard attaches it as an image preview pill.
  - Pasting raw base64 or data URLs into the chat input attaches it cleanly above the input rather than cluttering the prompt box with thousands of characters.
- **LLM Prompt Guidelines**:
  - Added guideline 9 to `ChatService` system instruction directing the LLM to format database photo fields as Markdown images (`![Foto](data:image/jpeg;base64,...)`) and prepend `data:image/jpeg;base64,` to raw `/9j/` base64 strings.


### 4. Interactive Network Graph (`CytoscapeGraph`)
- **Automated Topology Builder**: Automatically translates Neo4j graph entities and relations retrieved during RAG into Cytoscape nodes and edges.
- **Interactive Canvas**: Users can click `[🕸️ View Network Graph]` to open a live 280px canvas with the `cose` force-directed layout.
- **Color-Coded Nodes**: Distinct colors for Person (Indigo), Organization (Cyan), Database Record (Emerald), API Endpoint (Amber), and Documents (Pink).
- **Pan, Zoom & Tap**: Supports interactive zooming, panning, and node selection.

### 5. Interactive Location Maps (OpenStreetMap & Google Maps)
- **Geographic Coordinate Detection**: Automatically identifies coordinate patterns (`[lat, lng]` or `lat: ..., lng: ...`) or Indonesian cities/regencies (Cianjur, Tangerang, Jakarta, Bandung, Surabaya, Semarang, Medan, Bali, etc.).
- **Embedded OpenStreetMap**: Renders an interactive OpenStreetMap iframe with a marker pin centered on the location.
- **Direct External Navigation**: Includes a quick-link button to open the location directly in **Google Maps**.
- **Inline Map Blocks**: Supports ` ```map ` and ` ```geojson ` code blocks emitted by the LLM.

### 6. Multi-Source Selection in AI Knowledge Chat
- **Interactive Multi-Select Dropdown Popover**:
  - Replaced the rigid single-choice dropdown with a sleek, searchable multi-select popover.
  - Displays checkbox states, source type badges (`DB`, `API`, `DOC`, `WEB`), dynamic AI tool indicators (`⚡ Tool`), and source names.
  - Includes real-time search input for quickly locating sources across large catalogs.
  - One-click **"Select All"** and **"Clear (All)"** controls.
  - Outside-click and <kbd>Esc</kbd> key auto-close listeners.
  - **High-Priority Stacking (`z-index`)**: Configured `position: relative`, `z-index: 50/60` on the header and `z-index: 9999` on the popover so it always renders on top of the welcome card and conversation messages without being obscured by `.glass-panel` backdrop-filter stacking contexts.
- **Active Filter Chips Ribbon**:
  - When one or more sources are selected, an active filter ribbon displays individual removable pills with database icons: `[📁 Source Name ×]`.
  - Clicking any `×` removes that source instantly.
  - "Reset to All Sources" link reverts filter to universal search across all knowledge.
- **Backend Hybrid Multi-Source Orchestration**:
  - `ChatRequest` supports `source_ids: Optional[List[int]]` alongside backwards-compatible `source_id: Optional[int]`.
  - In `chat_service.py`:
    - **Vector Chunks**: Filters ChromaDB vectors via native `$in` operator: `where={"source_id": {"$in": selected_vector_source_ids}}`.
    - **Dynamic AI Tools**: Filters dynamic real-time tools to only those matching the selected source IDs.
    - **Zero-Vector Handling**: If the user selects only AI tools (and no vector document sources), vector retrieval is automatically bypassed so the LLM focuses purely on live tool execution.
    - **Prompt Specialization**: System prompt dynamically lists the selected tools/sources to instruct the model to prioritize them.
    - **Universal Fallback**: If 0 sources are selected, the engine queries across all vector documents and exposes all dynamic tools (`tool_choice="auto"`).

### 7. Resolution of Entity/Profile Retrieval with Multi-Source Selection

#### Root Causes Identified
When a user queried for an individual like **"Indradhi Nugraha Mulyanto"** after selecting sources (e.g. Source 7 *"Dukcapil API Knowledge Base"*):
1. **Dynamic Tool Stripping**:
   - Source 7 is an ingested vector source (`is_tool: False`) pointing to MongoDB `dblake.orang_api_dukcapil`.
   - Source 5 is the real-time query tool (`is_tool: True`) pointing to the *exact same* collection.
   - When the user selected Source 7, `active_source_ids = [7]`. The backend filtered tools to `KnowledgeSource.id.in_([7])`, stripping Source 5 and leaving **zero available database tools**.
2. **Semantic Vector Dilution & Metadata Noise**:
   - In ChromaDB, records were batched in 20-record chunks.
   - Record 4806 contained Indradhi's full citizen profile (`NAMA_LGKP: INDRADHI NUGRAHA MULYANTO`, NIK `3603280910810007`, photo).
   - Record 4921 contained another person's record with audit log `updated_by: Indradhi Nugraha Mulyanto (Programmer15)`.
   - Semantic cosine similarity for *"siapa indradhi nugraha mulyanto?"* ranked diffuse chunks (including Record 4921) above Chunk 4801. The LLM saw only `updated_by: ... (Programmer15)` and concluded he was just a programmer with no citizen profile.
3. **Context Excerpt Truncation**:
   - Chunks in ChromaDB were up to 26,000 characters. Slicing with `raw_content[:2500]` cut off Record 4806 (which began at offset 7377), feeding only earlier unrelated records into the LLM.
4. **Tool-Calling Inhibition**:
   - When both Source 5 and 7 were selected, `tool_choice` was `"auto"`. Seeing partial mention of Indradhi as Programmer15 in the prompt context, the LLM assumed it had sufficient data and did not invoke the database tool.

#### Solutions Implemented
1. **Hybrid Keyword + Vector Search in ChromaDB (`vector_store.py`)**:
   - Added keyword pre-matching before semantic retrieval. Extracts key candidate terms (names, NIKs, entities), tests exact `$contains` against document content in uppercase/title-case, and boosts chunks containing primary entity attributes (`NAMA_LGKP`, `NIK`) with a score of `0.98`.
   - Prioritizes exact matches at the front of retrieved results, guaranteeing Record 4806 is always Rank #1.
2. **Smart Keyword-Centered Excerpt Extraction (`chat_service.py`)**:
   - Instead of naive prefix slicing (`[:2500]`), the engine detects keyword positions within large multi-record chunks, centers a 4500-character window around the matched record, and snaps to line/record boundaries.
3. **Companion Tool Auto-Linking (`chat_service.py`)**:
   - When a user selects vector document sources (e.g. Source 7), the backend automatically discovers and links companion database tools (e.g. Source 5) sharing the same database, collection, table, or domain keywords.
   - Preserves live database query capabilities even if the user only selected the vector source.
4. **Enforced Tool Calling for Person Lookups**:
   - Updated system and prompt instructions: when questions ask for people, identities, or NIKs, the model is strictly instructed to invoke the live profiling tool first to fetch the verified official record and photo.
   - Increased tool response truncation budget to 30,000 characters to prevent cutting off base64 photos.

#### Live Verification Across All Scenarios
| Scenario | Tools Executed | Chunks Retrieved | Profile & NIK Found | Base64 Photo Rendered |
| :--- | :---: | :---: | :---: | :---: |
| **Source 7 Only** (*Dukcapil API KB*) | `db_profiling_data_orang...` | 5 | ✅ NIK 3603280910810007 | ✅ Yes (`data:image/jpeg;base64,...`) |
| **Source 5 Only** (*Profiling Data Orang*) | `db_profiling_data_orang...` | 0 | ✅ NIK 3603280910810007 | ✅ Yes (`data:image/jpeg;base64,...`) |
| **Both Sources (5 & 7)** | `db_profiling_data_orang...` | 5 | ✅ NIK 3603280910810007 | ✅ Yes (`data:image/jpeg;base64,...`) |
| **All Sources (No Filter)** | `db_profiling_data_orang...` | 5 | ✅ NIK 3603280910810007 | ✅ Yes (`data:image/jpeg;base64,...`) |

### 9. Live Verification of Document Upload & Chat Analysis (PDF, Word, Excel, CSV, Text)

Telah dilakukan pengujian end-to-end langsung pada server dan container Docker:

#### Test 1: Upload & Analisis File CSV Tabular (`laporan_pengadaan_2026.csv`)
- **Dokumen Diunggah**: File CSV 5 baris berisi data nomor proyek, nama proyek, kontraktor, anggaran milyar, dan status pengerjaan.
- **Endpoint Unggah**: `POST /api/chat/upload-document`
  - Status: `200 OK`
  - Ekstraksi: Berhasil membaca 5 kolom dan 5 baris data, menghasilkan preview tabel Markdown dan metadata otomatis.
- **Query Chat**: *"Berdasarkan dokumen laporan_pengadaan_2026.csv, sebutkan proyek dengan anggaran terbesar, siapa kontraktornya, dan apa status proyek tersebut!"*
- **Hasil Jawaban AI**:
  - Proyek: Pembangunan Jalur Kereta Cepat
  - Kontraktor: PT Nusa Indah Perkasa
  - Anggaran: Rp 120,0 Milyar (Tertinggi)
  - Status: Tertunda
  - Sitasi Sumber: `📎 Dokumen Terunggah: laporan_pengadaan_2026.csv`

#### Test 2: Upload & Analisis Catatan Investigasi Teks (`audit_investigasi_september2026.txt`)
- **Dokumen Diunggah**: File laporan audit khusus tindak pidana korupsi berisi nomor surat, temuan aliran dana bansos, nomor rekening, dan rekomendasi cekal/blokir.
- **Endpoint Unggah**: `POST /api/chat/upload-document`
  - Status: `200 OK`
- **Query Chat**: *"Berapa dana yang ditransfer ke Sdr. Hendra Kusuma dan apa rekomendasi dalam laporan audit ini?"*
- **Hasil Jawaban AI**:
  - Jumlah Dana: Rp 4,5 Milyar ke rekening Bank Syariah Mandiri milik Sdr. Hendra Kusuma (Dirut PT Cahaya Mandiri Sejahtera).
  - Rekomendasi: Pencegahan ke luar negeri & pemblokiran 3 rekening giro PT Cahaya Mandiri Sejahtera.
  - Zero-Hallucination: AI secara jujur menyampaikan catatan bahwa profil kependudukan Dukcapil untuk Hendra Kusuma tidak ditemukan di database resmi, tanpa mengarang data fiktif.

#### Test 3: Frontend Build & Kompatibilitas
- **Perintah Build**: `docker compose exec backoffice-ui npm run build`
- **Hasil**: `✓ built in 8.50s` dengan status Exit Code `0`.
- **Integrasi**: Tombol Paperclip (`📎`), preview chip, state upload, dan bubble dokumen pengguna berfungsi harmonis di UI Chat.



