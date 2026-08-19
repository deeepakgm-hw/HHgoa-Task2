# MSMARCO-XI Dataset Audit Report
**Project:** RAGGoa — Voice-Enabled Indic RAG (Hacker House Goa 2026 Task #2)  
**Audit Date:** August 16, 2026  
**Auditor:** Antigravity Autonomous Agent

---

## 1. Executive Summary

| Audit Item | Current State / Finding |
| :--- | :--- |
| **Full Dataset Present Locally?** | **NO** — No raw or full MSMARCO-XI files exist in the repository or local disk. |
| **Dataset Source Currently Used** | **Local Offline Seed Split** (`localFallbackDataset` in `backend/src/ingest.ts`) |
| **Current Dataset Mode** | `local_fallback` (Development / Seed Evaluation) |
| **Total Query Count** | 5 unique queries |
| **Total Passage Count** | 12 passages (5 relevant, 7 non-relevant) |
| **Relevance Judgments** | 5 binary positive judgments (`is_selected: 1`) |
| **Current Vector Store Index** | 36 chunks (12 FixedSize + 12 SentenceAware + 12 Semantic) generated strictly from seed data |
| **Current Embeddings Cache** | 26 cached vectors (3072 dimensions) generated strictly from seed text |
| **Dataset Language & Subset** | Hindi (`hin_Deva`, code: `hi`), Source: English (`eng_Latn`) |
| **Provenance & Fidelity** | Matches ai4bharat/MSMARCO-XI JSON schema structure, but contains only 5 hand-curated seed samples |

---

## 2. File Inventory & Audit Metrics

### Local Files Containing or Derived from Dataset:
1. **`backend/src/ingest.ts`** (Lines 21–112)
   - **Content:** Hardcoded TypeScript array `localFallbackDataset: MSMARCOXIEntry[]`.
   - **Size:** 19,314 bytes (entire file).
   - **Records:** 5 entries.
2. **`backend/data/vector_store.json`**
   - **Size:** 2,244,377 bytes (2.14 MB).
   - **Total Indexed Items:** 36 chunk objects with 3072-dimensional embedding vectors.
   - **Passages Represented:** 12 unique passage IDs (`msmarco-xi-doc-0-p0` through `msmarco-xi-doc-4-p1`).
   - **Positive Relevance Chunks:** 15 chunks (5 positive passages × 3 chunking strategies).
   - **NaN / Infinity Values:** None (0).
   - **Source:** Generated strictly from `localFallbackDataset`.
3. **`backend/data/embeddings_cache.json`**
   - **Size:** 1,419,448 bytes (1.35 MB).
   - **Cache Keys Count:** 26 unique SHA-256 hashes.
   - **Vector Dimensions:** 3072 float elements per entry.
   - **Source:** Generated strictly from seed text passages and evaluation queries.
4. **`backend/data/ingestion_report.json`**
   - **Size:** 790 bytes.
   - **Source Recorded:** `local_fallback`.
   - **`isRemoteIngested`:** `false`.
   - **`fallbackUsed`:** `true`.
5. **`backend/data/benchmark_queries.json`**
   - **Size:** 953 bytes.
   - **Queries:** 8 benchmark queries (5 in-domain seed queries + 2 out-of-domain + 1 empty query).
6. **`backend/data/benchmark_report.json`**
   - **Size:** 13,750 bytes.

---

## 3. Seed Dataset Content Breakdown

The 5 queries and their passages in `localFallbackDataset`:
1. `ताजमहल कहाँ स्थित है?` (Doc 0 — 3 passages: 1 selected Taj Mahal, 1 Agra Fort, 1 New Delhi)
2. `भारत की राजधानी क्या है?` (Doc 1 — 3 passages: 1 selected New Delhi, 1 Mumbai, 1 Kolkata)
3. `सूर्य ग्रहण कब और क्यों होता है?` (Doc 2 — 2 passages: 1 selected Solar Eclipse, 1 Lunar Eclipse)
4. `प्रकाश संश्लेषण प्रक्रिया क्या है?` (Doc 3 — 2 passages: 1 selected Photosynthesis, 1 Cellular Respiration)
5. `कंप्यूटर का आविष्कार किसने किया?` (Doc 4 — 2 passages: 1 selected Charles Babbage, 1 Alan Turing)

---

## 4. Missing Pieces & Next Actions

- The official `ai4bharat/MSMARCO-XI` dataset is not yet present on local disk.
- In Phase 2, we will attempt to download the real `ai4bharat/MSMARCO-XI` dataset using official Hugging Face dataset download methods (Hugging Face Datasets API, Parquet files, Hugging Face Hub git/lfs/file endpoints).
- All downloads will be stored in `backend/data/msmarco-xi/raw/` and validated before ingestion.
- The existing working seed index will be backed up (`backend/data/vector_store.seed.backup.json`) to guarantee 0% risk of application regression.
