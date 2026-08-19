const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { HNSWVectorIndex } = require('../dist/services/hnswIndex');

async function buildSerializedHnsw() {
  console.log('================================================================================');
  console.log('BUILDING & SERIALIZING HNSW INDEX FOR 84,661 REAL 384-DIM EMBEDDINGS');
  console.log('================================================================================\n');

  const vectorStorePath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const metaPath = path.join(__dirname, '..', 'data', 'hnsw_index.json');
  const vectorsPath = path.join(__dirname, '..', 'data', 'hnsw_vectors.bin');

  console.log(`1. Reading real 384-dim embeddings from ${vectorStorePath}...`);
  const loadStart = Date.now();
  const fileStream = fs.createReadStream(vectorStorePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const hnsw = new HNSWVectorIndex(384, 16, 64, 32);
  let count = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '[' || trimmed === ']') continue;
    const jsonStr = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
    try {
      const item = JSON.parse(jsonStr);
      if (item && item.chunk && item.embedding && item.embedding.length === 384) {
        hnsw.add(item.chunk, item.embedding);
        count++;
      }
    } catch (e) {}
  }
  console.log(`✓ Added ${count.toLocaleString()} real 384-dim chunks to HNSW graph in ${((Date.now() - loadStart)/1000).toFixed(2)}s.\n`);

  // 2. Serialize to disk
  console.log(`2. Serializing HNSW graph topology and binary float buffer...`);
  const serStart = Date.now();
  hnsw.serializeToDisk(metaPath, vectorsPath);
  console.log(`✓ Serialized binary index in ${((Date.now() - serStart) / 1000).toFixed(2)}s.\n`);

  const metaStat = fs.statSync(metaPath);
  const vecStat = fs.statSync(vectorsPath);
  console.log(`• Graph Topology Metadata: ${(metaStat.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`• Binary Vector Buffer:   ${(vecStat.size / (1024 * 1024)).toFixed(2)} MB\n`);

  // 3. Verify cold-start deserialization
  console.log('================================================================================');
  console.log('3. VERIFYING COLD-START DESERIALIZATION & LIVE SEMANTIC RETRIEVAL');
  console.log('================================================================================');
  const verifyHnsw = new HNSWVectorIndex(384);
  const desStart = Date.now();
  const res = verifyHnsw.deserializeFromDisk(metaPath, vectorsPath);
  const desElapsed = Date.now() - desStart;

  console.log(`✓ Cold-Start Reload Time: ${desElapsed} ms (${(desElapsed / 1000).toFixed(3)}s)`);
  console.log(`✓ Total Indexed Chunks:  ${res.totalNodes.toLocaleString()}`);

  // Test live semantic query
  const { pipeline } = await import('@xenova/transformers');
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { quantized: true });
  
  const testQuery = "Who is the Prime Minister of India?";
  const qOut = await extractor('query: ' + testQuery, { pooling: 'mean', normalize: true });
  const qVec = Array.from(qOut.data);

  const topHits = verifyHnsw.search(qVec, 3, 'semantic', 'en');
  console.log(`\nTest Semantic Query: "${testQuery}"`);
  topHits.forEach((hit, idx) => {
    console.log(`  #${idx + 1} [Score: ${hit.score.toFixed(4)}] ID: ${hit.chunk.id} -> "${hit.chunk.text.slice(0, 90)}..."`);
  });
  console.log('================================================================================\n');
}

buildSerializedHnsw().catch(console.error);
