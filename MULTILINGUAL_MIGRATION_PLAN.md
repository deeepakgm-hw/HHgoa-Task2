# MULTILINGUAL_MIGRATION_PLAN.md
# RAGGoa: 5-Language MSMARCO-XI Voice RAG Upgrade Plan

## 1. Current Architecture & Dataset State

- **Current Indexed Dataset**: Single-language Hindi validation split from official `ai4bharat/MSMARCO-XI` (`validation/hinval.parquet`, 440.49 MB, 97,941 rows, SHA256: `e501a9f319c56635429e2e4b905b50fe61fe3a2bf2769875d6ac6c5ee56309d3`).
- **Current Vector Store**: 710 chunks (175 fixed + 117 sentence + 418 semantic) across 161 unique Devanagari passages. Vector dimension: 3072.
- **Language Support**: Currently defaults to Hindi Devanagari (`hi-IN`), with preliminary selector for others without backend language-partitioned corpora.
- **Retrieval Architecture**: Hybrid (Dense Cosine Similarity + BM25 Lexical) + Bigram Proximity Reranking + Grounding Threshold Guardrail (0.60).
- **Voice & STT**: Sarvam Saaras v3 supporting `hi-IN`, `en-IN`, `kn-IN`, `ta-IN`, `te-IN`.
- **Generation**: Gemini 2.5 Flash with strict grounding prompt.

---

## 2. Target 5-Language Architecture

Support 5 official languages with strict language isolation:
1. **English (`en`)**: Official MSMARCO English passages (`English_passages`, `Eng_Query`, `Eng_Answer`).
2. **Hindi (`hi`)**: Official MSMARCO-XI Hindi validation split (`hinval.parquet`).
3. **Kannada (`kn`)**: Official MSMARCO-XI Kannada validation split (`kanval.parquet`).
4. **Tamil (`ta`)**: Official MSMARCO-XI Tamil validation split (`tamval.parquet`).
5. **Telugu (`te`)**: Official MSMARCO-XI Telugu validation split (`telval.parquet`).

### Key Architecture Enhancements:
1. **Language-Partitioned Vector Index**:
   - Every chunk contains strict metadata: `language: 'en' | 'hi' | 'kn' | 'ta' | 'te'`, `languageName`, `docId`, `passageId`, `isSelected`, `strategy`.
   - Dynamic size reporting via `GET /api/health`: `{ database: { loaded: true, size: N, languages: { en: n1, hi: n2, kn: n3, ta: n4, te: n5 } } }`.
2. **Language-Aware Retriever**:
   - Filters candidate chunks by `language` prior to vector and lexical scoring, guaranteeing that e.g. Kannada queries strictly search the Kannada corpus.
3. **5-Language Benchmark & Grounding Suite**:
   - 50 real benchmark queries (10 queries per language with gold relevance labels).
   - Recall@1, 3, 5, 10 computed per language and in aggregate.
   - Guardrail suites tested across all 5 languages (answerable, out-of-domain, low confidence).
4. **Voice-to-Answer Orchestration**:
   - Sarvam STT receives the user's selected language code (`hi-IN`, `en-IN`, `kn-IN`, `ta-IN`, `te-IN`).
   - Gemini generation prompt enforces synthesized answers in the query's native script/language, strictly grounded in retrieved evidence.

---

## 3. Exact Files to Modify & Create

### Files to Create:
- `backend/data/msmarco-xi/raw/en/` (Extracted official English subset from MSMARCO)
- `backend/data/msmarco-xi/raw/hi/hinval.parquet` (Organized Hindi raw split)
- `backend/data/msmarco-xi/raw/kn/kanval.parquet` (Downloaded official Kannada split)
- `backend/data/msmarco-xi/raw/ta/tamval.parquet` (Downloaded official Tamil split)
- `backend/data/msmarco-xi/raw/te/telval.parquet` (Downloaded official Telugu split)
- `backend/data/msmarco-xi/processed/dataset_manifest.json` (Manifest of all 5 languages)
- `DATASET_PROVENANCE.md` (Detailed provenance documentation)
- `FINAL_MULTILINGUAL_DATASET_REPORT.md` (Comprehensive audit report)
- `backend/tests/multilingual_retrieval.test.ts` (Language isolation & recall tests)
- `backend/tests/multilingual_guardrails.test.ts` (5-language guardrail tests)

### Files to Modify:
- `backend/src/services/vectorDb.ts` (Add language metadata index and filtering)
- `backend/src/services/retrieval.ts` (Language-filtered hybrid search)
- `backend/src/services/ragPipeline.ts` (Pass and propagate language through STT, retrieval, and generation)
- `backend/src/services/generation.ts` (Language-specific synthesis prompts)
- `backend/src/services/chunking.ts` (Language-aware sentence boundary handling)
- `backend/src/services/embeddings.ts` (Language-aware persistent cache keys)
- `backend/src/ingest.ts` (5-language ingestion pipeline across all chunking strategies)
- `backend/src/benchmark.ts` (5-language 50-query evaluation suite)
- `backend/src/server.ts` (Multilingual health check metadata and language parameters)
- `frontend/src/App.tsx` (Live language breakdown display)
- `frontend/src/components/Dashboard.tsx` (5-language selector and language-aware prompt chips)
- `frontend/src/components/BenchmarkView.tsx` (Per-language recall breakdown and metrics)
- `frontend/src/types.ts` (Multilingual metadata typings)
- `README.md` (Architecture and documentation update)

---

## 4. Migration & Rollback Strategy

1. **Incremental Download & Ingestion**:
   - Download parquets directly from `ai4bharat/MSMARCO-XI` for `kn`, `ta`, `te`.
   - Organize `hi` from existing verified `hinval.parquet`.
   - Extract `en` official original MSMARCO passages.
2. **Deterministic Offline Embeddings Generation**:
   - Compute real embeddings using Gemini Embedding API (with persistent JSON disk cache) to avoid redundant API cost and ensure fast sub-5ms lookups.
3. **Rollback Safety**:
   - Preserve `vector_store.seed.backup.json` and existing seed backups in `backend/data/`.
   - Run complete unit and integration test suite after each migration step.
