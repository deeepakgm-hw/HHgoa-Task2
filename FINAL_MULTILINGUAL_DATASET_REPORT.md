# Final Multilingual Dataset & Technical Integrity Audit Report

**System**: RAGGoa — 5-Language Voice RAG System  
**Audit Date**: August 17, 2026  
**Dataset Source**: Official `ai4bharat/MSMARCO-XI` (Hugging Face) + MS MARCO English Original  
**Evaluation Scope**: 5 Languages (`English`, `Hindi`, `Kannada`, `Tamil`, `Telugu`), 4 Chunking Strategies, 3,426 Chunks

---

## 1. Dataset Verification & Provenance

| Metric / Parameter | Real Verified State |
| :--- | :--- |
| **Official Hugging Face Dataset** | `ai4bharat/MSMARCO-XI` |
| **Target Languages** | 5 (`en`, `hi`, `kn`, `ta`, `te`) |
| **Downloaded Parquet Splits** | `hi/hinval.parquet` (461.8 MB)<br>`kn/kanval.parquet` (482.7 MB)<br>`ta/tamval.parquet` (493.0 MB)<br>`te/telval.parquet` (474.1 MB) |
| **Total Downloaded Raw Data** | **1.88 GB** across 391,764 total rows |
| **English Dataset Source** | Official English passages & queries decoded directly from MS MARCO (`English_passages` & `Eng_Query` columns) |
| **Decoded Subset Volume** | 50 Queries (10 per language) and 500 Passages (100 per language) |
| **Manifest Location** | `backend/data/msmarco-xi/processed/dataset_manifest.json` |
| **Processed Data Location** | `backend/data/msmarco-xi/processed/msmarco_xi_5lang_subset.json` |

---

## 2. Ingestion & Vector Database Statistics

| Language | Queries | Passages | Chunks Generated | Chunking Strategies |
| :--- | :---: | :---: | :---: | :--- |
| **English (`en`)** | 10 | 100 | **701** | FixedSize, SentenceAware, Semantic, MetadataAware |
| **Hindi (`hi`)** | 10 | 100 | **577** | FixedSize, SentenceAware, Semantic, MetadataAware |
| **Kannada (`kn`)** | 10 | 100 | **740** | FixedSize, SentenceAware, Semantic, MetadataAware |
| **Tamil (`ta`)** | 10 | 100 | **695** | FixedSize, SentenceAware, Semantic, MetadataAware |
| **Telugu (`te`)** | 10 | 100 | **713** | FixedSize, SentenceAware, Semantic, MetadataAware |
| **TOTAL** | **50** | **500** | **3,426 Chunks** | Vector Store: `backend/data/vector_store.json` |

---

## 3. Language Isolation & Routing

1. **Vector Index Partitioning**:
   Every chunk in `vector_store.json` contains `metadata.language` (e.g. `'kn'`). Vector searches with `filterLanguage` restrict candidates strictly to that language partition.
2. **STT Language Code Routing**:
   Sarvam STT (`saaras:v3`) accepts `hi-IN`, `kn-IN`, `ta-IN`, `te-IN`, and `en-IN`.
3. **Generation Language Script Matching**:
   Gemini generation prompt dynamically detects the query script and instructs the model to answer exclusively in the user's native language and script.

---

## 4. Benchmark & Quality Evaluation Results

### Recall @ K Across 50 Multilingual Queries
| Configuration | Recall@1 | Recall@3 | Recall@5 | Recall@10 |
| :--- | :---: | :---: | :---: | :---: |
| **1. Vector-Only** | 0.0% | 0.0% | 0.0% | 2.0% |
| **2. Lexical-Only (BM25)** | 24.0% | 26.0% | 26.0% | 26.0% |
| **3. Hybrid (Vector + Lexical)** | 6.0% | 8.0% | 8.0% | 8.0% |
| **4. Hybrid + Proximity Reranking** | **8.0%** | **10.0%** | **10.0%** | **10.0%** |

### Stage-Level Latency Decomposition
* **Embedding Cache Lookups**: `0.07 ms` (P50)
* **Local Hybrid Retrieval (3,426 Chunks)**: `3.64 ms` (P50) | `8.41 ms` (P100)
* **Proximity Reranking**: `< 0.1 ms` (P50)
* **Total Local Engine Execution**: **`< 4.0 ms`**
* **Sarvam STT (`saaras:v3`)**: `~360 ms` (P50)
* **Gemini Grounded Answer Generation**: `~1.2 s - 2.8 s` (P50)

---

## 5. Verification & Test Suite Passing Record

* **Automated Test Suites**: 13 Suites, **81 Tests Passed** (0 Failures)
* **Frontend Build**: Vite v5.4.21 bundle generated in 2.60s (0 Errors)
* **API Endpoints**: `/api/health`, `/api/query`, `/api/voice-query`, `/api/benchmark` verified with multilingual payloads.
