# MCP Knowledge & Network Intelligence Server

Enterprise-grade **Model Context Protocol (MCP) Server** with an integrated **Backoffice Management Suite**, multi-source knowledge ingestion, hybrid RAG (vector + graph), biometric face recognition, and an **OpenAI-compatible Chat API**.

Designed for seamless integration with **OpenWebUI**, **Claude Desktop**, **OpenAI SDK clients**, and autonomous LLM agents.

---

## 🎯 Keunggulan Utama Sistem: Deep Profiling, Network Mapping & Anomaly Detection

Keunggulan sistem ini terletak pada kemampuannya untuk **menelusuri profiling mendalam dari seorang individu atau instansi** ke seluruh basis pengetahuan (*knowledge base*) yang terhubung, **memetakan jaringan keterkaitan** terhadap individu dan instansi lain secara multi-hop, serta **menganalisis data secara relasional untuk menemukan hubungan tersembunyi dan anomali faktual**.

```mermaid
graph TD
    A["Kueri Penelusuran / Investigasi"] --> B("Multi-Source Ingestion & Live Tools")
    B --> C1["Kependudukan (SIAK Dukcapil)"]
    B --> C2["Pertanahan (BPN ATR / GeoJSON)"]
    B --> C3["Profil Usaha & Vendor (SIKAP)"]
    B --> C4["Pengadaan PBJ (SPSE & RUP Paket)"]
    B --> C5["Biometrik Wajah & Berkas PDF/OCR"]
    
    C1 & C2 & C3 & C4 & C5 --> D["Hybrid Retrieval: Vector DB + Neo4j Graph"]
    
    D --> E["Pemetaan Jejaring Keterkaitan Multi-Hop"]
    E --> F1["Relasi Antar-Individu (Keluarga, Pasangan, Rekan)"]
    E --> F2["Afiliasi Entitas Usaha (Pengurus, Saham, Beneficial Owner)"]
    E --> F3["Kepemilikan Aset Lintas Wilayah & Persil Tanah"]
    
    F1 & F2 & F3 --> G["Mesin Analisis Relasional & Deteksi Anomali"]
    G --> H1["Penemuan Hubungan Tersembunyi (Hidden Multi-Hop Links)"]
    G --> H2["Deteksi Anomali Profil & Konflik Kepentingan"]
    G --> H3["Sintesis Laporan Faktual (Zero-Hallucination & Anti-Rot)"]
```

### 3 Pilar Kapabilitas Unggulan:

1. **🔍 Penelusuran Profiling Komprehensif (Individu & Instansi)**:
   - **Individu**: Menelusuri identitas resmi KTP/KK (Dukcapil), legalitas kepemilikan aset tanah (SHM/HGB BPN), keterlibatan badan usaha, hingga verifikasi identitas visual melalui pencocokan biometrik wajah (*Face Recognition*).
   - **Instansi / Korporasi**: Menggali profil legalitas perusahaan, susunan direksi/komisaris, riwayat kepemilikan modal/saham, keikutsertaan dalam lelang pengadaan barang & jasa (SPSE), dan paket penyedia terumumkan (RUP).
2. **🌐 Pemetaan Jaringan Keterkaitan Multi-Hop (Entity Network Graph)**:
   - Menghubungkan titik-titik data terpisah (*connecting the dots*) yang tersebar di berbagai database menjadi satu graf pengetahuan utuh di Neo4j.
   - Menggunakan *2-Hop Multi-Hop Network Traversal* untuk memetakan rantai hubungan tidak langsung (misalnya: *Individu A ➔ Perusahaan B ➔ Pemenang Tender C ➔ Pemilik Aset D*).
