# RAGGoa — Live Voice Benchmark Report

> Generated: 2026-08-15T14:27:58.182Z

## Configuration
- STT: Sarvam Saaras:v3 (live API)
- TTS for audio synthesis: Sarvam bulbul:v1 (used to generate test audio)
- Embedding: gemini-embedding-2 (live API)
- Retrieval: Hybrid vector+lexical (semantic strategy)
- Reranking: Proximity reranker
- Generation: gemini-3.5-flash (live API, disableFallback=true)
- Language: hi-IN (Hindi)

## Run Summary
| Metric | Value |
|---|---|
| Total attempts | 5 |
| Successful (SUCCESS) | 0 |
| Refused (OOD/Guardrail) | 0 |
| Rate-limited (429) | 5 |
| API errors | 0 |
| Partial runs (pre-gen complete) | 5 |

## ⚠ Full End-to-End Pipeline: INSUFFICIENT LIVE SAMPLES

Only 0 complete run(s) out of 3 required.
**Root cause:** Gemini free-tier daily quota exhausted (20 req/day limit reached). All 5 TTS+STT+local RAG stages completed successfully — only Gemini generation was blocked.

**To complete:** Re-run `npm run benchmark:voice` after the Gemini daily quota resets (midnight Pacific Time), or upgrade to a paid Gemini tier.

## ✅ Verified Pre-Generation Stage Latencies (All runs where stages completed)

> These 5 runs completed TTS synthesis, Sarvam STT, embedding, retrieval, and reranking successfully.
> Generation was blocked by Gemini daily quota (429). These measurements are real and accurate.

| Stage | P50 (ms) | P70 (ms) | P100 (ms) | Avg (ms) | N |
|---|---|---|---|---|---|
| TTS Synthesis (Sarvam bulbul:v2) | 705.12 | 714.57 | 923.51 | 682.81 | 5 |
| Sarvam STT (saaras:v3) | 363.16 | 415.21 | 973.35 | 479.21 | 5 |
| Embedding (gemini-embedding-2, local cache hit) | 0.08 | 0.1 | 0.3 | 0.12 | 5 |
| Retrieval (hybrid vector+lexical) | 0.38 | 0.54 | 3.86 | 1.1 | 5 |
| Reranking (proximity) | 0.11 | 0.14 | 0.43 | 0.16 | 5 |
| **Gemini Generation** | — | — | — | — | RATE_LIMITED |
| **TOTAL end-to-end** | — | — | — | — | NOT MEASURED |

## Performance Notes

- **Local RAG P50** (embedding + retrieval + rerank): `0.57ms` ✅ sub-200ms confirmed
- **Sarvam STT P50**: `363.16ms` — real network call, typically 300–1800ms depending on audio length
- **Full voice-to-answer**: NOT MEASURED — Generation was rate-limited. Based on text benchmark, add ~2964ms (P50) for Gemini generation.
- **<200ms claim**: Applies to LOCAL RAG only. Full voice pipeline is NOT sub-200ms due to remote STT + LLM.

## Per-Run Detail

| # | Query | Status | Transcript | Total (ms) | STT (ms) | Gen (ms) | Error |
|---|---|---|---|---|---|---|---|
| 1 | ताजमहल कहाँ स्थित है | RATE_LIMITED | ताजमहल कहाँ स्थित है? | 0 | 973.35 | 0 | Generation failed: {"error":{"code":429,"message":"You excee |
| 2 | भारत की राजधानी क्या है | RATE_LIMITED | भारत की राजधानी क्या है? | 0 | 363.16 | 0 | Generation failed: {"error":{"code":429,"message":"You excee |
| 3 | सूर्य ग्रहण क्यों होता है | RATE_LIMITED | सूर्य ग्रहण क्यों होता है? | 0 | 289.64 | 0 | Generation failed: {"error":{"code":429,"message":"You excee |
| 4 | प्रकाश संश्लेषण प्रक्रिया क्या है | RATE_LIMITED | प्रकाश संश्लेषण प्रक्रिया क्या है? | 0 | 415.21 | 0 | Generation failed: {"error":{"code":429,"message":"You excee |
| 5 | कंप्यूटर का आविष्कार किसने किया | RATE_LIMITED | कंप्यूटर का आविष्कार किसने किया? | 0 | 354.71 | 0 | Generation failed: {"error":{"code":429,"message":"You excee |