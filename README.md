# Voice-Enabled Multilingual RAG Pipeline — RAGGoa 🌴

**Hacker House Goa 2026 Submission — Task #2**  
A production-grade, voice-first, 5-language Indic Retrieval-Augmented Generation (RAG) system built with official **ai4bharat/MSMARCO-XI** streaming ingestion, **Sarvam AI STT (`saaras:v3`)**, and **Google Gemini (`gemini-embedding-2` + `gemini-flash`)**.

---

## 🌐 Dataset Provenance & Streaming Architecture

> **Official Dataset Notice**:  
> "RAGGoa uses the official AI4Bharat MSMARCO-XI dataset as its source corpus. The ingestion pipeline streams the dataset from Hugging Face and builds a controlled, reproducible five-language local retrieval index. The full source dataset is not downloaded to the developer machine, and Hugging Face is not queried during normal runtime retrieval."

### Supported Languages (5-Language Balanced Corpus)
RAGGoa strictly enforces language partition isolation across **5 official languages**:

1. **English (`en`)** — Official MS MARCO English validation passages & queries
2. **Hindi (`hi`)** — `ai4bharat/MSMARCO-XI` Hindi validation split (`hinval.parquet`)
3. **Kannada (`kn`)** — `ai4bharat/MSMARCO-XI` Kannada validation split (`kanval.parquet`)
4. **Tamil (`ta`)** — `ai4bharat/MSMARCO-XI` Tamil validation split (`tamval.parquet`)
5. **Telugu (`te`)** — `ai4bharat/MSMARCO-XI` Telugu validation split (`telval.parquet`)

### Dataset Inventory & Provenance Metrics
* **Source Repository**: [`ai4bharat/MSMARCO-XI`](https://huggingface.co/datasets/ai4bharat/MSMARCO-XI)
* **Ingestion Mode**: `STREAMING` via asynchronous byte-range decompressors (`hyparquet` + `snappy`)
* **Full Dataset Downloaded?**: **NO** (No 55+ GB corpus download to disk)
* **Runtime Hugging Face Dependency?**: **NO** (100% local retrieval at runtime)
* **Active Indexed Subset**: Exactly 10 queries & 100 passages per language (50 queries, 500 passages total)
* **Total Chunks in Vector Store**: **3,381 Chunks** across 4 chunking strategies (`FixedSize`, `SentenceAware`, `Semantic`, `MetadataAware`)
* **Embedding Model**: `gemini-embedding-2` (3072-dimensional normalized vectors with disk cache)

---

## 🏗️ Architecture & Orchestration Harness

```
                             ┌─────────────────────────────────┐
                             │  Voice / Text Query (5 Langs)   │
                             │   (EN · HI · KN · TA · TE)      │
                             └────────────────┬────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
             [Spoken Audio Clip]                             [Raw Text Input]
                      │                                               │
                      ▼                                               ▼
     ┌─────────────────────────────────┐             ┌─────────────────────────────────┐
     │           Sarvam STT            │             │        Script & Language        │
     │      (Saaras:v3 Multi-IN)       │             │       Detection Guardrail       │
     └────────────────┬────────────────┘             └────────────────┬────────────────┘
                      │ (Native Transcript)                           │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │  Query Normalization & Guard    │
                             │  (Length, Injection, Relevance) │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │    Local Embedding Cache &      │
                             │  gemini-embedding-2 (3072-dim)  │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Language-Partitioned Hybrid   │
                             │  Vector (Cosine) + Lexical BM25 │
                             └────────────────┬────────────────┘
                                              │ (Top Candidates)
                                              ▼
                             ┌─────────────────────────────────┐
                             │    Proximity & Exact Reranker   │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Grounding & Citation Guard    │
                             │  (Confidence Threshold Check)   │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │       Gemini Answer Gen         │
                             │  (Strict Source Evidence Only)  │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │  Grounded Answer + Citations +  │
                             │       Per-Stage Telemetry       │
                             └─────────────────────────────────┘
```

---

## 🚀 Quick Start & Production Commands

### 1. Installation
```bash
# Clone repository
git clone https://github.com/deeepakgm-hw/HHgoa-Task2.git
cd HHgoa-Task2

# Install dependencies for root, backend, and frontend
npm run install:all
```

### 2. Environment Configuration
Create `backend/.env` (see `backend/.env.example`):
```env
PORT=5000
NODE_ENV=development
DATASET_NAME=ai4bharat/MSMARCO-XI
DATASET_SPLIT=validation
DATASET_LANGUAGES=en,hi,kn,ta,te
MAX_ROWS_PER_LANGUAGE=10
MAX_PASSAGES_PER_LANGUAGE=100
CONFIDENCE_THRESHOLD=0.08
GEMINI_API_KEY=your_gemini_api_key_here
SARVAM_API_KEY=your_sarvam_api_key_here
```

### 3. Streaming Ingestion Commands
```bash
# Stream official MSMARCO-XI split and generate local 5-language vector store with checkpointing
npm run ingest:stream --prefix backend

# Verify dataset provenance, checkpoint validity, and language balance
npm run ingest:verify --prefix backend
```

### 4. Running Benchmarks & Tests
```bash
# Run all 14 Jest test suites (86+ unit and integration tests)
npm test --prefix backend

# Run multilingual retrieval and latency benchmark harness
npm run benchmark --prefix backend

# Run live voice STT and telemetry benchmark
npm run benchmark:voice --prefix backend
```

### 5. Running the Application
```bash
# Start both Backend (Port 5000) and Frontend (Port 3000) concurrently
npm run dev
```

Visit **`http://localhost:3000`** in your browser to interact with the voice RAG system.

---

## 📊 Live Telemetry & Latency Profiling

RAGGoa tracks discrete wall-clock latency for every pipeline stage and reports transparent percentiles (excluding failed/rate-limited queries):

| Pipeline Stage | Measurement Mode | Typical Local RAG Latency | Typical Live Voice Latency |
| :--- | :---: | :---: | :---: |
| **STT (Sarvam Saaras:v3)** | Remote API | N/A (Text Query) | 400 – 900 ms |
| **Query Normalization** | Local CPU | < 2 ms | < 2 ms |
| **Embedding Generation** | Disk Cache / API | 0.5 – 2 ms (Cached) | 0.5 – 2 ms |
| **Hybrid Retrieval** | Local In-Memory | 10 – 25 ms | 10 – 25 ms |
| **Reranking** | Local CPU | 0.3 – 1 ms | 0.3 – 1 ms |
| **Grounded Generation** | Gemini Flash / Extractive | 350 – 800 ms | 350 – 800 ms |
| **Total Pipeline** | End-to-End | **~ 400 – 850 ms** | **~ 800 – 1700 ms** |

---

## 🔒 Security & Provenance Invariants
- **Zero API Keys in Repository**: Scanned and verified. No real API keys exist in git history or committed files.
- **Runtime Isolation**: Hugging Face is queried only at ingestion time; live queries use the local vector database.
- **Deterministic Checkpointing**: Checkpoint files store configuration hashes and processed row counters in `backend/data/msmarco-xi/checkpoints/`.
