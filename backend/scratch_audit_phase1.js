const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function auditPhase1() {
  console.log('====================================================');
  console.log('PHASE 1 AUDIT: ai4bharat/MSMARCO-XI INTEGRITY VERIFICATION');
  console.log('====================================================\n');

  // 1. Audit repo id and download references in codebase
  console.log('--- 1. REPO ID & HUB CONFIG AUDIT ---');
  const hfSourceFile = path.join(__dirname, 'src/ingestion/dataset_source.ts');
  const hfContent = fs.readFileSync(hfSourceFile, 'utf8');
  const repoIdMatch = hfContent.match(/datasetName:\s*string\s*=\s*['"]([^'"]+)['"]/);
  console.log('Official Dataset Source File:', hfSourceFile);
  console.log('Exact Repo ID configured:', repoIdMatch ? repoIdMatch[1] : 'NOT FOUND');
  console.log('Confirmed literally "ai4bharat/MSMARCO-XI":', repoIdMatch && repoIdMatch[1] === 'ai4bharat/MSMARCO-XI');

  // 2. Parquet files in raw directory & SHA256 checksums
  console.log('\n--- 2. RAW PARQUET FILES & CHECKSUMS ---');
  const rawDir = path.join(__dirname, 'data/msmarco-xi/raw');
  
  function getFilesRecursively(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        files = files.concat(getFilesRecursively(full));
      } else {
        files.push(full);
      }
    }
    return files;
  }

  const rawFiles = getFilesRecursively(rawDir);
  for (const f of rawFiles) {
    const stat = fs.statSync(f);
    const rel = path.relative(__dirname, f);
    const hash = crypto.createHash('sha256');
    const buffer = fs.readFileSync(f);
    hash.update(buffer);
    const sha256 = hash.digest('hex');
    console.log(`File: ${rel} | Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB | SHA256: ${sha256}`);
  }

  // 3. Inspect official Schema & 3 Random Records from hyparquet
  console.log('\n--- 3. PARQUET SCHEMA & 3 RANDOM EXAMPLES ---');
  const hpMod = await eval("import('hyparquet')");
  const compMod = await eval("import('hyparquet-compressors')");
  const parquetRead = hpMod.parquetRead || hpMod.default?.parquetRead;
  const compressors = compMod.compressors || compMod.default?.compressors || compMod;

  const sampleFile = path.join(rawDir, 'hi/hinval.parquet');
  if (fs.existsSync(sampleFile)) {
    const fd = fs.openSync(sampleFile, 'r');
    const stat = fs.fstatSync(fd);
    const asyncBuffer = {
      byteLength: stat.size,
      async slice(start, end) {
        const targetEnd = end ?? stat.size;
        const length = targetEnd - start;
        const buf = Buffer.alloc(length);
        fs.readSync(fd, buf, 0, length, start);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + length);
      }
    };

    const rows = await new Promise((resolve, reject) => {
      parquetRead({
        file: asyncBuffer,
        compressors,
        rowFormat: 'object',
        rowStart: 0,
        rowEnd: 200,
        onComplete: (res) => resolve(res)
      });
    });
    fs.closeSync(fd);

    console.log(`Sample Parquet Rows Loaded: ${rows.length}`);
    if (rows.length > 0) {
      console.log('Columns Present in Row 0:', Object.keys(rows[0]));
      console.log('Required Schema (source_lang, target_lang, meta, query, Answer, passages):');
      const sampleRow = rows[0];
      console.log({
        has_source_lang: 'source_lang' in sampleRow,
        has_target_lang: 'target_lang' in sampleRow,
        has_query: 'query' in sampleRow,
        has_Eng_Query: 'Eng_Query' in sampleRow,
        has_Answer: 'Answer' in sampleRow,
        has_Eng_Answer: 'Eng_Answer' in sampleRow,
        has_passages: 'passages' in sampleRow,
        has_meta: 'meta' in sampleRow
      });

      // 3 Random rows from rows (e.g. idx 17, 73, 142)
      const randomIndices = [17, 73, 142];
      console.log('\n--- 3 RANDOM RECORD SAMPLES ---');
      for (const idx of randomIndices) {
        const r = rows[idx];
        console.log(`\n[RANDOM ROW #${idx}]`);
        console.log(`Query (${r.target_lang}):`, r.query);
        console.log(`Eng_Query:`, r.Eng_Query);
        console.log(`Answer:`, r.Answer);
        console.log(`Source Lang:`, r.source_lang, `| Target Lang:`, r.target_lang);
        console.log(`Passages count:`, r.passages ? (r.passages.Translated_passages?.length || r.passages.passage_text?.length || 'N/A') : 'N/A');
        if (r.passages && r.passages.Translated_passages && r.passages.Translated_passages[0]) {
          console.log(`Passage [0] snippet (${r.target_lang}):`, r.passages.Translated_passages[0].slice(0, 140) + '...');
        }
        if (r.passages && r.passages.English_passages && r.passages.English_passages[0]) {
          console.log(`Passage [0] English snippet:`, r.passages.English_passages[0].slice(0, 140) + '...');
        }
      }
    }
  }

  // 4. Vector Store and Chunk Counts
  console.log('\n--- 4. SINGLE SOURCE OF TRUTH FOR CHUNK/INDEX COUNT ---');
  const vectorStorePath = path.join(__dirname, 'data/vector_store.json');
  if (fs.existsSync(vectorStorePath)) {
    const vsRaw = fs.readFileSync(vectorStorePath, 'utf8');
    const vs = JSON.parse(vsRaw);
    const chunks = vs.chunks || [];
    console.log(`Total Chunks in vector_store.json: ${chunks.length}`);
    const langCounts = {};
    for (const c of chunks) {
      const l = c.metadata?.language || c.language || 'unknown';
      langCounts[l] = (langCounts[l] || 0) + 1;
    }
    console.log('Chunks per language:', langCounts);
  }

  // Check backend health endpoint
  console.log('\n--- 5. LIVE BACKEND /api/health DATASET INFO ---');
  try {
    const res = await fetch('http://localhost:5000/api/health');
    const health = await res.json();
    console.log('Health Endpoint Response:');
    console.log(JSON.stringify(health, null, 2));
  } catch (e) {
    console.log('Backend not reachable on http://localhost:5000:', e.message);
  }
}

auditPhase1().catch(console.error);
