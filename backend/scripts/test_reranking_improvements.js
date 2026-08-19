const fs = require('fs');
const path = require('path');
const { VectorDatabase } = require('../dist/services/vectorDb');
const { RetrievalService } = require('../dist/services/retrieval');
const { EmbeddingService } = require('../dist/services/embeddings');

async function testReranker() {
  console.log("Loading vector store for reranking improvement experiment...");
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const vectorDb = new VectorDatabase();
  await vectorDb.loadFromFileAsync(vsPath);

  const realEmbedService = new EmbeddingService();
  const retrievalService = new RetrievalService(vectorDb);
  const chunks = vectorDb.getAllChunks();

  // Extract gold queries
  const goldMap = new Map();
  for (const c of chunks) {
    const q = c.metadata?.originalQuery;
    const isSelected = c.metadata?.isSelected;
    const qId = c.metadata?.queryId;
    const lang = c.metadata?.language || 'en';

    if (q && isSelected === true && !goldMap.has(q)) {
      goldMap.set(q, {
        query: q,
        expectedQueryId: qId,
        language: lang
      });
    }
  }

  const sampleQueries = Array.from(goldMap.values()).slice(0, 100);
  console.log(`Evaluating ${sampleQueries.length} gold queries...`);

  const queryTexts = sampleQueries.map(t => t.query);
  const qEmbeddings = await realEmbedService.embedBatch(queryTexts, true);

  // Baseline 1: Current standard retrieval (topK = 10, no large candidate pool reranking)
  let baseTop1 = 0, baseTop3 = 0, baseTop10 = 0;
  for (let i = 0; i < sampleQueries.length; i++) {
    const item = sampleQueries[i];
    const emb = qEmbeddings[i];
    const results = await retrievalService.retrieve(item.query, emb, { topK: 10, strategy: 'semantic', language: item.language });
    const cHits = results.map(r => r.chunk);
    if (cHits.slice(0, 1).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true)) baseTop1++;
    if (cHits.slice(0, 3).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true)) baseTop3++;
    if (cHits.slice(0, 10).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true)) baseTop10++;
  }

  // Enhanced Strategy: Fetch top 25 candidates, apply enhanced lexical + length penalty + answer salience boost
  let enhancedTop1 = 0, enhancedTop3 = 0, enhancedTop10 = 0;
  for (let i = 0; i < sampleQueries.length; i++) {
    const item = sampleQueries[i];
    const emb = qEmbeddings[i];
    
    // Fetch 25 candidates from hybrid search
    const candidates = await retrievalService.retrieve(item.query, emb, { topK: 25, strategy: 'semantic', language: item.language });
    
    // Advanced Rerank: Dense alignment + Question-Answer structure detection
    const queryTokens = retrievalService.extractContentTerms(item.query);
    const queryLower = item.query.toLowerCase().trim();

    const reranked = candidates.map(cand => {
      let boost = 0;
      const text = cand.chunk.text;
      const textLower = text.toLowerCase();

      // 1. Exact phrase boost
      if (textLower.includes(queryLower)) {
        boost += 0.20;
      }

      // 2. High term coverage (rewards having all distinct non-stopword query keywords)
      const matched = cand.matchedTerms || [];
      const coverageRatio = matched.length / Math.max(1, queryTokens.length);
      if (coverageRatio >= 0.8) {
        boost += 0.18 * coverageRatio;
      } else {
        boost += 0.08 * coverageRatio;
      }

      // 3. Answer salience: Gold passages in MSMARCO typically define or answer the question in the opening sentence
      const firstSentence = text.split(/[.!?।|]/)[0] || '';
      let firstSentenceMatches = 0;
      for (const token of queryTokens) {
        if (firstSentence.toLowerCase().includes(token.toLowerCase())) {
          firstSentenceMatches++;
        }
      }
      if (queryTokens.length > 0 && firstSentenceMatches / queryTokens.length >= 0.5) {
        boost += 0.15;
      }

      // 4. Passage conciseness bonus (avoids over-lengthy noise passages)
      if (text.length >= 100 && text.length <= 450) {
        boost += 0.05;
      }

      const finalScore = cand.hybridScore + boost;
      return {
        ...cand,
        score: finalScore,
        rerankScore: finalScore
      };
    });

    reranked.sort((a, b) => b.score - a.score);

    const cHits = reranked.map(r => r.chunk);
    if (cHits.slice(0, 1).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true)) enhancedTop1++;
    if (cHits.slice(0, 3).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true)) enhancedTop3++;
    if (cHits.slice(0, 10).some(c => c && c.metadata?.queryId === item.expectedQueryId && c.metadata?.isSelected === true)) enhancedTop10++;
  }

  const n = sampleQueries.length;
  console.log("\n===============================================================================");
  console.log("RERANKING EXPERIMENT RESULTS (STRICT GOLD PASSAGE RECALL)");
  console.log("===============================================================================");
  console.log(`Baseline (Before Reranking Optimization):`);
  console.log(`  • Strict Gold Recall@1:  ${((baseTop1/n)*100).toFixed(1)}%`);
  console.log(`  • Strict Gold Recall@3:  ${((baseTop3/n)*100).toFixed(1)}%`);
  console.log(`  • Strict Gold Recall@10: ${((baseTop10/n)*100).toFixed(1)}%`);
  console.log(`-------------------------------------------------------------------------------`);
  console.log(`Enhanced Reranker (After Answer-Salience & Multi-Feature Re-scoring):`);
  console.log(`  • Strict Gold Recall@1:  ${((enhancedTop1/n)*100).toFixed(1)}%`);
  console.log(`  • Strict Gold Recall@3:  ${((enhancedTop3/n)*100).toFixed(1)}%`);
  console.log(`  • Strict Gold Recall@10: ${((enhancedTop10/n)*100).toFixed(1)}%`);
  console.log("===============================================================================\n");
}

testReranker().catch(console.error);
