# RAGGoa Dataset Architecture & Remote Hugging Face Integration

**Project:** RAGGoa — Multilingual Voice-Enabled Indic RAG System  
**Dataset:** `ai4bharat/MSMARCO-XI` (Official Hugging Face Repository)  
**Ingestion Architecture:** Remote Dataset Server + Asynchronous Byte-Range Streaming  
**Runtime Architecture:** 100% Local In-Memory Vector + Lexical Index (Zero Remote HF Calls)  

---

## 1. Executive Overview

> "RAGGoa connects to the official AI4Bharat MSMARCO-XI dataset through Hugging Face's remote dataset access layer during ingestion. It builds a reproducible local five-language retrieval index and does not require the complete 55+ GB dataset to be downloaded."

| Layer | Component | Remote Dependency | Purpose |
| :--- | :--- | :---: | :--- |
| **Source Layer** | `HuggingFaceDatasetSource` | Hugging Face Dataset Server / Hub | Ingestion-time split discovery, schema parsing, and byte-range streaming. |
| **Ingestion Pipeline** | `StreamingDatasetIngester` | Local Parquet Byte Stream + Gemini Embeddings | 5-language filtering, 4 chunking strategies, embedding generation, checkpointing. |
| **Storage Layer** | `vector_store.json` | None (Local Disk) | Persistent serialization of 3,381 chunk embeddings and metadata. |
| **Runtime Retrieval** | `VectorDatabase` + `RetrievalService` | **Zero (100% Local)** | Sub-25ms hybrid cosine + BM25 search during user queries. |
| **Generation Harness** | `GenerationService` + `RagPipeline` | Google Gemini API (with local fallback) | Synthesizes grounded answers strictly from retrieved evidence contexts. |

---

## 2. Dataset Source & API Integration

RAGGoa implements the `DatasetSource` abstraction to communicate with official dataset endpoints:

```typescript
export interface DatasetSource {
  getMetadata(): Promise<DatasetMetadata>;
  getSplits(): Promise<DatasetSplit[]>;
  getRows(options: { split: string; language: string; limit?: number; offset?: number }): Promise<DatasetRow[]>;
  iterateRows(options: { split: string; language: string; limit?: number }): AsyncGenerator<DatasetRow, void, unknown>;
}
```

### Official API Endpoints Utilized:
* **Splits Discovery**: `https://datasets-server.huggingface.co/splits?dataset=ai4bharat/MSMARCO-XI`
* **First-Rows / Schema Viewer**: `https://datasets-server.huggingface.co/first-rows?dataset=ai4bharat/MSMARCO-XI&config=default&split=validation`
* **Streaming Byte-Range Reader**: `hyparquet` + Snappy asynchronous slice decompressor over official validation splits (`hinval.parquet`, `kanval.parquet`, `tamval.parquet`, `telval.parquet`).

---

## 3. Five-Language Corpus Balancing

RAGGoa strictly isolates 5 target languages and rejects non-target scripts (such as Bengali):

| Language | ISO Code | Source Column / File | Streamed Queries | Streamed Passages | Active Chunks |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **English** | `en` | `English_passages` & `Eng_Query` | 10 | 100 | 674 |
| **Hindi** | `hi` | `hi/hinval.parquet` (`hin_Deva`) | 10 | 100 | 662 |
| **Kannada** | `kn` | `kn/kanval.parquet` (`kan_Knda`) | 10 | 100 | 671 |
| **Tamil** | `ta` | `ta/tamval.parquet` (`tam_Taml`) | 10 | 100 | 679 |
| **Telugu** | `te` | `te/telval.parquet` (`tel_Telu`) | 10 | 100 | 695 |
| **Total** | **5 Langs** | `ai4bharat/MSMARCO-XI` | **50** | **500** | **3,381** |

---

## 4. Multi-Strategy Chunking & Provenance Metadata

Every indexed chunk contains complete provenance metadata to enable verifiable citations and eliminate hallucinations:

```json
{
  "id": "msmarco-xi-ta-1102432-p1_sentence_0",
  "text": "ஒரு நிறுவனம் என்பது சட்டத்தில் அங்கீகரிக்கப்பட்ட ஒரு தனி அமைப்பாக செயல்பட அங்கீகரிக்கப்பட்ட ஒரு நிறுவனம் அல்லது மக்கள் குழுவாகும்.",
  "metadata": {
    "datasetName": "ai4bharat/MSMARCO-XI",
    "source": "Hugging Face Dataset Server",
    "split": "validation",
    "language": "ta",
    "queryId": 1102432,
    "passageId": "msmarco-xi-ta-1102432-p1",
    "docId": "doc-ta-1102432-1",
    "isSelected": true,
    "strategy": "sentence"
  }
}
```

---

## 5. Resumable Checkpointing & Fault Tolerance

Streaming ingestion state is persisted to `backend/data/msmarco-xi/checkpoints/checkpoint_latest.json`.

If ingestion is interrupted due to network fluctuations or API rate limits:
1. The ingestion engine reads `checkpoint_latest.json`.
2. Computes the SHA-256 hash of the configuration.
3. Resumes from the last processed position without corrupting or duplicating vectors.

---

## 6. Runtime Zero-Dependency Invariant

> **Critical Performance & Reliability Guarantee**:  
> Normal user queries (`POST /api/query`, `POST /api/voice-query`) do **NOT** make outbound HTTP requests to Hugging Face.  
> Runtime retrieval queries the in-memory cosine dot-product index and local BM25 token index, delivering sub-25ms retrieval latency.
