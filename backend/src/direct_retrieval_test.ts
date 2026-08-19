import * as path from 'path';
import * as dotenv from 'dotenv';
import { VectorDatabase } from './services/vectorDb';
import { EmbeddingService } from './services/embeddings';
import { RetrievalService } from './services/retrieval';
import { RerankingService } from './services/reranking';

dotenv.config();

async function main() {
  console.log("=========================================================================================");
  console.log("                        DIRECT RETRIEVAL EVALUATION TEST                                ");
  console.log("=========================================================================================");

  const vectorDb = new VectorDatabase();
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  vectorDb.loadFromFile(vsPath);

  const embedder = new EmbeddingService('gemini-embedding-2');
  const retrieval = new RetrievalService(vectorDb);
  const reranker = new RerankingService();

  const queries = [
    { label: "Query A", query: "भारत की राजधानी क्या है?", targetTopic: "Capital of India (New Delhi)" },
    { label: "Query B", query: "ताजमहल कहाँ स्थित है?", targetTopic: "Taj Mahal Agra Location" },
    { label: "Query C", query: "Who is the President of India?", targetTopic: "President of India (Out of domain)" },
    { label: "Query D", query: "जापान की राजधानी क्या है?", targetTopic: "Capital of Japan (Tokyo)" }
  ];

  for (const qObj of queries) {
    console.log(`\n=========================================================================================`);
    console.log(`TEST [${qObj.label}]: "${qObj.query}"`);
    console.log(`Expected Topic: ${qObj.targetTopic}`);
    console.log(`=========================================================================================`);

    const qVec = await embedder.embedText(qObj.query);
    const topCandidates = await retrieval.retrieve(qObj.query, qVec, { topK: 10, hybridWeight: 0.25 });
    const reranked = await reranker.rerank(qObj.query, topCandidates, true);

    const top5 = reranked.slice(0, 5);

    top5.forEach((item, idx) => {
      // Extract individual components
      const vectorScore = vectorDb.search(qVec, 100).find(r => r.chunk.id === item.chunk.id)?.score || 0;
      const hybridScore = topCandidates.find(r => r.chunk.id === item.chunk.id)?.score || 0;
      const rerankScore = item.score;
      const lexicalScore = (hybridScore - (1 - 0.25) * vectorScore) / 0.25;

      console.log(`\nRank #${idx + 1}: [${item.chunk.id}] (Strategy: ${item.chunk.strategy})`);
      console.log(`  Passage Text: "${item.chunk.text}"`);
      console.log(`  Scores: Vector=${vectorScore.toFixed(3)} | Lexical=${Math.max(0, lexicalScore).toFixed(3)} | Hybrid=${hybridScore.toFixed(3)} | Rerank=${rerankScore.toFixed(3)}`);
      console.log(`  Source Document: ${item.chunk.documentId}`);
    });
  }

  console.log(`\n=========================================================================================`);
}

main().catch(console.error);
