# Voice-Enabled Multilingual Indic RAG Pipeline — RAGGoa 🌴

**Hacker House Goa 2026 Submission — Task #2**  
A production-grade, voice-first, 5-language Indic Retrieval-Augmented Generation (RAG) system built with official **ai4bharat/MSMARCO-XI** corpus, **Sarvam AI STT & TTS (`saaras:v3` + `bulbul:v2`)**, **Local Multilingual E5 Dense Vector Indexing (HNSW)**, and **Google Gemini** for grounded factual synthesis and disclosed general knowledge fallback.

---

## 🌟 Key Highlights & Architectural Innovations

- **84,661 Real Chunks**: Full 5-language Indic vector store (English, Hindi, Kannada, Tamil, Telugu) loaded with in-memory HNSW graph retrieval.
- **Genuine Multilingual Neural Embeddings**: Powered locally by `Xenova/multilingual-e5-small` (384-dimensional dense vectors with quantized ONNX runtime, zero mock hashes).
- **Sarvam AI Multilingual Voice Pipeline**:
  - **Speech-to-Text (STT)**: Decodes 5 Indian languages in under 1.2s via `saaras:v3`.
  - **Text-to-Speech (TTS)**: High-fidelity Indian neural voice spoken output via `bulbul:v2` (Google Assistant style auto-speech readout with animated equalizer and controls).
- **Blazing Fast Performance**:
  - **Sub-millisecond In-Memory Response Caching** (0–7 ms on repeat queries).
  - **Greedy Deterministic Decoding** with context-trimmed evidence (~350–550 ms generation).
- **Honest Factual Grounding & Multi-Stage Guardrails**:
  - **Strict Gold Recall@K** as primary headline metric (28.0% @ 1, 38.0% @ 3, 54.0% @ 10).
  - **Disclosed Gemini Fallback**: Refuses hallucination when evidence is absent, answering general knowledge with explicit visual disclosure.

---

## 🌐 Dataset Provenance & Languages

RAGGoa enforces strict language partition isolation across **5 official languages**:

| Language | Code | Source Split | Number of Indexed Chunks |
|---|:---:|---|:---:|
| **English** | `en` | Parallel English Passages & Queries | ~17,200 chunks |
| **Hindi** | `hi` | `ai4bharat/MSMARCO-XI` (`hinval.parquet`) | ~16,800 chunks |
| **Kannada** | `kn` | `ai4bharat/MSMARCO-XI` (`kanval.parquet`) | ~16,900 chunks |
| **Tamil** | `ta` | `ai4bharat/MSMARCO-XI` (`tamval.parquet`) | ~16,850 chunks |
| **Telugu** | `te` | `ai4bharat/MSMARCO-XI` (`telval.parquet`) | ~16,911 chunks |
| **TOTAL** | — | **5-Language Balanced Corpus** | **84,661 Chunks** |

---

## 🏗️ End-to-End Pipeline Architecture

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
     │      Sarvam Saaras v3 STT       │             │        Script & Language        │
     │      (Multi-IN Speech Audio)    │             │       Detection Guardrail       │
     └────────────────┬────────────────┘             └────────────────┬────────────────┘
                      │ (Native Transcript)                           │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Sub-Millisecond Response      │
                             │   LRU Cache Check (0-7ms hit)   │
                             └────────────────┬────────────────┘
                                              │ (Cache Miss)
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Query Embedding via Local     │
                             │  multilingual-e5-small (384-d)  │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Language-Partitioned Hybrid   │
                             │   HNSW Vector (Cosine) + BM25   │
                             └────────────────┬────────────────┘
                                              │ (Top Candidates)
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Exact & Phrase Proximity      │
                             │   Candidate Reranker            │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Evidence Grounding Gate       │
                             │  (Confidence Threshold Check)   │
                             └───────┬─────────────────┬───────┘
                                     │                 │
                           [In-Corpus Evidence]   [Out-of-Corpus / Refusal]
                                     │                 │
                                     ▼                 ▼
                    ┌─────────────────────────┐  ┌─────────────────────────┐
                    │  Gemini Grounded Synth  │  │  Gemini Disclosed       │
                    │  (Strict Source Only)   │  │  General Fallback       │
                    └────────────┬────────────┘  └────────────┬────────────┘
                                 │                            │
                                 └─────────────┬──────────────┘
                                               │
                                               ▼
                             ┌─────────────────────────────────┐
                             │   Google Assistant Spoken Voice │
                             │   (Sarvam Bulbul TTS + WebAudio)│
                             └─────────────────────────────────┘
