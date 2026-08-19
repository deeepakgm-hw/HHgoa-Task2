# RAGGoa Official MSMARCO-XI Streaming Ingestion & Dataset Provenance Report

**Project:** RAGGoa — Multilingual Voice-Enabled Indic RAG System  
**Hackathon:** Hacker House Goa 2026 (Task #2)  
**Audit Date:** August 17, 2026  
**Architecture:** Production Streaming Ingestion + Local Runtime Retrieval  

---

## 1. Executive Summary

| Requirement | Implementation Status | Technical Provenance & Details |
| :--- | :--- | :--- |
| **Official Dataset Source** | `ai4bharat/MSMARCO-XI` | Streamed directly from official Hugging Face dataset repository. |
| **Ingestion Mechanism** | **STREAMING (Zero full-disk download)** | Asynchronous byte-range streaming via `hyparquet` decompression. No 55+ GB download required. |
| **Active Target Languages** | **5 Official Languages** | English (`en`), Hindi (`hi`), Kannada (`kn`), Tamil (`ta`), Telugu (`te`). *No Bengali.* |
| **Dataset Split** | `validation` | Official `val` splits: `hinval.parquet`, `kanval.parquet`, `tamval.parquet`, `telval.parquet`. |
| **Balanced Per-Language Quota** | **10 queries / 100 passages each** | Perfectly balanced: 50 queries and 500 passages across all 5 languages. |
| **Total Chunks in Vector Store** | **3,381 Chunks** | EN: 672, HI: 660, KN: 670, TA: 678, TE: 694 (+ 7 factual grounding passages). |
| **Chunking Strategies** | **4 Real Implementations** | `FixedSizeChunker`, `SentenceAwareChunker`, `SemanticChunker`, `MetadataAwareChunker`. |
| **Embedding Model** | `gemini-embedding-2` | 3072-dimensional normalized dense vectors with local disk caching (`embeddings_cache.json`). |
| **Runtime Retrieval Dependency** | **100% LOCAL (0 HF calls)** | Vector + Lexical hybrid search runs entirely in-memory from `vector_store.json`. |
| **Checkpoint & Resume State** | `backend/data/msmarco-xi/checkpoints/` | Complete resumable checkpointing with SHA-256 configuration hash validation. |

---

## 2. Five-Language Ingestion & Sampling Breakdown

The streaming engine processes the official Hugging Face MSMARCO-XI validation split with deterministic quotas:

| Language Code | Language Name | Source File / Hugging Face Stream | Streamed Queries | Streamed Passages | Generated Chunks | Sample Query |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `en` | English | `English_passages` & `Eng_Query` | 10 | 100 | 672 | `. what is a corporation?` |
| `hi` | Hindi | `hi/hinval.parquet` | 10 | 100 | 660 | `कॉर्पोरेशन क्या है?` |
| `kn` | Kannada | `kn/kanval.parquet` | 10 | 100 | 670 | `. ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?` |
| `ta` | Tamil | `ta/tamval.parquet` | 10 | 100 | 678 | `ஒரு நிறுவனம் என்பது என்ன?` |
| `te` | Telugu | `te/telval.parquet` | 10 | 100 | 694 | `కార్పొరేషన్ అంటే ఏమిటి?` |
| **Total** | **5 Languages** | `ai4bharat/MSMARCO-XI` | **50** | **500** | **3,381** | *Balanced Multilingual Corpus* |

---

## 3. Streaming Ingestion Pipeline Architecture

```
                      ai4bharat/MSMARCO-XI (Hugging Face)
                                       │
                      [Streaming Asynchronous Byte Ranges]
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
       Hindi / English Stream                       Kannada / Tamil / Telugu
  (hinval.parquet - 97,941 rows)             (kanval, tamval, telval parquets)
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       ▼
                       [Deterministic 5-Language Filter]
                      10 Queries / 100 Passages per Lang
                                       ▼
                        [Checkpoint & Resume Manager]
                   backend/data/msmarco-xi/checkpoints/
                                       ▼
                     [Multi-Strategy Chunking Pipeline]
              Fixed (300) | Sentence (400) | Semantic | Metadata
                                       ▼
                     [Dense Embedding Generation & Cache]
                       gemini-embedding-2 (3072 dims)
                                       ▼
                       [Persistent Local Vector Store]
                       backend/data/vector_store.json
                                       ▼
                       [Runtime Isolation Boundary]
                   ====================================
                        LOCAL RUNTIME EXECUTION
                 (0 Remote HF Calls During User Queries)
```

---

## 4. Chunk Metadata & Provenance Schema

Every indexed chunk contains complete provenance tags for transparent citations and grounding:

```json
{
  "id": "msmarco-xi-kn-q1-p3_semantic_2",
  "text": "೨. ಅವರು ಎಲ್ಲಾ-ನೀವು-ತಿನ್ನಬಹುದಾದ ಭೋಜನಮಂದಿರಗಳನ್ನು ಇಷ್ಟಪಡುತ್ತಾರೆ ಎಂದು ತೋರಿಸಿದ ಗಮನಾರ್ಹ ಕಾರ್ಪೊರೇಷನ್.",
  "metadata": {
    "datasetName": "ai4bharat/MSMARCO-XI",
    "source": "Hugging Face (Streaming Ingestion)",
    "split": "validation",
    "language": "kn",
    "languageName": "Kannada",
    "queryId": "msmarco-xi-kn-q1",
    "passageId": "msmarco-xi-kn-q1-p3",
    "docId": "doc-kn-1-4",
    "isSelected": false,
    "strategy": "semantic",
    "ingestionConfig": {
      "mode": "streaming-real"
    }
  }
}
```

---

## 5. Verification Commands

To reproduce and verify the dataset provenance:

```bash
# 1. Execute streaming ingestion directly from MSMARCO-XI splits
npm run ingest:stream

# 2. Run dataset provenance & checkpoint auditor
npm run ingest:verify

# 3. Run full automated test suite (all 14 suites)
npm test

# 4. Run multilingual benchmark harness
npm run benchmark
```
