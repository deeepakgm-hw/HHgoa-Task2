const fs = require('fs');
const path = require('path');
const { VectorDatabase } = require('../dist/services/vectorDb');
const { RetrievalService } = require('../dist/services/retrieval');
const { EmbeddingService } = require('../dist/services/embeddings');

async function runAblationBenchmarks() {
  console.log('================================================================================');
  console.log('COMPREHENSIVE RETRIEVAL ABLATION BENCHMARK (84,661 CHUNKS, 1,740 CLUSTERS)');
  console.log('================================================================================\n');

  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const vectorDb = new VectorDatabase();
  console.log("1. Loading vector store from disk...");
  const t0 = Date.now();
  await vectorDb.loadFromFileAsync(vsPath);
  console.log(`✓ Loaded ${vectorDb.size().toLocaleString()} chunks into in-memory store in ${((Date.now() - t0)/1000).toFixed(2)}s.\n`);

  const realEmbedService = new EmbeddingService();
  const mockEmbedService = new EmbeddingService(undefined, undefined, true);
  const retrievalService = new RetrievalService(vectorDb);

  const chunks = vectorDb.getAllChunks();

  // Extract all distinct queries from chunks with isSelected: true
  const queryMap = new Map();
  for (const c of chunks) {
    const q = c.metadata?.originalQuery;
    const isSelected = c.metadata?.isSelected;
    const qId = c.metadata?.queryId;
    const lang = c.metadata?.language || 'en';

    if (q && isSelected && !queryMap.has(q)) {
      queryMap.set(q, { query: q, expectedQueryId: qId, language: lang });
    }
  }

  const queries = Array.from(queryMap.values());
  const n = queries.length;
  console.log(`2. Extracted ${n} unique ground-truth query-passage clusters.\n`);

  // Helper evaluator
  async function evaluateMode(name, retrieveFn) {
    console.log(`--- Running Evaluation: ${name} ---`);
    let top1 = 0, top3 = 0, top5 = 0, top10 = 0;
    const latencies = [];
    const startAll = Date.now();

    for (let i = 0; i < n; i++) {
      const item = queries[i];
      const tStart = process.hrtime.bigint();
      const results = await retrieveFn(item);
      const tEnd = process.hrtime.bigint();
      latencies.push(Number(tEnd - tStart) / 1e6);

      const retrievedIds = results.map(r => r.chunk ? r.chunk.id : r.id);
      if (retrievedIds.slice(0, 1).some(id => id.includes(item.expectedQueryId))) top1++;
      if (retrievedIds.slice(0, 3).some(id => id.includes(item.expectedQueryId))) top3++;
      if (retrievedIds.slice(0, 5).some(id => id.includes(item.expectedQueryId))) top5++;
      if (retrievedIds.slice(0, 10).some(id => id.includes(item.expectedQueryId))) top10++;
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(n * 0.5)].toFixed(2);
    const p70 = latencies[Math.floor(n * 0.7)].toFixed(2);
    const p95 = latencies[Math.floor(n * 0.95)].toFixed(2);

    const r1 = ((top1 / n) * 100).toFixed(1);
    const r3 = ((top3 / n) * 100).toFixed(1);
    const r5 = ((top5 / n) * 100).toFixed(1);
    const r10 = ((top10 / n) * 100).toFixed(1);

    console.log(`  ✓ Recall@1:  ${r1}%`);
    console.log(`  ✓ Recall@3:  ${r3}%`);
    console.log(`  ✓ Recall@5:  ${r5}%`);
    console.log(`  ✓ Recall@10: ${r10}%`);
    console.log(`  ✓ Latency:   P50=${p50}ms, P70=${p70}ms, P95=${p95}ms (Total: ${((Date.now() - startAll)/1000).toFixed(1)}s)\n`);

    return { name, r1, r3, r5, r10, p50, p70, p95 };
  }

  // Pre-compute real query embeddings for consistency & speed
  console.log("3. Pre-computing query embeddings (isQuery: true)...");
  const queryTexts = queries.map(q => q.query);
  const realQueryEmbeddings = await realEmbedService.embedBatch(queryTexts, true);
  const mockQueryEmbeddings = queryTexts.map(t => mockEmbedService.generateMockEmbedding(t));
  console.log("✓ Pre-computed all query vectors.\n");

  const summary = [];

  // Mode A: MOCK HASH + HYBRID (Re-run the exact mock hash baseline)
  summary.push(await evaluateMode("1. Mock Hash Baseline (Random Vectors + BM25)", async (item) => {
    const idx = queries.indexOf(item);
    const mockEmb = mockQueryEmbeddings[idx];
    return await retrievalService.retrieve(item.query, mockEmb, { topK: 10, strategy: 'semantic', language: item.language });
  }));

  // Mode B: REAL E5 VECTOR-ONLY (Pure Neural HNSW search, zero lexical BM25)
  summary.push(await evaluateMode("2. Real E5 Vector-Only (Neural HNSW, Zero BM25)", async (item) => {
    const idx = queries.indexOf(item);
    const realEmb = realQueryEmbeddings[idx];
    return vectorDb.search(realEmb, 10, 'semantic', item.language);
  }));

  // Mode C: BM25-ONLY (Pure Lexical BM25 search, zero vector contribution)
  summary.push(await evaluateMode("3. BM25-Only (Pure Lexical Token Overlap, Zero Vectors)", async (item) => {
    const queryTerms = retrievalService.extractContentTerms(item.query);
    const langChunks = item.language ? vectorDb.getChunksByLanguage(item.language) : vectorDb.getAllChunks();
    const scored = [];
    for (const chunk of langChunks) {
      const lex = retrievalService.getLexicalScore(item.query, chunk.text);
      if (lex.score > 0) {
        scored.push({ chunk, score: lex.score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10);
  }));

  // Mode D: REAL E5 + BM25 HYBRID COMBINED (Production Hybrid System)
  summary.push(await evaluateMode("4. Real E5 + BM25 Hybrid (Production Fusion)", async (item) => {
    const idx = queries.indexOf(item);
    const realEmb = realQueryEmbeddings[idx];
    return await retrievalService.retrieve(item.query, realEmb, { topK: 10, strategy: 'semantic', language: item.language });
  }));

  // Final Comparison Table
  console.log('================================================================================');
  console.log('FINAL ABLATION SUMMARY TABLE (1,740 CLUSTERS, 84,661 CHUNKS)');
  console.log('================================================================================');
  console.table(summary.map(s => ({
    'Pipeline Configuration': s.name,
    'Recall@1': `${s.r1}%`,
    'Recall@3': `${s.r3}%`,
    'Recall@5': `${s.r5}%`,
    'Recall@10': `${s.r10}%`,
    'P50 Latency': `${s.p50} ms`,
    'P70 Latency': `${s.p70} ms`
  })));
  console.log('================================================================================\n');
}

runAblationBenchmarks().catch(console.error);
