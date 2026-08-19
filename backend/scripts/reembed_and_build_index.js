const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function reembedAndBuildIndex() {
  console.log('================================================================================');
  console.log('RE-EMBEDDING 84,667 CHUNKS WITH REAL LOCAL MULTILINGUAL MODEL (E5-SMALL)');
  console.log('================================================================================\n');

  console.log('1. Initializing local ONNX feature-extraction pipeline (Xenova/multilingual-e5-small)...');
  const { pipeline } = await import('@xenova/transformers');
  const t0 = Date.now();
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
    quantized: true
  });
  console.log(`✓ Model initialized in ${((Date.now() - t0) / 1000).toFixed(2)}s.\n`);

  const vectorStorePath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const metaPath = path.join(__dirname, '..', 'data', 'hnsw_index.json');
  const vectorsPath = path.join(__dirname, '..', 'data', 'hnsw_vectors.bin');

  console.log(`2. Reading existing chunk texts from ${vectorStorePath}...`);
  const loadStart = Date.now();
  const fileStream = fs.createReadStream(vectorStorePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const allChunks = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '[' || trimmed === ']') continue;
    const jsonStr = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
    try {
      const item = JSON.parse(jsonStr);
      if (item && item.chunk && item.chunk.text) {
        allChunks.push(item.chunk);
      }
    } catch (e) {}
  }
  console.log(`✓ Loaded ${allChunks.length} chunks in ${((Date.now() - loadStart)/1000).toFixed(2)}s.\n`);

  // 3. Re-embedding chunks with live progress
  console.log(`3. Generating real 384-dimensional semantic embeddings (batch size = 64)...`);
  const DIMENSION = 384;
  const reembeddedItems = [];
  const floatBuffer = new Float32Array(allChunks.length * DIMENSION);
  
  const startTime = Date.now();
  const total = allChunks.length;
  const BATCH_SIZE = 64;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunkBatch = allChunks.slice(i, i + BATCH_SIZE);
    const textBatch = chunkBatch.map(c => 'passage: ' + c.text);

    // Run inference on batch
    const outputs = await extractor(textBatch, { pooling: 'mean', normalize: true });
    const outputData = outputs.data; // Flat Float32Array of batch_size * 384

    for (let j = 0; j < chunkBatch.length; j++) {
      const globalIdx = i + j;
      const vecOffset = j * DIMENSION;
      const globalBufferOffset = globalIdx * DIMENSION;

      const vec = outputData.subarray(vecOffset, vecOffset + DIMENSION);
      floatBuffer.set(vec, globalBufferOffset);

      reembeddedItems.push({
        chunk: chunkBatch[j],
        embedding: Array.from(vec)
      });
    }

    const processed = Math.min(i + BATCH_SIZE, total);
    if (Math.floor(processed / 2000) > Math.floor(i / 2000) || processed >= total) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = processed / elapsedSec;
      const remainingSec = (total - processed) / rate;
      console.log(`  • Embedded ${processed.toLocaleString()} / ${total.toLocaleString()} chunks (${elapsedSec.toFixed(1)}s elapsed, ${rate.toFixed(1)} chunks/sec, ETA: ${(remainingSec/60).toFixed(1)} min)...`);
    }
  }

  const embedDurationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Finished generating real neural embeddings for ${total} chunks in ${embedDurationSec}s (${(embedDurationSec / 60).toFixed(2)} min).\n`);

  // 4. Save updated vector_store.json with real 384-dim embeddings
  console.log(`4. Saving updated vector store to ${vectorStorePath}...`);
  const writeStream = fs.createWriteStream(vectorStorePath, { encoding: 'utf8' });
  writeStream.write('[\n');
  for (let i = 0; i < reembeddedItems.length; i++) {
    const isLast = i === reembeddedItems.length - 1;
    writeStream.write(JSON.stringify(reembeddedItems[i]) + (isLast ? '\n' : ',\n'));
  }
  writeStream.write(']\n');
  await new Promise(resolve => writeStream.end(resolve));
  console.log(`✓ Saved ${reembeddedItems.length} chunks with real 384-dim vectors.\n`);

  // 5. Build HNSW index with real vectors
  console.log(`5. Building fast binary HNSW graph index (384 dimensions)...`);
  const { HNSWVectorIndex } = require('../dist/services/hnswIndex');
  const hnsw = new HNSWVectorIndex(DIMENSION, 16, 64, 32);

  const hnswStart = Date.now();
  for (let i = 0; i < reembeddedItems.length; i++) {
    const item = reembeddedItems[i];
    const lang = (item.chunk.metadata?.language || item.chunk.metadata?.targetLanguage || 'en').toLowerCase().split('-')[0];
    hnsw.insert(item.chunk, item.embedding, lang);
  }
  console.log(`✓ Built HNSW graph in ${((Date.now() - hnswStart) / 1000).toFixed(2)}s.\n`);

  // 6. Serialize pre-built HNSW graph and binary float vectors
  console.log(`6. Serializing pre-built index to ${metaPath} and ${vectorsPath}...`);
  const serStart = Date.now();
  hnsw.serializeToDisk(metaPath, vectorsPath);
  console.log(`✓ Serialized binary index in ${((Date.now() - serStart) / 1000).toFixed(2)}s.\n`);

  // 7. Verify instant cold-start deserialization and semantic retrieval
  console.log('================================================================================');
  console.log('VERIFYING COLD-START DESERIALIZATION & SEMANTIC RETRIEVAL');
  console.log('================================================================================');
  const verifyHnsw = new HNSWVectorIndex(DIMENSION);
  const desStart = Date.now();
  const res = verifyHnsw.deserializeFromDisk(metaPath, vectorsPath);
  const desElapsed = Date.now() - desStart;

  console.log(`✓ Cold-Start Reload Time: ${desElapsed} ms (${(desElapsed / 1000).toFixed(3)}s)`);
  console.log(`✓ Total Chunks in RAM:   ${res.totalNodes}`);

  // Test real semantic search with a live query
  const testQuery = "Who is the Prime Minister of India?";
  const qOut = await extractor('query: ' + testQuery, { pooling: 'mean', normalize: true });
  const qVec = Array.from(qOut.data);

  const topHits = verifyHnsw.search(qVec, 3, 'semantic', 'en');
  console.log(`\nTest Semantic Search: "${testQuery}"`);
  topHits.forEach((hit, idx) => {
    console.log(`  #${idx + 1} [Score: ${hit.score.toFixed(4)}] ID: ${hit.chunk.id} -> "${hit.chunk.text.slice(0, 80)}..."`);
  });
  console.log('================================================================================\n');
}

reembedAndBuildIndex().catch(console.error);