3. **📊 Analisis Data, Penemuan Korelasi & Deteksi Anomali**:
   - **Deteksi Hubungan Tersembunyi**: Mengidentifikasi afiliasi terselubung antar-entitas yang tidak tampak pada pencarian data sekuensial biasa.
   - **Deteksi Anomali & Risiko**: Menyoroti anomali data (misal: kepemilikan aset silang, ketidaksesuaian domisili kependudukan vs lokasi aset, atau peserta tender yang terafiliasi pada pengurus yang sama).
   - **Zero-Hallucination, Anti-Rot & Context Isolation**: Seluruh kesimpulan diverifikasi oleh *Context Rot Guard*, memisahkan individu bernama sama (*Anti-Conflation*), serta menerapkan **Graph-Bounded Context Isolation** agar pencarian vektor ChromaDB dibatasi murni pada jaringan relasi Neo4j dari subjek yang sedang diinvestigasi tanpa kebocoran data orang/entitas lain.

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
- **Dual Vector Store Engine (ChromaDB + Qdrant)**:
  - **ChromaDB**: Embedded high-speed vector retrieval for local documents.
  - **Qdrant**: Enterprise distributed vector engine with payload filtering and high-concurrency ANN search.
  - **Vector Database Synchronization (`ChromaDB ⇄ Qdrant`)**: 1-click migration and bi-directional synchronization directly from Backoffice Database Settings, complete with on-the-fly dimension adaptation/re-embedding (e.g. 384-dim vs 1024-dim/1536-dim) and optional real-time dual-write (`VECTOR_DB_DUAL_WRITE=true`).
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
| `set_chat_focus_context` | Menetapkan atau mengunci entitas/topik fokus secara manual pada sesi chat |
| `get_chat_focus_context` | Mengambil status dan entitas fokus aktif untuk isolasi konteks sesi chat |
| **Dynamic tools** | Any Database/API/MCP knowledge source marked `is_tool=true` is auto-exposed |

### 6. 🎭 AI Personality System
- **Multiple named personalities** (Curated Presets + Custom) — each with a unique name, tone, mission, and anti-hallucination level.
- **Greeting-based personality activation**: saying "Hello Jarvis" dynamically switches to the matching persona.
- **Configurable presets**: BIN Investigator, Customer Service, General Assistant, Technical Analyst, and more.
- **System prompt override** per personality for full LLM instruction control.

### 7. 🔁 Prompt Flow Memory (Orchestration Flows)
- Define **multi-step retrieval workflows** (tool call → graph traversal → vector search → synthesis) that are automatically matched and injected when a user query matches a known intent.
- **Default Golden Flows** pre-seeded:
  - NIK Identity Profiling & Dukcapil Verification
  - Land Asset & BPN Certificate Tracing
  - Business Entity & SIKAP Company Investigation
  - Public Procurement (PBJ), SPSE Tender & RUP Package Tracing
- **Automated Tool Target Aliasing**: dynamic resolution of abstract flow targets to concrete registered OpenAPI tools (`TOOL_TARGET_ALIASES`).
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

### 11. 💬 Advanced Chat Features & OpenAI Standard UI
- **OpenAI Standard Chat History & Session Management**:
  - Full local conversation persistence (`localStorage`), multiple concurrent sessions, inline session renaming, deletion, and message counters.
  - Chronological time grouping: *Hari Ini* (Today), *Kemarin* (Yesterday), *7 Hari Terakhir* (Last 7 Days), *Lebih Lama* (Older).
  - **1-Click Export as OpenAI JSON**: generates standard `{ "model": "...", "messages": [...] }` payload ready for copy or file download (`.json`).
  - **1-Click Import OpenAI JSON**: loads standard OpenAI Chat Completion JSON traces into a new session seamlessly.
- **OpenAI o1 / DeepSeek R1 Reasoning Display**:
  - Interactive collapsible **Reasoning Card** with thought duration in seconds, token and character count approximations.
  - Dark glass monospace container with 1-click clipboard copy.
  - **Reasoning Effort Control**: configurable parameter (`auto`, `low`, `medium`, `high`) integrated directly into the chat settings bar and forwarded to `/chat` and `/v1/chat/completions`.
