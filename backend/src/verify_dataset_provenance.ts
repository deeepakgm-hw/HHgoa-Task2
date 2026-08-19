import * as fs from 'fs';
import * as path from 'path';
import { VectorDatabase } from './services/vectorDb';

export function verifyDatasetProvenance(): boolean {
  console.log("==========================================================");
  console.log("  RAGGoa Official Dataset Provenance & Integrity Auditor  ");
  console.log("==========================================================");

  const reportPath = path.join(__dirname, '../data/ingestion_report.json');
  const checkpointPath = path.join(__dirname, '../data/msmarco-xi/checkpoints/checkpoint_latest.json');
  const vectorStorePath = path.join(__dirname, '../data/vector_store.json');
  const queriesPath = path.join(__dirname, '../data/multilingual_benchmark_queries.json');

  let passed = true;

  // 1. Ingestion Report Check
  if (!fs.existsSync(reportPath)) {
    console.error("❌ FAILED: Ingestion report not found at:", reportPath);
    passed = false;
  } else {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    console.log(`✓ Ingestion Report Found:`);
    console.log(`  - Dataset: ${report.dataset}`);
    console.log(`  - Ingestion Mode: ${report.ingestionMode}`);
    console.log(`  - Languages: ${report.languages.join(', ')}`);
    console.log(`  - Total Chunks: ${report.totalChunksIndexed}`);
    console.log(`  - Full Dataset Downloaded: ${report.fullDatasetDownloaded} (Must be false)`);
    console.log(`  - Runtime HF Dependency: ${report.runtimeHfDependency} (Must be false)`);

    if (report.dataset !== 'ai4bharat/MSMARCO-XI' || report.ingestionMode !== 'STREAMING') {
      console.error("❌ FAILED: Dataset name or mode mismatch in ingestion report");
      passed = false;
    }
  }

  // 2. Checkpoint Verification
  if (!fs.existsSync(checkpointPath)) {
    console.error("❌ FAILED: Checkpoint file not found at:", checkpointPath);
    passed = false;
  } else {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    console.log(`\n✓ Checkpoint File Found:`);
    console.log(`  - Checkpoint ID: ${checkpoint.checkpointId}`);
    console.log(`  - Status: ${checkpoint.status}`);
    console.log(`  - Config Hash: ${checkpoint.configHash}`);
    console.log(`  - Queries Processed:`, checkpoint.processedQueries);
    console.log(`  - Chunks Generated:`, checkpoint.generatedChunks);

    if (checkpoint.status !== 'completed') {
      console.error("❌ FAILED: Checkpoint status is not 'completed'");
      passed = false;
    }
  }

  // 3. Vector Database Verification
  if (!fs.existsSync(vectorStorePath)) {
    console.error("❌ FAILED: Vector store not found at:", vectorStorePath);
    passed = false;
  } else {
    const vectorDb = new VectorDatabase();
    const loaded = vectorDb.loadFromFile(vectorStorePath);
    const chunkCount = vectorDb.size();
    console.log(`\n✓ Vector Store Found & Loaded: ${loaded}`);
    console.log(`  - Total In-Memory Chunks: ${chunkCount}`);

    const langCounts = vectorDb.getLanguageCounts();
    console.log(`  - Language Breakdown:`, langCounts);

    const requiredLangs = ['en', 'hi', 'kn', 'ta', 'te'];
    for (const reqLang of requiredLangs) {
      if (!langCounts[reqLang] || langCounts[reqLang] < 500) {
        console.error(`❌ FAILED: Language ${reqLang} has insufficient chunks: ${langCounts[reqLang] || 0}`);
        passed = false;
      }
    }
  }

  // 4. Benchmark Queries Verification
  if (!fs.existsSync(queriesPath)) {
    console.error("❌ FAILED: Benchmark queries file not found at:", queriesPath);
    passed = false;
  } else {
    const queries = JSON.parse(fs.readFileSync(queriesPath, 'utf8'));
    console.log(`\n✓ Benchmark Queries Found:`);
    console.log(`  - Total Queries: ${queries.length}`);
  }

  console.log("\n==========================================================");
  if (passed) {
    console.log("  ALL DATASET PROVENANCE CHECKS PASSED SUCCESSFULLY!       ");
  } else {
    console.log("  DATASET PROVENANCE AUDIT FAILED!                         ");
  }
  console.log("==========================================================");

  return passed;
}

if (require.main === module) {
  const ok = verifyDatasetProvenance();
  process.exit(ok ? 0 : 1);
}
