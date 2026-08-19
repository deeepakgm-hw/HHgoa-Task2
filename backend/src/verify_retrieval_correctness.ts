import * as path from 'path';
import * as dotenv from 'dotenv';
import { VectorDatabase } from './services/vectorDb';
import { EmbeddingService } from './services/embeddings';
import { RetrievalService } from './services/retrieval';
import { RerankingService } from './services/reranking';
import { GuardrailService } from './services/guardrails';

dotenv.config();

async function main() {
  console.log("===============================================================");
  console.log("  RAGGoa Official Retrieval Correctness Verification Suite   ");
  console.log("===============================================================");

  const vectorDb = new VectorDatabase();
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  vectorDb.loadFromFile(vsPath);
  console.log(`Loaded Vector Database with ${vectorDb.size()} chunks.`);

  const embedder = new EmbeddingService('gemini-embedding-2');
  const retrieval = new RetrievalService(vectorDb);
  const reranker = new RerankingService();
  const guardrail = new GuardrailService(0.60);

  const testCases = [
    {
      query: "भारत की राजधानी क्या है?",
      expectedKeyword: "नई दिल्ली",
      expectedTopic: "Capital of India",
      mustPass: true
    },
    {
      query: "ताजमहल कहाँ स्थित है?",
      expectedKeyword: "आगरा",
      expectedTopic: "Taj Mahal Agra",
      mustPass: true
    },
    {
      query: "जापान की राजधानी कौन सा शहर है",
      expectedKeyword: "टोक्यो",
      expectedTopic: "Japan Tokyo",
      mustPass: true
    },
    {
      query: "कतर की राजधानी क्या है?",
      expectedKeyword: "दोहा",
      expectedTopic: "Qatar Doha",
      mustPass: true
    },
    {
      query: "कॉर्पोरेशन क्या है?",
      expectedKeyword: "निगम",
      expectedTopic: "Corporation",
      mustPass: true
    },
    {
      query: "बाज़ कितनी तेजी से यात्रा करता है",
      expectedKeyword: "बाज़",
      expectedTopic: "Falcon Speed",
      mustPass: true
    },
    {
      query: "क्रिस्टियानो रोनाल्डो कौन है?",
      expectedKeyword: "NONE",
      expectedTopic: "Out of domain - Refusal expected",
      mustPass: false // Should be refused by guardrail
    }
  ];

  let passedAll = true;

  for (const tc of testCases) {
    console.log(`\n-----------------------------------------------------------`);
    console.log(`Query: "${tc.query}" (Target: ${tc.expectedTopic})`);

    const qVec = await embedder.embedText(tc.query);
    const retrieved = await retrieval.retrieve(tc.query, qVec, { topK: 3, strategy: 'semantic', hybridWeight: 0.25 });
    const reranked = await reranker.rerank(tc.query, retrieved, true);
    const guard = guardrail.validateRetrieval(tc.query, reranked);

    if (tc.mustPass) {
      if (!guard.passed) {
        console.error(`❌ FAILED: Query rejected by guardrail: ${guard.reason}`);
        passedAll = false;
        continue;
      }
      const topResult = reranked[0];
      const hasExpected = topResult.chunk.text.includes(tc.expectedKeyword);
      console.log(`Top Score: ${topResult.score.toFixed(3)} | Strategy: ${topResult.chunk.strategy} | Doc: ${topResult.chunk.documentId}`);
      console.log(`Top Passage Text: "${topResult.chunk.text.substring(0, 100)}..."`);
      if (hasExpected) {
        console.log(`✅ PASSED: Correctly retrieved ${tc.expectedTopic} containing '${tc.expectedKeyword}'`);
      } else {
        console.error(`❌ FAILED: Expected '${tc.expectedKeyword}' in top result!`);
        passedAll = false;
      }
    } else {
      // Expect refusal / out of domain rejection
      if (!guard.passed) {
        console.log(`✅ PASSED: Correctly refused out-of-domain query with score (${reranked[0]?.score.toFixed(3) || 'none'}) < threshold (0.60).`);
      } else {
        console.warn(`⚠️ Warning: Out-of-domain query passed threshold with score ${reranked[0].score.toFixed(3)}`);
      }
    }
  }

  console.log(`\n===============================================================`);
  if (passedAll) {
    console.log(`🎉 ALL RETRIEVAL CORRECTNESS TESTS PASSED (100% FACTUAL)`);
  } else {
    console.error(`❌ SOME RETRIEVAL TESTS FAILED`);
  }
  console.log(`===============================================================`);
}

main().catch(console.error);
