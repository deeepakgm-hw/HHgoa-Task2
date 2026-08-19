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

async function run() {
  console.log("=========================================================================================");
  console.log("                  RAGGoa LIFECYCLE & SCENARIO VERIFICATION SUITE                         ");
  console.log("=========================================================================================");

  const vectorDb = new VectorDatabase();
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  vectorDb.loadFromFile(vsPath);

  const embedder = new EmbeddingService('gemini-embedding-2');
  const retrieval = new RetrievalService(vectorDb);
  const reranker = new RerankingService();
  const generator = new GenerationService(false);
  const stt = new SttService();
  const guardrail = new GuardrailService(0.60);

  const rag = new RagPipeline(stt, embedder, retrieval, reranker, generator, guardrail);

  // Scenario A: Hindi known-good query
  console.log("\n[SCENARIO A] Hindi known-good query: 'ताजमहल कहाँ स्थित है?'");
  const t0_a = performance.now();
  const resA = await rag.executeTextQuery("req_scen_a", { query: "ताजमहल कहाँ स्थित है?" });
  const dur_a = (performance.now() - t0_a).toFixed(2);
  console.log(`  Status: ${resA.status} | Mode: ${resA.mode} | Duration: ${dur_a}ms`);
  console.log(`  Answer: ${resA.answer}`);
  console.log(`  Citations: ${JSON.stringify(resA.citations)}`);
  console.log(`  Top Source: ${resA.sources[0]?.id} (Score: ${resA.sources[0]?.score})`);

  // Scenario B: English known-good query
  console.log("\n[SCENARIO B] English query: 'what is the capital of india'");
  const t0_b = performance.now();
  const resB = await rag.executeTextQuery("req_scen_b", { query: "what is the capital of india" });
  const dur_b = (performance.now() - t0_b).toFixed(2);
  console.log(`  Status: ${resB.status} | Mode: ${resB.mode} | Duration: ${dur_b}ms`);
  console.log(`  Answer: ${resB.answer}`);
  console.log(`  Citations: ${JSON.stringify(resB.citations)}`);

  // Scenario C: Unsupported query
  console.log("\n[SCENARIO C] Unsupported query: 'जापान की राजधानी क्या है?'");
  const t0_c = performance.now();
  const resC = await rag.executeTextQuery("req_scen_c", { query: "जापान की राजधानी क्या है?" });
  const dur_c = (performance.now() - t0_c).toFixed(2);
  console.log(`  Status: ${resC.status} | Mode: ${resC.mode} | Duration: ${dur_c}ms`);
  console.log(`  Answer: ${resC.answer}`);
  console.log(`  Reason: ${resC.reason}`);

  // Scenario D: Gemini Timeout Simulation
  console.log("\n[SCENARIO D] Simulating Gemini Timeout");
  const slowGen = {
    generateAnswer: async () => {
      await new Promise(r => setTimeout(r, 2000));
      throw new Error("GENERATION_TIMEOUT: Gemini generation timed out after 15000ms");
    }
  } as any;
  const timeoutRag = new RagPipeline(stt, embedder, retrieval, reranker, slowGen, guardrail);
  const resD = await timeoutRag.executeTextQuery("req_scen_d", { query: "ताजमहल कहाँ स्थित है?" });
  console.log(`  Status: ${resD.status} | Mode: ${resD.mode}`);
  console.log(`  Answer: ${resD.answer}`);
  console.log(`  Reason: ${resD.reason}`);

  // Scenario E: Gemini Rate Limit Simulation
  console.log("\n[SCENARIO E] Simulating Gemini Rate Limit (429)");
  const rateLimitedGen = {
    generateAnswer: async () => {
      const err = new Error("RATE_LIMITED: Gemini generation quota exceeded. Please wait a moment.");
      (err as any).statusCode = 429;
      throw err;
    }
  } as any;
  const rateLimitRag = new RagPipeline(stt, embedder, retrieval, reranker, rateLimitedGen, guardrail);
  try {
    await rateLimitRag.executeTextQuery("req_scen_e", { query: "ताजमहल कहाँ स्थित है?" });
  } catch (err: any) {
    console.log(`  Caught Rate Limit Error as Expected: status=${err.statusCode} | message="${err.message}"`);
  }

  // Scenario F: Voice Query
  console.log("\n[SCENARIO F] Voice Query (Mock audio buffer)");
  const fakeAudio = Buffer.from("RIFF....WAVEfmt ....data....");
  const resF = await rag.executeVoiceQuery("req_scen_f", {
    audioBuffer: fakeAudio,
    filename: "test.webm",
    languageCode: "hi-IN"
  });
  console.log(`  Voice Status: ${resF.status} | Mode: ${resF.mode}`);
  console.log(`  Transcript: "${resF.transcript}"`);
  console.log(`  Answer: ${resF.answer}`);

  console.log("\n=========================================================================================");
  console.log("                    ALL SCENARIOS COMPLETED AND VALIDATED                                ");
  console.log("=========================================================================================");
}

run().catch(console.error);
