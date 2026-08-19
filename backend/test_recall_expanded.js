const fs = require('fs');
const path = require('path');

async function testRecallAndLatency() {
  console.log('================================================================================');
  console.log('BENCHMARKING EXPANDED 11,436-CHUNK VECTOR STORE');
  console.log('================================================================================\n');

  // Load vector store
  const vs = JSON.parse(fs.readFileSync('./data/vector_store.json', 'utf8'));
  console.log(`Loaded ${vs.length} chunks from vector_store.json.`);

  // Collect test queries that have isSelected: true
  const testQueries = [];
  const seenQueries = new Set();

  for (const item of vs) {
    const q = item.chunk.metadata?.originalQuery;
    const isSelected = item.chunk.metadata?.isSelected;
    const queryId = item.chunk.metadata?.queryId;
    const lang = item.chunk.metadata?.language || 'en';

    if (q && isSelected && !seenQueries.has(q) && testQueries.length < 100) {
      seenQueries.add(q);
      testQueries.push({
        query: q,
        expectedQueryId: queryId,
        language: lang
      });
    }
  }

  console.log(`Evaluating Recall@K across ${testQueries.length} verified queries...\n`);

  let top1Hits = 0;
  let top3Hits = 0;
  let top5Hits = 0;
  let top10Hits = 0;
  const retrievalLatencies = [];

  for (const t of testQueries) {
    const start = Date.now();
    const res = await fetch('http://localhost:5000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: t.query,
        languageCode: t.language,
        strategy: 'semantic',
        rerank: true
      })
    });
    const lat = Date.now() - start;
    retrievalLatencies.push(lat);

    const data = await res.json();
    const retrievedIds = (data.sources || []).map(s => s.id);

    // Check if expected document/queryId was retrieved
    const matchedTop1 = retrievedIds.slice(0, 1).some(id => id.includes(t.expectedQueryId));
    const matchedTop3 = retrievedIds.slice(0, 3).some(id => id.includes(t.expectedQueryId));
    const matchedTop5 = retrievedIds.slice(0, 5).some(id => id.includes(t.expectedQueryId));
    const matchedTop10 = retrievedIds.slice(0, 10).some(id => id.includes(t.expectedQueryId));

    if (matchedTop1) top1Hits++;
    if (matchedTop3) top3Hits++;
    if (matchedTop5) top5Hits++;
    if (matchedTop10) top10Hits++;
  }

  const n = testQueries.length;
  const r1 = ((top1Hits / n) * 100).toFixed(1);
  const r3 = ((top3Hits / n) * 100).toFixed(1);
  const r5 = ((top5Hits / n) * 100).toFixed(1);
  const r10 = ((top10Hits / n) * 100).toFixed(1);

  retrievalLatencies.sort((a, b) => a - b);
  const p50 = retrievalLatencies[Math.floor(retrievalLatencies.length * 0.5)];
  const p70 = retrievalLatencies[Math.floor(retrievalLatencies.length * 0.7)];
  const p100 = retrievalLatencies[retrievalLatencies.length - 1];

  console.log('================================================================================');
  console.log('RECALL@K COMPARISON (BEFORE vs AFTER EXPANSION)');
  console.log('================================================================================');
  console.log(`• Recall@1:  ${r1}%  (Baseline on 3.3k chunks: 52.0%)`);
  console.log(`• Recall@3:  ${r3}%  (Baseline on 3.3k chunks: 71.0%)`);
  console.log(`• Recall@5:  ${r5}%  (Baseline on 3.3k chunks: 78.0%)`);
  console.log(`• Recall@10: ${r10}%  (Baseline on 3.3k chunks: 84.0%)`);
  console.log('================================================================================\n');

  console.log('================================================================================');
  console.log('LATENCY ON EXPANDED 11,436-CHUNK INDEX');
  console.log('================================================================================');
  console.log(`• End-to-End P50: ${p50} ms`);
  console.log(`• End-to-End P70: ${p70} ms`);
  console.log(`• End-to-End P100: ${p100} ms`);
  console.log('================================================================================\n');
}

testRecallAndLatency().catch(console.error);
