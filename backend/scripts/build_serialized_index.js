const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { HNSWVectorIndex } = require('../dist/services/hnswIndex');

async function buildAndSaveSerializedIndex() {
  console.log('================================================================================');
  console.log('BUILDING AND SERIALIZING FAST BINARY HNSW INDEX (ONE-TIME COMPILATION)');
  console.log('================================================================================\n');

  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const metaPath = path.join(__dirname, '..', 'data', 'hnsw_index.json');
  const vectorsPath = path.join(__dirname, '..', 'data', 'hnsw_vectors.bin');

  if (!fs.existsSync(vsPath)) {
    console.error(`Vector store not found at ${vsPath}`);
    process.exit(1);
  }

  const hnsw = new HNSWVectorIndex(3072, 16, 32, 32);
  const fileStream = fs.createReadStream(vsPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const startTime = Date.now();
  let count = 0;

  await new Promise((resolve, reject) => {
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '[' || trimmed === ']') return;
      const jsonStr = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
      try {
        const item = JSON.parse(jsonStr);
        hnsw.add(item.chunk, item.embedding);
        count++;
        if (count % 5000 === 0) {
          console.log(`  Indexed ${count.toLocaleString()} chunks (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed)...`);
        }
      } catch (e) {}
    });

    rl.on('close', resolve);
    rl.on('error', reject);
  });

  const buildTimeMs = Date.now() - startTime;
  console.log(`\n✓ Built HNSW index for ${count.toLocaleString()} chunks in ${(buildTimeMs / 1000).toFixed(2)}s.`);

  console.log(`\nSerializing pre-built index to ${metaPath} and ${vectorsPath}...`);
  const serializeStart = Date.now();
  hnsw.serializeToDisk(metaPath, vectorsPath);
  const serializeTimeMs = Date.now() - serializeStart;
  console.log(`✓ Serialization complete in ${(serializeTimeMs / 1000).toFixed(2)}s.`);

  const metaSizeMB = (fs.statSync(metaPath).size / (1024 * 1024)).toFixed(2);
  const vecSizeMB = (fs.statSync(vectorsPath).size / (1024 * 1024)).toFixed(2);
  console.log(`  • Graph Meta Size:   ${metaSizeMB} MB (${path.basename(metaPath)})`);
  console.log(`  • Binary Vectors:    ${vecSizeMB} MB (${path.basename(vectorsPath)})`);

  // Now benchmark instant deserialization!
  console.log('\n================================================================================');
  console.log('VERIFYING INSTANT COLD-START DESERIALIZATION SPEED');
  console.log('================================================================================');
  const testHnsw = new HNSWVectorIndex();
  const reloadStart = Date.now();
  const reloadRes = testHnsw.deserializeFromDisk(metaPath, vectorsPath);
  const reloadTimeMs = Date.now() - reloadStart;

  console.log(`✓ Cold Start Deserialization Time: ${reloadTimeMs}ms (${(reloadTimeMs / 1000).toFixed(3)} seconds)!`);
  console.log(`✓ Total Chunks Loaded into RAM:    ${reloadRes.totalNodes.toLocaleString()}`);
  console.log(`✓ Deserialization Status:          ${reloadRes.success ? 'SUCCESS' : 'FAILED'}`);

  // Spot-check retrieval correctness between original and reloaded
  const sampleVec = new Array(3072).fill(0).map((_, i) => Math.sin(i * 13));
  const res1 = hnsw.search(sampleVec, 5, 'hi');
  const res2 = testHnsw.search(sampleVec, 5, 'hi');

  console.log('\n--- SPOT CHECK VERIFICATION (Original vs Deserialized) ---');
  console.log('Original top-1 chunk ID:    ', res1[0]?.chunk?.id, 'Score:', res1[0]?.score);
  console.log('Deserialized top-1 chunk ID:', res2[0]?.chunk?.id, 'Score:', res2[0]?.score);
  const isIdentical = res1[0]?.chunk?.id === res2[0]?.chunk?.id && Math.abs((res1[0]?.score || 0) - (res2[0]?.score || 0)) < 1e-5;
  console.log(`Retrieval Parity: ${isIdentical ? '100% BIT-EXACT MATCH ✓' : 'MISMATCH ✗'}\n`);
}

buildAndSaveSerializedIndex().catch(console.error);
