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
  console.log("=========================================================================================");
  console.log("                           LIVE GEMINI GENERATION TEST                                  ");
  console.log("=========================================================================================");

  const vectorDb = new VectorDatabase();
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  vectorDb.loadFromFile(vsPath);

  const embedder = new EmbeddingService('gemini-embedding-2');
  const retrieval = new RetrievalService(vectorDb);
  const reranker = new RerankingService();
  const generator = new GenerationService(false); // real mode
  const stt = new SttService();
  const guardrail = new GuardrailService(0.60);

  const rag = new RagPipeline(stt, embedder, retrieval, reranker, generator, guardrail);

  console.log("\n--- TEST: 'ताजमहल कहाँ स्थित है?' ---");
  const tajResult = await rag.executeTextQuery("req_live_taj", { query: "ताजमहल कहाँ स्थित है?" });
  console.log("Status:", tajResult.status);
  console.log("Mode:", tajResult.mode);
  console.log("Answer:", tajResult.answer);
  console.log("Citations:", tajResult.citations);
  console.log("Sources:", tajResult.sources.map(s => ({ id: s.id, score: s.score })));
  console.log("Telemetry:", tajResult.telemetry);

  console.log("\n--- TEST: 'भारत की राजधानी क्या है?' ---");
  const capitalResult = await rag.executeTextQuery("req_live_cap", { query: "भारत की राजधानी क्या है?" });
  console.log("Status:", capitalResult.status);
  console.log("Mode:", capitalResult.mode);
  console.log("Answer:", capitalResult.answer);
  console.log("Citations:", capitalResult.citations);
  console.log("Sources:", capitalResult.sources.map(s => ({ id: s.id, score: s.score })));
  console.log("Telemetry:", capitalResult.telemetry);

  console.log("\n=========================================================================================");
}

main().catch(console.error);