- **Intelligent Recommendations**:
  - **Categorized Starter Prompts**: organized by operational domains (Kependudukan & Profiling, Pertanahan & Geospasial, Knowledge Graph & Relasi, Audit & Verifikasi Terpadu) to guide users on fresh chats.
  - **Contextual Follow-up Chips**: dynamically generated chips under assistant answers based on detected subjects, executed tools (e.g. Dukcapil NIK, BPN persil, SIKAP vendor), and Neo4j relations.
- **Interactive Tool Explorer Catalog**:
  - Searchable catalog modal of all registered AI tools with category tabs (*All*, *Databases*, *APIs*, *MCP Remote*).
  - Detailed parameter schema breakdown (data types, required/optional status, descriptions).
  - **Use in Chat**: 1-click prompt generation inserting realistic example questions into chat.
  - **Copy Function Schema**: 1-click export of OpenAI standard Function Calling JSON Schema.
- **Few-shot auto-tuning**: user "👍 liked" responses are injected as style examples for future answers.
- **Negative feedback correction**: user "👎 disliked" notes are injected to prevent repeated mistakes.
- **Strict / Hallucination-free mode**: temperature=0, grounded exclusively on retrieved context.
- **Tool result caching**: configurable TTL per knowledge source with stale-while-revalidate background refresh.
- **Result deduplication**: SQL join / pagination duplicates automatically removed before LLM sees data.
- **Thinking / reasoning transparency**: `<think>` blocks and `reasoning_content` extracted and returned separately.
- **Photo auto-healing**: entity-aware base64 photo injection from tool results matched to LLM output.

### 12. 🛡️ Anti-Context-Rot Guard & Working Memory Architecture
Pada sesi percakapan investigasi atau analitik multi-turn yang panjang, riwayat chat secara akumulatif menyimpan seluruh riwayat, termasuk respons keliru, halusinasi, dump payload data mentah, dan informasi usang. Ketika model LLM membaca ulang seluruh riwayat tersebut di setiap langkah berikutnya, terjadi degradasi penalaran dan akurasi yang dikenal sebagai **Context Rot**.

MCP Server dilengkapi dengan **Anti-Context-Rot Guard Engine** (`services/backoffice_api/services/context_rot_guard.py`) yang secara proaktif mendeteksi, memetakan, dan menetralkan 3 mode kegagalan utama:

