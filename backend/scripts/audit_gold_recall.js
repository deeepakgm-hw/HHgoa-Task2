const fs = require('fs');
const path = require('path');
const { VectorDatabase } = require('../dist/services/vectorDb');
const { RetrievalService } = require('../dist/services/retrieval');
const { EmbeddingService } = require('../dist/services/embeddings');

async function evaluateStrictGoldRecall() {
  console.log("Loading vector store for strict gold passage recall evaluation...");
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const vectorDb = new VectorDatabase();
  await vectorDb.loadFromFileAsync(vsPath);

  const realEmbedService = new EmbeddingService();
  const retrievalService = new RetrievalService(vectorDb);
  const chunks = vectorDb.getAllChunks();

  // Extract gold queries with their exact gold passage chunks
  const goldMap = new Map();
  for (const c of chunks) {
    const q = c.metadata?.originalQuery;
    const isSelected = c.metadata?.isSelected;
    const qId = c.metadata?.queryId;
    const pIdx = c.metadata?.passageIdx;
    const lang = c.metadata?.language || 'en';

    if (q && isSelected === true && !goldMap.has(q)) {
      goldMap.set(q, {
        query: q,
        expectedQueryId: qId,
        goldPassageId: `${qId}-p${pIdx}`,
        goldPassageIdx: pIdx,
        language: lang
      });
    }
  }

  const testSample = Array.from(goldMap.values()).slice(0, 100); // 100 diverse queries
  console.log(`Evaluating ${testSample.length} queries on Strict Gold Passage Recall vs Cluster Recall...`);

  let clusterTop1 = 0, clusterTop3 = 0, clusterTop5 = 0, clusterTop10 = 0;
  let strictGoldTop1 = 0, strictGoldTop3 = 0, strictGoldTop5 = 0, strictGoldTop10 = 0;

  // Pre-embed queries
  const queryTexts = testSample.map(t => t.query);
  const qEmbeddings = await realEmbedService.embedBatch(queryTexts, true);

  for (let i = 0; i < testSample.length; i++) {
    const item = testSample[i];
    const emb = qEmbeddings[i];
    const results = await retrievalService.retrieve(item.query, emb, { topK: 10, strategy: 'semantic', language: item.language });

    const retrievedChunks = results.map(r => r.chunk);

    // 1. Cluster Recall (Any passage from the query cluster)
    const clusterHit1 = retrievedChunks.slice(0, 1).some(c => c && c.metadata?.queryId === item.expectedQueryId);
    const clusterHit3 = retrievedChunks.slice(0, 3).some(c => c && c.metadata?.queryId === item.expectedQueryId);
    const clusterHit5 = retrievedChunks.slice(0, 5).some(c => c && c.metadata?.queryId === item.expectedQueryId);
    const clusterHit10 = retrievedChunks.slice(0, 10).some(c => c && c.metadata?.queryId === item.expectedQueryId);

    if (clusterHit1) clusterTop1++;
    if (clusterHit3) clusterTop3++;
    if (clusterHit5) clusterTop5++;
    if (clusterHit10) clusterTop10++;

    // 2. Strict Gold Recall (Specifically the is_selected == 1 passage)
    const goldHit1 = retrievedChunks.slice(0, 1).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true);
    const goldHit3 = retrievedChunks.slice(0, 3).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true);
    const goldHit5 = retrievedChunks.slice(0, 5).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true);
    const goldHit10 = retrievedChunks.slice(0, 10).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true);

    if (goldHit1) strictGoldTop1++;
    if (goldHit3) strictGoldTop3++;
    if (goldHit5) strictGoldTop5++;
    if (goldHit10) strictGoldTop10++;
  }

  const n = testSample.length;
  console.log("\n===============================================================================");
  console.log("RECALL EVALUATION AUDIT RESULTS (100 SAMPLE QUERIES)");
  console.log("===============================================================================");
  console.log(`• Cluster Recall@1:     ${((clusterTop1/n)*100).toFixed(1)}%`);
  console.log(`• Cluster Recall@3:     ${((clusterTop3/n)*100).toFixed(1)}%`);
  console.log(`• Cluster Recall@10:    ${((clusterTop10/n)*100).toFixed(1)}%`);
  console.log(`-------------------------------------------------------------------------------`);
  console.log(`• Strict Gold Recall@1:  ${((strictGoldTop1/n)*100).toFixed(1)}%`);
  console.log(`• Strict Gold Recall@3:  ${((strictGoldTop3/n)*100).toFixed(1)}%`);
  console.log(`• Strict Gold Recall@10: ${((strictGoldTop10/n)*100).toFixed(1)}%`);
  console.log("===============================================================================\n");
}

evaluateStrictGoldRecall().catch(console.error);
