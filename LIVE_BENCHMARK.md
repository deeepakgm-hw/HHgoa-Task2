# Live Benchmark Report - RAGGoa 🌴

*   **Date:** 2026-08-15
*   **Environment:** Live API connections (Google Gemini, Sarvam)
*   **Embedding Model:** `gemini-embedding-2` (3072 Dimensions)
*   **Generation Model:** `gemini-3.5-flash`
*   **STT Model:** Sarvam `saaras:v3` API (Web Dashboard manual capture)
*   **Total Requests Run:** 8

---

## 🛡️ Request Status Classification Summary

To ensure metrics are not contaminated, latency statistics are compiled **only** over successfully completed requests (`SUCCESS` or valid factual `REFUSED`). Rate-limited, failed, or timed-out calls are classified separately:

| Status Category | Count | Description |
| :--- | :---: | :--- |
| **SUCCESS** | 5 | Answer generated successfully and passed factual grounding guardrails. |
| **REFUSED** | 1 | Guardrails intercepted query or insufficient retrieved context relevance. |
| **RATE_LIMITED** | 1 | Caught `429 RESOURCE_EXHAUSTED` and marked without mock contamination. |
| **TIMED_OUT** | 0 | Request exceeded timeout boundary limits. |
| **FAILED** | 1 | Blocked at validation boundary (e.g. empty or too short input query). |

---

## 📊 Reconciled Stage-Level Latency Percentiles

Timings are collected using high-resolution monotonic timers (`performance.now()`), guaranteeing that the total reported latency satisfies:  
$$\text{Total Latency} \ge \sum \text{Sequential Stage Latencies}$$

| Pipeline Stage | P50 (ms) | P70 (ms) | P100 (ms) | Execution |
| :--- | :---: | :---: | :---: | :---: |
| **STT (Voice)** | 0.00 ms | 0.00 ms | 0.00 ms | Web Browser (Manual) |
| **Embedding** | 0.05 ms | 0.08 ms | 0.98 ms | Live (Memory Cached) |
| **Retrieval** | 0.35 ms | 0.48. ms | 4.21 ms | Local RAG |
| **Reranking** | 0.06 ms | 0.17 ms | 0.69 ms | Local RAG |
| **Generation** | 2963.88 ms | 4081.33 ms | 4823.68 ms | Live (Gemini API) |
| **TOTAL PIPELINE** | **2964.40 ms** | **4081.79 ms** | **4824.17 ms** | **LIVE END-TO-END** |

> [!NOTE]
> **Latency Invariant Audit (<200ms Target):**
> *   **Local RAG target (<200ms):** **ACHIEVED** (measures **~0.46ms P50** to **5.88ms P100**).
> *   **Full Voice-to-Answer target (<200ms):** **NOT ACHIEVED** (measures **~2.96 seconds P50**). The remote Gemini LLM generation network call is the dominant computational bottleneck (~2.9 to 4.8 seconds).

---

## 🎯 Retrieval Quality (Recall @ K)

*   **Full Dataset Source:** `ai4bharat/MSMARCO-XI`
*   **Current Evaluation Data:** `Local offline seed/development evaluation split` (5 queries / 12 passages)
*   *Note: Recall@K is measured on the current development evaluation split. Full-dataset evaluation requires successful ingestion of the complete benchmark split.*

| Method | Recall@1 | Recall@3 | Recall@5 | Recall@10 | Evaluation Split |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Vector-Only** | 20.0% | 20.0% | 20.0% | 20.0% | Development Split |
| **Lexical-Only** | 60.0% | 60.0% | 60.0% | 60.0% | Development Split |
| **Hybrid (Vector + Lexical)** | 60.0% | 60.0% | 60.0% | 60.0% | Development Split |
| **Hybrid + Proximity Reranking** | 60.0% | 60.0% | 60.0% | 60.0% | Development Split |

---

## ⚡ Perceived Latency Streaming Optimization

We have implemented an optional streaming endpoint `/api/query-stream` returning Server-Sent Events (SSE). 
*   **Time-to-First-Token (TTFT):** Measures the elapsed duration from request start until the first text chunk is yielded by the model. 
*   *Streaming does not reduce the actual model computation duration, but it drastically improves perceived latency by printing characters incrementally on-screen.*
