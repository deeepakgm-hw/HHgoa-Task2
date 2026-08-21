const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { VectorDatabase } = require('../dist/services/vectorDb');
const { RetrievalService } = require('../dist/services/retrieval');
const { EmbeddingService } = require('../dist/services/embeddings');
const { GenerationService } = require('../dist/services/generation');
const { GuardrailService } = require('../dist/services/guardrails');
const { RagPipeline } = require('../dist/services/ragPipeline');
const { SttService } = require('../dist/services/stt');

async function profileLatency() {
  console.log("===============================================================================");
  console.log("DETAILED LATENCY PROFILER FOR RAGGOA PIPELINE");
  console.log("===============================================================================\n");

  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const vectorDb = new VectorDatabase();
  console.log("Loading vector database...");
  const t0_load = Date.now();
  await vectorDb.loadFromFileAsync(vsPath);
  console.log(`✓ Vector DB loaded in ${Date.now() - t0_load}ms`);

  const embedService = new EmbeddingService();
  const retrievalService = new RetrievalService(vectorDb);
  const rerankService = { rerank: (q, items) => items };
  const genService = new GenerationService();
  const guardrailService = new GuardrailService(0.08);
  const sttService = new SttService();

  const pipeline = new RagPipeline(
    sttService,
    embedService,
    retrievalService,
    rerankService,
    genService,
    guardrailService
  );

  const testQuery = "What is a corporation?";
  console.log(`\nProfiling Query: "${testQuery}"`);

  // Warmup embedder
  await embedService.embedText("warmup", true);

  // 1. Embedding time
  const t0_emb = Date.now();
  const queryEmb = await embedService.embedText(testQuery, true);
  const t_emb = Date.now() - t0_emb;
  console.log(`1. Query Embedding Latency:       ${t_emb} ms`);

  // 2. Retrieval time
  const t0_ret = Date.now();
  const retrieved = await retrievalService.retrieve(testQuery, queryEmb, {
    topK: 3,
    strategy: 'semantic',
    language: 'en',
    hybridWeight: 0.25
  });
  const t_ret = Date.now() - t0_ret;
  console.log(`2. Vector + Hybrid Retrieval Latency: ${t_ret} ms (Found ${retrieved.length} chunks)`);

  // 3. Guardrail validation
  const t0_guard = Date.now();
  const guardVal = guardrailService.validateRetrieval(testQuery, retrieved);
  const t_guard = Date.now() - t0_guard;
  console.log(`3. Guardrail Validation Latency:      ${t_guard} ms (Passed: ${guardVal.passed})`);

  // 4. Generation time
  const t0_gen = Date.now();
  const genResult = await genService.generateAnswer(testQuery, retrieved, false, 'en', 0.08);
  const t_gen = Date.now() - t0_gen;
  console.log(`4. LLM Generation Latency:           ${t_gen} ms (Model: ${genResult.modelUsed})`);
  console.log(`   Answer: "${genResult.answer}"`);

  console.log(`\nTOTAL PIPELINE LATENCY: ${t_emb + t_ret + t_guard + t_gen} ms\n`);
}

profileLatency().catch(console.error);
