import * as path from 'path';
import { VectorDatabase } from './backend/src/services/vectorDb';
import { RetrievalService } from './backend/src/services/retrieval';
import { GuardrailService } from './backend/src/services/guardrails';
import { EmbeddingService } from './backend/src/services/embeddings';
import { GenerationService } from './backend/src/services/generation';
import { RagPipeline } from './backend/src/services/ragPipeline';

async function auditQuery() {
  console.log('=== AUDITING QUERY: "Who is India Prime Minister?" ===');
  const vectorDbPath = path.join(__dirname, 'backend/data/vector_store.json');
  const vectorDb = new VectorDatabase();
  vectorDb.loadFromFile(vectorDbPath);

  const retrieval = new RetrievalService(vectorDb);
  const guardrails = new GuardrailService();
  const embeddings = new EmbeddingService();
  const generation = new GenerationService(true); // mock or inspect

  const query = "Who is India Prime Minister?";
  
  // 1. Language detection
  const detectedLang = generation.detectLanguage(query);
  console.log('1. Detected Language:', detectedLang);

  // 2. Embeddings
  const queryEmbedding = await embeddings.embed(query);
  console.log('2. Query embedding generated, length:', queryEmbedding.length);

  // 3. Vector DB Search
  const vectorCandidates = vectorDb.search(queryEmbedding, 5, undefined, 'en');
  console.log('3. Top Vector Candidates:');
  vectorCandidates.forEach((c, idx) => {
    console.log(`   [${idx+1}] Score: ${c.score.toFixed(4)} | ID: ${c.chunk.id} | PassageId: ${c.chunk.metadata.passageId} | Text: "${c.chunk.text.substring(0, 100)}..."`);
  });

  // 4. Lexical Search
  const lexicalCandidates = (retrieval as any).bm25Search(query, 5, 'en');
  console.log('4. Top Lexical Candidates:');
  lexicalCandidates.forEach((c: any, idx: number) => {
    console.log(`   [${idx+1}] Score: ${c.score.toFixed(4)} | ID: ${c.chunk.id} | Text: "${c.chunk.text.substring(0, 100)}..."`);
  });

  // 5. Retrieval Hybrid
  const hybridResults = await retrieval.retrieve(query, queryEmbedding, { topK: 5, strategy: 'semantic', language: 'en' });
  console.log('5. Top Hybrid Candidates:');
  hybridResults.forEach((r, idx) => {
    console.log(`   [${idx+1}] Score: ${r.score.toFixed(4)} | ID: ${r.chunk.id} | Strategy: ${r.chunk.metadata.strategy} | Text: "${r.chunk.text.substring(0, 100)}..."`);
  });

  // 6. Reranking
  const reranked = retrieval.rerank(query, hybridResults);
  console.log('6. Reranked Candidates:');
  reranked.forEach((r, idx) => {
    console.log(`   [${idx+1}] Score: ${r.score.toFixed(4)} | ID: ${r.chunk.id} | Text: "${r.chunk.text.substring(0, 100)}..."`);
  });

  // 7. Guardrails: validateRetrieval
  const retrievalValidation = guardrails.validateRetrieval(reranked, 0.08);
  console.log('7. Guardrails validateRetrieval (threshold=0.08):', retrievalValidation);

  // 8. Search across all chunks in vectorDb to see if there is ANY passage mentioning "India" or "Prime Minister"
  console.log('\n--- Checking entire vector DB for "India" or "Prime Minister" ---');
  const allChunks = vectorDb.getAllChunks();
  const indiaChunks = allChunks.filter(c => c.text.toLowerCase().includes('india') || c.text.toLowerCase().includes('prime minister'));
  console.log(`Found ${indiaChunks.length} chunks mentioning "india" or "prime minister".`);
  indiaChunks.forEach(c => {
    console.log(` - Lang: ${c.metadata.language} | ID: ${c.id} | Text: "${c.text.substring(0, 120)}..."`);
  });
}

auditQuery().catch(console.error);