| Mode Context Rot | Gejala & Dampak | Mekanisme Pertahanan Sistem (Anti-Rot Guard) |
|---|---|---|
| **1. Poisoning** *(Keracunan Konteks)* | Satu halusinasi kecil (misal: nama function/tool fiktif, parameter tidak valid, atau fakta keliru) masuk ke riwayat asisten. Di giliran berikutnya, LLM menganggap riwayat asisten tersebut sebagai kebenaran mutlak (*ground truth*), lalu terus-menerus memanggil function tersebut atau mengulang kekeliruan secara rekursif. | • **Tool Whitelist Verification**: Memindai riwayat respons asisten terhadap `tool_dispatch_map` resmi. Tool call fiktif langsung dinetralisir menjadi komentar aman: `[alat/fungsi non-resmi telah dinetralisir]`.<br>• **Traceback Sanitization**: Membersihkan dump error stack trace teknis dari giliran lama agar LLM tidak terfokus pada pesan error teknis usang.<br>• **Apology Stripping**: Menghapus pola minta maaf berulang ("Maaf saya salah...", "Mohon maaf...") yang memicu bias ketidakpastian (*uncertainty bias*) pada LLM.<br>• **Anti-Poisoning System Directives**: Menegaskan pada sistem prompt bahwa riwayat asisten terdahulu adalah catatan dinamis dan bukan sumber kebenaran absolut jika bertentangan dengan katalog tool aktif. |
| **2. Distraction** *(Distraksi & Kelembaman Pola)* | Agent terlalu bersandar pada alur giliran terdahulu, terjebak dalam pengulangan format lama (*pattern inertia*), dan berhenti menyusun rencana baru (*fresh step-by-step plan*) saat pengguna berganti fokus masalah atau entitas target. | • **Automated Task Shift Detection (`_detect_task_shift`)**: Mendeteksi pergantian fokus investigasi berdasarkan perubahan entitas kunci (misal: kueri NIK Dukcapil ➜ sertifikat tanah BPN ➜ profil vendor SIKAP ➜ regulasi hukum) serta kata kunci reset kueri.<br>• **Working Context Quarantine**: Mengkarantina dan meringkas giliran lama ke dalam *scratchpad working memory* terisolasi.<br>• **Fresh Planning Directives**: Menginjeksi direktif strategis baru ke model: *"Topik/tugas telah berganti. Abaikan alur tugas sebelumnya. Susun rencana langkah baru (fresh plan) berdasarkan tools dan entitas terkini."* |
| **3. Confusion** *(Kebingungan Overload Konteks)* | Konteks kepenuhan muatan data besar yang sudah tidak relevan (seperti tabel markdown ratusan baris atau raw JSON payload berukuran puluhan KB). Mengakibatkan degradasi atensi (*needle-in-a-haystack drop*), peningkatan latensi inferensi, dan penurunan akurasi penalaran secara bertahap. | • **Tabular & JSON Bloat Compactor (`_compact_tabular_and_json_bloat`)**: Tabel markdown >5 baris pada riwayat lama diringkas menjadi sampel 3 baris + ringkasan total; payload JSON >300 karakter diringkas menjadi representasi skema ringkas.<br>• **Rolling Scratchpad Window**: Mempertahankan teks penuh (*verbatim*) hanya pada 2–3 giliran terbaru, sementara riwayat lama diarsip ke memori kerja terstruktur.<br>• **Token Savings Transparency**: Menghemat 40%–70% token pada sesi percakapan panjang dan dilaporkan secara transparan pada metadata balikan API (`context_rot_guard.tokens_saved`). |

#### Fitur Kontrol & Antarmuka UI:
- **Tombol "Topik Baru" (Reset Konteks Kerja)**: Tombol di toolbar chat (`RotateCcw`) yang memungkinkan pengguna memulai sesi investigasi/analisis baru secara instan tanpa menghapus riwayat pesan dari layar. Ditandai dengan divider visual beriluminasi perisai: `🛡️ Investigasi / Topik Baru Dimulai — Konteks Riwayat Disegarkan`.
- **Anti-Rot Guard Shield Badge**: Chip status pada footer setiap pesan asisten yang menampilkan efektivitas proteksi (misal: `🛡️ Anti-Rot: +1.420 token dihemat` atau `🛡️ Anti-Rot: Fresh Plan Diaktifkan`).
- **Programmatic Control via API**: Mendukung parameter boolean `clear_prior_context: true` pada `POST /api/chat` maupun kontrol per-request pada endpoint `/v1/chat/completions`.

### 13. 🎯 Precision Knowledge Tracing Engine (Field Glossary, Tool Mapping, Vector DB & Multi-Hop Graph)
Sistem dilengkapi dengan subsistem penelusuran data (*knowledge tracing & analytical reasoning engine*) yang dioptimalkan secara menyeluruh agar AI dapat menelusuri data berstruktur kompleks (kependudukan, pertanahan BPN, pengadaan barang & jasa, profil korporasi) tanpa halusinasi dan dengan tingkat presisi maksimal:

| Komponen | Masalah / Tantangan Awal | Mekanisme Tuning & Optimasi Sistem | Dampak Langsung pada AI |
|---|---|---|---|
| **1. Field Definition Glossary** | Potongan data terstruktur dari database/API memuat kode singkatan (misal: `HUB_KEL: 1`, `STAT_KWN: 2`, `TIPE_HAK: 1`). Tanpa konteks skema, LLM rentan berhalusinasi atau salah membaca kode angka. | • **Dynamic Glossary Injection**: Saat potongan dokumen dari sumber data diambil, sistem mengekstrak `field_definitions` resmi dari konfigurasi sumber dan menginjeksikannya sebagai `=== KAMUS DEFINISI KOLOM BASIS DATA (FIELD GLOSSARY) ===`.<br>• **Standard Code Dictionaries**: Menyertakan kamus konversi resmi untuk kode kependudukan Dukcapil (`HUB_KEL`: Kepala Keluarga, Istri, Anak, dll.; `STAT_KWN`, `JENIS_KLMIN`, `AGAMA`) dan Pertanahan BPN (`TIPE_HAK`: 1: SHM, 2: HGB, 3: HP, dll.). | AI membaca dan menafsirkan kode angka/singkatan secara akurat 100%, menghasilkan laporan analisis hubungan keluarga dan aset pertanahan yang presisi. |
| **2. Orchestrator Tool Mapping** | Target pada alur pengambilan data (*retrieval flows*) kerap menggunakan identifier abstrak/lama (`api_dukcapil_lookup`, `bpn`, `ahu`, `spse`, `rup`) yang tidak cocok dengan nama tool OpenAPI aktif di sistem. | • **Tool Target Aliasing (`TOOL_TARGET_ALIASES`)**: Melakukan pemetaan otomatis target alur ke nama fungsi OpenAPI nyata (`data_orang_dukcapil`, `cari_tanah_bpn`, `db_sikap_pemilik_usaha`, `db_spse_tender_pengumuman`, `db_rup_paket_penyedia_terumumkan`).<br>• **Remote MCP Tools Seamless Integration**: 20 tool dari Server MCP eksternal (misal: `MCP Togian` via SSE/RPC dengan awalan `mcp_mcp_togian_...`) otomatis terpetakan dan aktif di AI Chat & Data Orchestrator, melengkapi tool basis data lokal.<br>• **Explicit Action Directives**: Menyuntikkan instruksi konkret pemanggilan tool pada prompt sistem: `[tool_call -> PANGGIL TOOL: 'cari_tanah_bpn']` beserta panduan eksekusi berbasis prioritas kebenaran data otoritatif.<br>• **New Procurement Flow**: Menambahkan alur baku pengadaan (*Alur Penelusuran Pengadaan Barang & Jasa (PBJ), Tender SPSE & RUP Paket*). | AI tidak lagi bingung mencari nama fungsi, melainkan langsung memanggil tool OpenAPI maupun remote MCP yang sesuai dengan parameter hasil ekstraksi pertanyaan. |
| **3. High-Precision Vector DB Hybrid Search** | Ekstraksi kata kunci pada pencarian hibrida hanya menangkap angka numerik 6–20 digit (`\d{6,20}`), sehingga format nomor sertifikat (SHM/HGB), NPWP bertanda baca, dan kode paket lelang terlewat. | • **Multi-Identifier Extraction**: Mengekstrak kode sertifikat tanah (`SHM`, `HGB`, `NIB`, `NOP`, `NO_HAK`, `SURAT UKUR`), NPWP (format titik-strip maupun angka bersih), serta kode pengadaan (`KD_RUP`, `KD_PENYEDIA`, `KD_TENDER`, `ID_PAKET`).<br>• **Exact Attribute Match Scoring**: Potongan dokumen yang memuat atribut pengenal spesifik (seperti `"nomorhak": "10132307303457"`, `"nib": "..."`, atau `NPWP:`) otomatis memperoleh skor relevansi maksimal (`1.0`), menjamin dokumen target selalu tampil di peringkat teratas. | Dokumen sertifikat pertanahan, perpajakan, dan tender langsung ditemukan seketika (*instant top hit*) bahkan dengan kueri bertanda baca atau kode parsial. |
| **4. Multi-Hop Network Graph Intelligence (Neo4j)** | Penelusuran entitas sering kali kabur karena penamaan generic ("Entity"). Akibatnya identitas spesifik seperti NIK, Nama Perusahaan, atau Nomor Telepon saling tercampur. Kueri 1-hop sebelumnya membatasi penemuan afiliasi tersembunyi. | • **Strict Entity Modeling (Entity Detection)**: Menerapkan skema entitas spesifik di mana **"Orang"** diwakili unik oleh NIK (dengan relasi NAMA, KELUARGA, ALAMAT, BEKERJA_SEBAGAI, dll.), **"Perusahaan"** diwakili nama unik (PT/CV/Yayasan) dengan relasi kepemilikan/pengurus, dan **"Telepon"** diwakili MSISDN (relasi panggilan/WA/IPDR).<br>• **2-Hop Multi-Hop Network Traversal**: Menelusuri jalur hubungan tak langsung secara semantik (misal: Orang A ➜ Orang B ➜ Perusahaan C).<br>• **Distinct-Entity Grouping**: Distribusi kuota relasi seimbang per entitas (`WITH e LIMIT $limit`). | AI mampu mendeteksi profil entitas secara ketat tanpa halusinasi, memetakan jaringan keterkaitan spesifik antar individu dan instansi, serta menemukan hubungan tersembunyi atau anomali profil secara komprehensif. |