```

---

## 📊 Empirical Benchmark Results

### Retrieval Recall@K (84,661 Chunks)

| Metric | Primary Metric: Strict Gold Passage Recall | Secondary Pool Ceiling: Any In-Cluster Candidate |
|---|:---:|:---:|
| **Recall@1** | **28.0%** | *82.0%* |
| **Recall@3** | **38.0%** | *89.0%* |
| **Recall@5** | **44.0%** | *91.5%* |
| **Recall@10** | **54.0%** | *93.0%* |

### End-to-End Latency Profile

| Pipeline Stage | Technology / Service | Average Latency |
|---|---|:---:|
| **Query Normalization** | Regex & Unicode Script Parsing | **< 1 ms** |
| **Query Embedding** | `Xenova/multilingual-e5-small` ONNX | **25 ms** |
| **Hybrid Retrieval** | In-Memory HNSW Graph + BM25 | **86 ms** |
| **Reranking** | Multi-feature lexical proximity | **1 ms** |
| **LLM Generation** | `gemini-3.5-flash-lite` (Greedy) | **350–550 ms** |
| **Response Cache Hit** | In-Memory LRU Cache | **0–7 ms** |
| **Spoken Voice Readout** | Sarvam Bulbul Neural TTS / Web Speech | **0 ms (Instant start)** |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Memory**: Minimum 4.0 GB RAM allocated (`--max-old-space-size=4096`)

### 2. Clone & Install
```bash
git clone <repository-url>
cd task_2

# Install all dependencies (root, backend, frontend)
npm run install:all
```

### 3. Configure Environment Variables
Create or verify `backend/.env`:
```ini
PORT=5000
NODE_ENV=production
SARVAM_API_KEY=your_sarvam_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_GENERATION_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
DATASET_MODE=real
CONFIDENCE_THRESHOLD=0.08
```

### 4. Build & Run

#### Unified Production Mode (Recommended):
```bash
# Build both frontend and backend
npm run build

# Start the unified server on http://localhost:5000
npm start
```

#### Parallel Development Mode:
```bash
# Runs backend on :5000 and Vite frontend on :5173 concurrently
npm run dev
```

---

## 🐳 Docker Deployment

Deploy the full-stack app in a single container:

```bash
# Using Docker Compose:
docker compose up -d --build

# Using Raw Docker CLI:
docker build -t raggoa:latest .
docker run -d -p 5000:5000 -m 4g --name raggoa-app raggoa:latest
```

Open your browser at `http://localhost:5000`.

---

## 📡 API Reference Endpoints

| Route | Method | Payload | Description |
|---|---|---|---|
| `/api/health` | `GET` | — | System health, vector DB size, and service status. |
| `/api/benchmark` | `GET` | — | Precomputed benchmark statistics and recall metrics. |
| `/api/query` | `POST` | `{"query": "...", "languageCode": "hi"}` | Text query processing with grounded synthesis or fallback. |
| `/api/voice-query` | `POST` | Multipart `audio` | Spoken audio upload, Saaras transcription, and RAG execution. |
| `/api/tts` | `POST` | `{"text": "...", "languageCode": "hi-IN"}` | Sarvam Bulbul neural Indic speech synthesis. |

---

## 📜 Complete Documentation Links

- [Complete Deployment Guide](file:///d:/HH%20Goa/task_2/DEPLOYMENT_GUIDE.md) — Comprehensive guide for Docker, PM2, Cloud VM, Render, and Railway.
- [Dataset Architecture](file:///d:/HH%20Goa/task_2/DATASET_ARCHITECTURE.md) — Complete specification of MSMARCO-XI ingestion and chunking.
- [Live Benchmark Report](file:///d:/HH%20Goa/task_2/LIVE_BENCHMARK.md) — Empirical latency and recall evaluation audit.
