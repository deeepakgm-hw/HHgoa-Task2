# FINAL TECHNICAL AUDIT — RAGGoa (Hacker House Goa 2026 Task #2)

**Audit Date**: 2026-08-16  
**Auditor**: Antigravity Technical Verification Agent  
**Audited Artifacts**: Source code (`backend/src/`, `frontend/src/`), vector store index (`backend/data/vector_store.json`), ingestion reports, benchmark logs, and runtime telemetry.

---

## 1. Dataset & Index Provenance

| Property | Actual Inspected Truth | Code / Data Path |
| :--- | :--- | :--- |
| **Dataset Source** | `ai4bharat/MSMARCO-XI` (Hindi Validation Split, `hinval.parquet`) | `backend/data/msmarco-xi/` |
| **Target Language** | Hindi (`hin_Deva`) & English (`eng_Latn`) | `backend/data/vector_store.json` |
| **Total Chunks in Index** | **710 chunks** | `backend/data/vector_store.json` |
| **Unique Documents / Passages** | **161 unique documents** | `backend/data/vector_store.json` |
| **Unique Source Queries** | **5 benchmark evaluation queries** (52 indexed queries) | `backend/data/ingestion_report.json` |
| **Embedding Model** | `gemini-embedding-2` (Google GenAI API) | `backend/src/services/embeddings.ts` |
| **Embedding Dimensions** | **3,072 dimensions** (verified unit L2 normalized, 0 NaN/Inf) | `backend/data/vector_store.json` |
| **Cache Storage** | SHA-256 keyed JSON cache | `backend/data/embeddings_cache.json` |

---

## 2. Chunking Strategies Breakdown

All 3 chunking strategies are implemented in `backend/src/services/chunking.ts` and indexed in the production vector database:

| Strategy | Chunks in Vector Store | Character / Boundary Rules | Implementation Class |
| :--- | :---: | :--- | :--- |
| **Fixed Size** | **175** | 300-char window, 50-char overlap | `FixedSizeChunker` |
| **Sentence Aware** | **117** | Devanagari punctuation boundary (`।`, `.`, `!`, `?`), 400-char max | `SentenceAwareChunker` |
| **Semantic** | **418** | Sentence-level cosine similarity embedding grouping (threshold 0.70) | `SemanticChunker` |
| **Total** | **710** | — | — |

---

## 3. Models & External Services

| Service | Configured Model / Provider | Verification Status | Fallback Policy |
| :--- | :--- | :--- | :--- |
| **Speech-to-Text (STT)** | `Sarvam Saaras v3` (`sarvam-saaras-v3`) | Live API verified | Rejects cleanly on network/quota failure; no silent mock fallback in production. |
| **Embeddings** | `gemini-embedding-2` (3,072d) | Live API verified + Disk Cache | Uses local SHA-256 disk cache for indexed data. |
| **LLM Generation** | `gemini-flash-latest` | Live API verified | Hard 15,000ms timeout. Returns structured error on 429/timeout. |

---

## 4. Pipeline & Retrieval Flow

$$\text{User Audio / Text} \longrightarrow \text{Sarvam STT} \longrightarrow \text{Devanagari Normalization} \longrightarrow \text{Gemini Embedding} \longrightarrow \text{Hybrid Search} \longrightarrow \text{Proximity Reranking} \longrightarrow \text{Confidence Guardrail (0.60)} \longrightarrow \text{Gemini Generation} \longrightarrow \text{Answer + Citations}$$

1. **Input Guardrail**: Rejects empty strings or $<3$ character inputs (HTTP 400 `VALIDATION_ERROR`).
2. **Hybrid Search**: Fuses dense vector cosine similarity ($0.75$) with Devanagari lexical keyword overlap ($0.25$).
3. **Proximity Reranking**: Boosts candidates with exact phrase matches ($+0.15$), bigram proximity ($+0.08$), and token coverage ($+0.05$).
4. **Confidence Guardrail**: Evaluates top reranked candidate score against **$0.60$ threshold**.
   - **Score $\ge 0.60$**: Proceeds to Gemini generation for grounded synthesis.
   - **Score $< 0.60$**: **Halts immediately**. Gemini generation is **SKIPPED** ($0\text{ ms}$). Returns structured refusal in $<15\text{ ms}$.
5. **Grounded Synthesis**: Constrains Gemini strictly to retrieved passages, returning verified citation IDs.

---

## 5. Telemetry & Timing Methodology

- **Timing Source**: `performance.now()` high-resolution monotonic timestamps throughout.
- **Attribution Rule**: $\text{Total Latency} \ge \sum(\text{Sequential Stages})$.
- **Stage Attribution**:
  - `stt`: Sarvam remote call (null for text queries).
  - `normalization`: Devanagari normalization & guardrails ($<1\text{ ms}$).
  - `embedding`: Vector lookup / generation ($<5\text{ ms}$ cached).
  - `retrieval`: Hybrid in-memory search ($<5\text{ ms}$).
  - `rerank`: Lexical n-gram reranking ($<1\text{ ms}$).
  - `generation`: Gemini remote synthesis ($1.5\text{s} - 4.5\text{s}$) or $0\text{ ms}$ when SKIPPED.
- **Local RAG Contribution**: $\approx \frac{\text{Local Latency}}{\text{Total Latency}} \times 100$, dynamically computed.

---

## 6. Discrepancy Reconciliation Summary

1. **429 vs 710 Chunks**:
   - The original subset prototype had 429 chunks across 10 queries.
   - The current production database contains **710 chunks** across 161 unique documents and 5 evaluation queries from `ai4bharat/MSMARCO-XI`.
   - UI and reports must consistently report **710 Chunks**.
2. **Static Percentage / Model Labels**:
   - Hardcoded `<0.1%` and `Gemini 3.5 Flash` replaced with dynamic percentage calculations and `gemini-flash-latest`.
   - Hardcoded `0.35` threshold text in Architecture Diagram aligned with active `0.60` calibrated threshold.
3. **Refusal Path Optimization**:
   - Reranking and confidence gate executed before LLM call. Out-of-domain queries halt before Gemini invocation with `generation: 0 (SKIPPED)`.