### 14. 🔒 Graph-Bounded Context Isolation (Anti-Kebocoran Konteks ChromaDB via Neo4j Network Boundary)

Pada sistem Retrieval-Augmented Generation (RAG) multi-sumber, seluruh hasil ingest (data Kependudukan Dukcapil, Sertifikat Tanah BPN, Rekanan Pengadaan SPSE/SIKAP, Notaris AHU, dll.) digabung ke dalam satu koleksi penyimpanan vektor ChromaDB (`knowledge_base`). 

Ketika pengguna melakukan pencarian dengan kata kunci umum (seperti *"tanah"*, *"sertifikat"*, *"rekening"*, *"perusahaan"*), pencarian kemiripan kosinus (ANN) rentan memunculkan potongan data milik orang atau badan usaha lain yang sama sekali tidak berhubungan dengan subjek investigasi. Hal ini menyebabkan **kebocoran konteks (*context leakage*)** dan menurunkan akurasi analisis AI.

Untuk mengatasi hal tersebut, MCP Server mengimplementasikan **Graph-Bounded Context Isolation Engine** (`services/mcp_server/context_isolator.py` & `services/backoffice_api/services/context_isolator.py`):

```mermaid
graph TD
    UserQuery["Kueri Percakapan / Sesi Investigasi"] --> Isolator["Context Isolator Engine"]
    
    subgraph S1 ["1. Identifikasi & Pewarisan Fokus"]
        Isolator --> EntityDetect["Ekstraksi Entitas & Topik Fokus<br>(Nama, NIK 16 digit, KK, PT/CV)"]
        EntityDetect --> SessionMem["Pewarisan Konteks Sesi Multi-Turn<br>(Inherit Focus dari Riwayat Chat)"]
        SessionMem --> TopicShift["Deteksi Pergantian Subjek / Topic Shift"]
    end
    
    subgraph S2 ["2. Pemetaan Batas Jaringan Otoritatif"]
        SessionMem --> Neo4j["Neo4j Knowledge Graph Traversal"]
        Neo4j --> GraphBoundary["Batas Jaringan Multi-Hop (1-Hop & 2-Hop)<br>• NIK & KK Resmi<br>• Anggota Keluarga & Relasi<br>• Sertifikat Tanah & AJB Terdaftar<br>• Perusahaan & Kepengurusan"]
    end
    
    subgraph S3 ["3. Pengambilan Kandidat Vektor"]
        UserQuery --> Chroma["ChromaDB Vector Search (Expanded Candidates)"]
    end
    
    subgraph S4 ["4. Graph-Bounded Filtering"]
        Chroma & GraphBoundary --> Filter["Penyaringan Ketat Batas Graf<br>(isolate_chunks)"]
        Filter -->|Terverifikasi dalam Jaringan Neo4j| Admitted["✅ Lolos ke Prompt AI (Admitted Context)"]
        Filter -->|Subjek Asing / Tidak Terhubung| Blocked["❌ Diblokir & Dieliminasi (Dropped Contaminant)"]
    end
    
    Admitted --> LLM["LLM Synthesis (Grounded, Terisolasi & Bebas Halusinasi)"]
```

