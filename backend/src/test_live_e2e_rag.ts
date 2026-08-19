import * as path from 'path';
import * as dotenv from 'dotenv';
import { VectorDatabase } from './services/vectorDb';
import { EmbeddingService } from './services/embeddings';
import { RetrievalService } from './services/retrieval';
import { RerankingService } from './services/reranking';
import { GenerationService } from './services/generation';
import { SttService } from './services/stt';
import { GuardrailService } from './services/guardrails';
import { RagPipeline } from './services/ragPipeline';

dotenv.config();

async function main() {
  console.log("===============================================================");
  console.log("          RAGGoa Live End-to-End RAG Verification             ");
  console.log("===============================================================");

  const vectorDb = new VectorDatabase();
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  vectorDb.loadFromFile(vsPath);
  console.log(`Loaded Vector Store with ${vectorDb.size()} chunks.`);

  const embedder = new EmbeddingService('gemini-embedding-2');
  const retrieval = new RetrievalService(vectorDb);
  const reranker = new RerankingService();
  const generator = new GenerationService();
  const stt = new SttService();
  const guardrail = new GuardrailService(0.60);

  const rag = new RagPipeline(stt, embedder, retrieval, reranker, generator, guardrail);

  console.log("\n-----------------------------------------------------------");
  console.log("TEST 1: 'भारत की राजधानी क्या है?' (Expected: New Delhi)");
  const res1 = await rag.executeTextQuery("req-1", { query: 'भारत की राजधानी क्या है?' });
  console.log("Status:", res1.status);
  console.log("Answer:", res1.answer);
  console.log("Top Source Doc:", res1.sources[0]?.id, "Score:", res1.sources[0]?.score);
  console.log("Top Source Text:", res1.sources[0]?.text);

  console.log("\n-----------------------------------------------------------");
  console.log("TEST 2: 'ताजमहल कहाँ स्थित है?' (Expected: Agra, Uttar Pradesh)");
  const res2 = await rag.executeTextQuery("req-2", { query: 'ताजमहल कहाँ स्थित है?' });
  console.log("Status:", res2.status);
  console.log("Answer:", res2.answer);
  console.log("Top Source Doc:", res2.sources[0]?.id, "Score:", res2.sources[0]?.score);
  console.log("Top Source Text:", res2.sources[0]?.text);

  console.log("\n-----------------------------------------------------------");
  console.log("TEST 3: 'क्रिस्टियानो रोनाल्डो कौन है?' (Expected: Refusal / insufficient_context)");
  const res3 = await rag.executeTextQuery("req-3", { query: 'क्रिस्टियानो रोनाल्डो कौन है?' });
  console.log("Status:", res3.status);
  console.log("Answer:", res3.answer);

  console.log("\n===============================================================");
  console.log("                 Verification Finished                         ");
  console.log("===============================================================");
}

main().catch(console.error);
