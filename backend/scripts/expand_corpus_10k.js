const fs = require('fs');
const path = require('path');

// Load chunking and embedding services
const { FixedSizeChunker, SentenceAwareChunker } = require('../dist/services/chunking');
const { EmbeddingService } = require('../dist/services/embeddings');
const { VectorDatabase } = require('../dist/services/vectorDb');

async function expandCorpus() {
  const { parquetRead, parquetMetadata } = await import('hyparquet');
  const { compressors } = await import('hyparquet-compressors');
  console.log('================================================================================');
  console.log('PROMPT EXECUTION: EXPANDING MSMARCO-XI CORPUS COVERAGE (BUDGET-BOUNDED ~10K CHUNKS)');
  console.log('================================================================================\n');

  const startTime = Date.now();

  const rawDir = path.join(__dirname, '..', 'data', 'msmarco-xi', 'raw');
  const files = {
    hi: path.join(rawDir, 'hi', 'hinval.parquet'),
    kn: path.join(rawDir, 'kn', 'kanval.parquet'),
    ta: path.join(rawDir, 'ta', 'tamval.parquet'),
    te: path.join(rawDir, 'te', 'telval.parquet')
  };

  const fixedChunker = new FixedSizeChunker(300, 50);
  const sentenceChunker = new SentenceAwareChunker(400);
  const embedService = new EmbeddingService(undefined, undefined, true);

  const allChunks = [];
  const queryCountsPerLang = { en: 0, hi: 0, kn: 0, ta: 0, te: 0 };
  const chunkCountsPerLang = { en: 0, hi: 0, kn: 0, ta: 0, te: 0 };

  const TARGET_QUERIES_PER_LANG = 80; // 80 queries x ~10 passages x 2-3 chunking strategies ~= 2,000 chunks per language (Total ~10k)

  // 1. Process Indic Parquet Files & English Source Pairs
  for (const [lang, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}, skipping...`);
      continue;
    }

    console.log(`\n[Reading Parquet]: ${lang.toUpperCase()} -> ${path.basename(filePath)}...`);
    const fileBuffer = fs.readFileSync(filePath);
    const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
    const meta = parquetMetadata(arrayBuffer);
    const totalRows = Number(meta.num_rows);
    console.log(`  Total Rows in Parquet: ${totalRows.toLocaleString()}`);

    const sampleLimit = Math.min(2500, totalRows);
    const rawRows = await new Promise((resolve) => {
      parquetRead({
        file: arrayBuffer,
        compressors,
        rowStart: 0,
        rowEnd: sampleLimit,
        onComplete: (data) => resolve(data)
      });
    });

    console.log(`  Scanned ${rawRows.length} rows from parquet.`);

    let validQueriesInLang = 0;
    const stride = Math.max(1, Math.floor(rawRows.length / TARGET_QUERIES_PER_LANG));

    for (let i = 0; i < rawRows.length && validQueriesInLang < TARGET_QUERIES_PER_LANG; i += stride) {
      const row = rawRows[i];
      const sourceLang = row[0] || 'en';
      const targetLang = row[1] || lang;
      const answer = row[3] || '';
      const queryId = row[4] || i;
      const passagesObj = row[6] || {};
      const engQuery = row[7] || '';
      const engAnswer = row[8] || '';
      const query = row[9] || '';

      if (!query || !passagesObj.Translated_passages || passagesObj.Translated_passages.length === 0) {
        continue;
      }

      validQueriesInLang++;
      queryCountsPerLang[lang]++;

      const docId = `msmarco-xi-${lang}-q${validQueriesInLang}`;
      const pCount = passagesObj.Translated_passages.length;
      const isSelectedArr = passagesObj.is_selected || [];

      for (let p = 0; p < pCount; p++) {
        const text = (passagesObj.Translated_passages[p] || '').trim();
        const engText = (passagesObj.English_passages?.[p] || '').trim();
        const isSelected = Number(isSelectedArr[p]) === 1;

        if (!text || text.length < 15) continue;

        const metadata = {
          queryId: docId,
          passageIdx: p,
          isSelected,
          originalQuery: query,
          goldAnswer: answer,
          language: lang,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang
        };

        const passageId = `${docId}-p${p}`;
        const fChunks = fixedChunker.chunk(text, passageId, metadata);
        const sChunks = sentenceChunker.chunk(text, passageId, metadata);

        allChunks.push(...fChunks, ...sChunks);
        chunkCountsPerLang[lang] += (fChunks.length + sChunks.length);

        // Also add English chunk if we need more English diversity
        if (lang === 'hi' && engText && engText.length >= 15 && queryCountsPerLang.en < TARGET_QUERIES_PER_LANG) {
          const engDocId = `msmarco-xi-en-q${validQueriesInLang}`;
          const engMeta = {
            queryId: engDocId,
            passageIdx: p,
            isSelected,
            originalQuery: engQuery || query,
            goldAnswer: engAnswer || answer,
            language: 'en',
            sourceLanguage: 'en',
            targetLanguage: 'en'
          };
          const engPassageId = `${engDocId}-p${p}`;
          const efChunks = fixedChunker.chunk(engText, engPassageId, engMeta);
          const esChunks = sentenceChunker.chunk(engText, engPassageId, engMeta);
          allChunks.push(...efChunks, ...esChunks);
          chunkCountsPerLang.en += (efChunks.length + esChunks.length);
        }
      }
    }

    if (lang === 'hi') {
      queryCountsPerLang.en = validQueriesInLang;
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log('CHUNKING COMPLETE. COMPUTING & CACHING MULTILINGUAL EMBEDDINGS...');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total Chunks Generated: ${allChunks.length.toLocaleString()}`);
  console.log('Chunks per Language:', JSON.stringify(chunkCountsPerLang, null, 2));

  // 2. Generate Vector Embeddings
  const chunkTexts = allChunks.map(c => c.text);
  const embeddings = await embedService.embedBatch(chunkTexts);

  console.log('Writing compact vector store to disk...');
  const vectorStorePath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const ws = fs.createWriteStream(vectorStorePath, { encoding: 'utf8' });

  await new Promise((resolve, reject) => {
    ws.write('[\n');
    for (let i = 0; i < allChunks.length; i++) {
      const compactItem = {
        chunk: allChunks[i],
        embedding: embeddings[i].map(x => Number(x.toFixed(4)))
      };
      const comma = i < allChunks.length - 1 ? ',\n' : '\n';
      ws.write(JSON.stringify(compactItem) + comma);
    }
    ws.write(']\n');
    ws.end();
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  const wallClockMs = Date.now() - startTime;
  const fileSizeMB = (fs.statSync(vectorStorePath).size / (1024 * 1024)).toFixed(2);
  const memUsageMB = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);

  console.log('\n================================================================================');
  console.log('EXPANDED INGESTION SUMMARY');
  console.log('================================================================================');
  console.log(`• Final Vector Store Count: ${allChunks.length.toLocaleString()} chunks`);
  console.log(`• Query Clusters Sampled:   ${Object.values(queryCountsPerLang).reduce((a,b)=>a+b, 0).toLocaleString()} diverse validation queries`);
  console.log(`• Languages Covered:        EN (${chunkCountsPerLang.en}), HI (${chunkCountsPerLang.hi}), KN (${chunkCountsPerLang.kn}), TA (${chunkCountsPerLang.ta}), TE (${chunkCountsPerLang.te})`);
  console.log(`• Ingestion Wall-Clock:     ${(wallClockMs / 1000).toFixed(2)} seconds`);
  console.log(`• Total Incurred Cost:      $0.00 USD`);
  console.log(`• Saved Store Size:         ${fileSizeMB} MB`);
  console.log(`• Heap RAM Footprint:       ${memUsageMB} MB (Safe single-node bounds)`);
  console.log('================================================================================\n');

  return {
    totalChunks: allChunks.length,
    chunkCountsPerLang,
    queryCountsPerLang,
    wallClockMs,
    fileSizeMB,
    memUsageMB
  };
}

expandCorpus().catch(console.error);