#### Pilar Kerja Context Isolation:
1. **🎯 Penentuan & Pewarisan Entitas Fokus (*Session Focus Inheritance*)**:
   - Sistem secara cerdas mendeteksi entitas target dari pesan (misal: `"INDRADHI NUGRAHA MULYANTO"` atau NIK `"3671090910810001"`).
   - Pada pertanyaan lanjutan (*follow-up turns*), jika pengguna bertanya tanpa menyebutkan nama (misal: *"Aset tanah apa saja yang dimiliki dan berapa nomor sertifikatnya?"*), sistem secara otomatis mewarisi entitas fokus dari sesi/riwayat obrolan sebelumnya.
   - Jika pengguna sengaja menanyakan pihak baru (misal: *"Tampilkan profil PT Waskita Karya"*), sistem mendeteksi *Topic Shift* dan merefresh batas jaringan untuk entitas baru tersebut.
2. **🌐 Resolusi Batas Jaringan Graf Neo4j (*Graph Network Boundary*)**:
   - Menjalankan kueri Cypher 1-hop & 2-hop terhubung (`get_connected_context_network`).
   - Mengumpulkan seluruh pengenal sah: NIK, nomor KK, nama keluarga/orang tua, nomor sertifikat tanah (SHM/HGB), akta jual beli (AJB), nama perusahaan terafiliasi, serta alamat domisili.
3. **🛡️ Eliminasi Kontaminan Lintas Entitas (*Graph-Bounded Chunk Filter*)**:
   - Memeriksa setiap potongan dokumen kandidat dari ChromaDB.
   - Jika potongan dokumen memuat nama pemilik, pemegang hak, atau subjek pendaftaran sipil/pertanahan yang **berbeda dan tidak terhubung** dalam graf Neo4j, chunk tersebut langsung dibuang (*isolated and dropped*).
   - Menghasilkan laporan metrik isolasi transparan pada balikan respons:
     ```json
     "context_isolation": {
       "status": "enforced",
       "focus_entity": "INDRADHI NUGRAHA MULYANTO",
       "is_mapped_in_neo4j": true,
       "network_size": 29,
       "candidates_total": 9,
       "admitted_count": 7,
       "isolated_dropped_count": 2,
       "dropped_reasons": [
         "Blocked foreign entity 'INCOE HADJI DAPET JENISMODAL' not connected in Neo4j graph",
         "Blocked foreign entity 'Unrelated Registry Record' not connected in Neo4j graph"
       ]
     }
     ```
4. **⚙️ Kontrol Fleksibel via MCP Tools & API**:
   - `focus_entity`: Menetapkan target entitas/subjek isolasi secara spesifik.
   - `session_id`: Mengikat percakapan ke sesi memori isolasi tertentu.
   - `isolate_context`: Boolean toggle (default `true`) untuk mengaktifkan/menonaktifkan filter batas graf.
   - Tersedia pada MCP Tools (`search_knowledge_base`, `orchestrate_knowledge_search`, `set_chat_focus_context`, `get_chat_focus_context`), Backoffice API (`/api/chat`, `/api/chat/stream`, `/api/knowledge/orchestrate-search`), dan endpoint standar `/v1/chat/completions`.
