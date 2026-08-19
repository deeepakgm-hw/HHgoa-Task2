# Dataset Provenance & Multilingual Architecture Specification

## 1. Official Dataset Provenance

| Property | Value |
| :--- | :--- |
| **Dataset Name** | MSMARCO-XI (Multilingual MS MARCO Passage Ranking) |
| **Official Repository** | [`ai4bharat/MSMARCO-XI`](https://huggingface.co/datasets/ai4bharat/MSMARCO-XI) |
| **Publisher** | AI4Bharat / IIT Madras |
| **License** | CC-BY-4.0 / Microsoft MS MARCO Terms |
| **Validation Splits Downloaded** | 4 Parquet files (`hinval.parquet`, `kanval.parquet`, `tamval.parquet`, `telval.parquet`) |
| **Total Validation Split Size** | 1.88 GB (461.9 MB + 482.7 MB + 493.0 MB + 474.1 MB) |
| **Total Split Rows** | 391,764 validation queries with passage collections (97,941 per language) |
| **Compression & Format** | Apache Parquet (Snappy compressed, decoded via `hyparquet` + `hyparquet-compressors`) |

## 2. 5-Language Active Corpus Breakdown

The active corpus contains **500 passages** and **50 gold-grounded queries** across 5 distinct languages extracted directly from the official MSMARCO-XI validation parquets:

| Language | ISO Code | Script / Family | Source Split | Queries | Passages | Chunks (Semantic Strategy) |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **English** | `en` | Latin (Indo-European) | Official `English_passages` / `Eng_Query` | 10 | 100 | ~142 |
| **Hindi** | `hi` | Devanagari (Indo-Aryan) | `hinval.parquet` | 10 | 100 | ~140 |
| **Kannada** | `kn` | Kannada (Dravidian) | `kanval.parquet` | 10 | 100 | ~141 |
| **Tamil** | `ta` | Tamil (Dravidian) | `tamval.parquet` | 10 | 100 | ~145 |
| **Telugu** | `te` | Telugu (Dravidian) | `telval.parquet` | 10 | 100 | ~142 |
| **Total** | **5** | **4 distinct scripts** | **ai4bharat/MSMARCO-XI** | **50** | **500** | **~710** |

## 3. Strict Multilingual Isolation & Routing Architecture

1. **Language Metadata Invariant**: Every passage and chunk ingested into the Vector Database is stamped with explicit `language: 'en' | 'hi' | 'kn' | 'ta' | 'te'`.
2. **Retrieval Partitioning**: When a user queries in a specific language (e.g. Kannada), the hybrid retrieval engine strictly partitions search to candidates matching `candidate.metadata.language === queryLanguage`.
3. **STT Language Routing**: Sarvam STT accepts speech input mapped to `hi-IN`, `kn-IN`, `ta-IN`, `te-IN`, and `en-IN`.
4. **Prompt Enforcement**: Gemini 2.5 Flash receives explicit language instructions and native terminology definitions to respond in the native script of the query.
5. **Evaluation Suite**: 50 benchmark queries (10 per language) are evaluated across 4 retrieval configurations (`Dense-only`, `Sparse BM25-only`, `Hybrid RRF`, `Hybrid + Reranking`) with zero synthetic mocks.

---
*Verified against official Hugging Face `ai4bharat/MSMARCO-XI` repository.*
