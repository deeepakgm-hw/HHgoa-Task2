const fs = require('fs');
const path = require('path');

// Load chunking and embedding services
const { FixedSizeChunker, SentenceAwareChunker } = require('../dist/services/chunking');
const { EmbeddingService } = require('../dist/services/embeddings');

async function expandCorpus100k() {
  const { parquetRead, parquetMetadata } = await import('hyparquet');
  const { compressors } = await import('hyparquet-compressors');
  console.log('================================================================================');
  console.log('STEP 3: EXECUTING 10X SCALED MSMARCO-XI CORPUS INGESTION (~85K-100K CHUNKS)');
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

  const TARGET_QUERIES_PER_LANG = 600; // 600 queries x ~10 passages x 2 chunking strategies ~= 12,000-18,000 chunks per lang (Total ~75k-90k chunks)

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

    const sampleLimit = Math.min(25000, totalRows);
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

        // Also add English chunk
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
  }

  queryCountsPerLang.en = queryCountsPerLang.hi;

  console.log('\n--------------------------------------------------------------------------------');
  console.log('CHUNKING COMPLETE. COMPUTING & STREAMING 10X SCALED MULTILINGUAL EMBEDDINGS...');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total Chunks Generated: ${allChunks.length.toLocaleString()}`);
  console.log('Chunks per Language:', JSON.stringify(chunkCountsPerLang, null, 2));

  // 2. Generate Vector Embeddings in batches of 1,000 to manage memory
  console.log('\nWriting compact vector store to disk via JSON stream...');
  const vectorStorePath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const ws = fs.createWriteStream(vectorStorePath, { encoding: 'utf8' });

  await new Promise(async (resolve, reject) => {
    ws.write('[\n');
    const BATCH_SIZE = 1000;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batchChunks = allChunks.slice(i, i + BATCH_SIZE);
      const batchTexts = batchChunks.map(c => c.text);
      const batchEmbeddings = await embedService.embedBatch(batchTexts);

      for (let j = 0; j < batchChunks.length; j++) {
        const globalIdx = i + j;
        const compactItem = {
          chunk: batchChunks[j],
          embedding: batchEmbeddings[j].map(x => Number(x.toFixed(4)))
        };
        const comma = globalIdx < allChunks.length - 1 ? ',\n' : '\n';
        ws.write(JSON.stringify(compactItem) + comma);
      }

      if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= allChunks.length) {
        console.log(`  Processed & written ${Math.min(i + BATCH_SIZE, allChunks.length).toLocaleString()} / ${allChunks.length.toLocaleString()} chunks...`);
      }
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
  console.log('SCALED 10X INGESTION SUMMARY');
  console.log('================================================================================');
  console.log(`• Final Vector Store Count: ${allChunks.length.toLocaleString()} chunks`);
  console.log(`• Query Clusters Sampled:   ${Object.values(queryCountsPerLang).reduce((a,b)=>a+b, 0).toLocaleString()} diverse validation queries`);
  console.log(`• Languages Covered:        EN (${chunkCountsPerLang.en}), HI (${chunkCountsPerLang.hi}), KN (${chunkCountsPerLang.kn}), TA (${chunkCountsPerLang.ta}), TE (${chunkCountsPerLang.te})`);
  console.log(`• Ingestion Wall-Clock:     ${(wallClockMs / 1000).toFixed(2)} seconds`);
  console.log(`• Total Incurred Cost:      $0.00 USD`);
  console.log(`• Saved Store Size:         ${fileSizeMB} MB`);
  console.log(`• Heap RAM Footprint:       ${memUsageMB} MB`);
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

expandCorpus100k().catch(console.error);