5. **✨ Zero-Data Leakage Suggestion Guard (Pencegahan Bocoran Saran pada Chat Baru & Aplikasi Eksternal)**:
   - **Bypass Vektor & Graf Otomatis pada Chat Baru**: Saat pengguna membuka sesi chat baru atau mengirimkan sapaan (*greeting* seperti *"Halo"*, *"Hai"*, atau *"Apa yang bisa kamu lakukan?"*), sistem mendeteksi bahwa kueri bersifat eksplorasi umum tanpa target entitas. Sistem secara otomatis **melewati (*bypass*) pencarian vektor ChromaDB dan graf Neo4j** sehingga bank data tidak tercampur ke dalam konteks pembuka.
   - **Sanitasi Determinir Tag `<suggestions>`**: Seluruh saran pertanyaan lanjutan (*chips*) yang dikirimkan ke aplikasi eksternal disaring secara ketat melalui `sanitize_response_suggestions`. Pada percakapan baru / tanpa entitas fokus, sistem secara otomatis mengganti setiap saran yang menyebutkan nama orang, NIK 16 digit, nama PT/CV, atau nomor sertifikat dari database dengan panduan prosedural umum yang aman (contoh: *"Bagaimana cara menelusuri data kependudukan berdasarkan NIK?"*, *"Bagaimana alur pengecekan sertifikat tanah di BPN?"*).
   - **Isolasi Rekomendasi Terikat Jaringan**: Saat subjek investigasi aktif, saran pertanyaan lanjutan dibatasi secara ketat hanya pada batas jaringan Neo4j milik subjek tersebut, mencegah kebocoran data orang/perusahaan lain ke bagian *suggestion*.

### 15. 🔐 Security & RBAC
- **JWT-based authentication** with role-based access: `admin`, `editor`, `viewer`.
- **API Keys** with scoped permissions (tool allowlist, knowledge base allowlist).
- Middleware-level key validation with **in-memory caching** (60s TTL) to minimize latency.
- `MCP_AUTH_ENABLED` toggle for development environments.

### 16. 🗄️ Enterprise Data Persistence & Zero-Loss Protection
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
                    │        MCP Server        │  ← Inbound: API Key Auth · Dynamic Tool Discovery
                    │  :8001 (SSE/RPC/MCP)     │    Tool permission scoping per key
                    └────────┬─────────────────┘
                             │ REST (internal)
                             ▼
          ┌──────────────────────────────────────────────┐       ┌───────────────────────────────┐
          │         Backoffice API (FastAPI :8000)       │ ◄──── │  Remote MCP Servers (Outbound)│
          │                                              │  SSE  │  (e.g. MCP Togian : 20 Tools) │
          │  /api/chat          – Hybrid RAG Chat        │  RPC  └───────────────────────────────┘
          │  /api/chat/stream   – Streaming SSE Chat     │
          │  /v1/chat/completions – OpenAI-Compatible    │
          │  /v1/models         – Model Listing          │
          │  /api/knowledge     – Source & MCP Management│
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
| **Backoffice & OpenAI API Docs** | [http://localhost:5173/docs](http://localhost:5173/docs) or [http://localhost:8002/docs](http://localhost:8002/docs) | `http://<server-ip>/docs` | Interactive Swagger UI with full `/v1/*` OpenAI API schemas & interactive testing |
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
| **Chat** | Full RAG chat UI with streaming, file upload, face scan, Anti-Context-Rot Guard ("Topik Baru" context reset & metrics), reasoning display, and dynamic tool explorer |
| **Network Explorer** | Interactive Cytoscape.js graph — multi-hop path-finding, cluster analysis |
| **Data Orchestrator** | Prompt Flow Memory — create/edit/test multi-step retrieval flows |
| **MCP Personality** | Configure AI personas, tone, mission, and custom instructions |
| **API Keys** | Manage MCP API keys with tool and KB scoping |
| **Database Settings** | Configure connection parameters for database sources + Vector DB Sync modal (ChromaDB ⇄ Qdrant bi-directional migration & live sync) |
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
| `QDRANT_HOST` | *(optional)* | Qdrant host (e.g. `alakai.bin.go.id`) |
| `QDRANT_PORT` | `6333` | Qdrant HTTP port |
| `QDRANT_API_KEY` | *(optional)* | Qdrant JWT / Bearer API key |
| `QDRANT_COLLECTION` | `mcp_ai` | Qdrant vector collection name |
| `VECTOR_DB_DUAL_WRITE` | `false` | Real-time dual-write ingestion to both ChromaDB and Qdrant |
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
