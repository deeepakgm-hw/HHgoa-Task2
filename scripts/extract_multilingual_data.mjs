import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetMetadataAsync, parquetRead } from 'hyparquet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../backend/data/msmarco-xi');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

function makeAsyncBuffer(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const stat = fs.fstatSync(fd);
  return {
    byteLength: stat.size,
    slice: (start, end) => {
      const length = (end ?? stat.size) - start;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length);
    }
  };
}

async function inspectAndExtract() {
  const languages = [
    { code: 'hi', name: 'Hindi', file: path.join(RAW_DIR, 'hi/hinval.parquet') },
    { code: 'kn', name: 'Kannada', file: path.join(RAW_DIR, 'kn/kanval.parquet') },
    { code: 'ta', name: 'Tamil', file: path.join(RAW_DIR, 'ta/tamval.parquet') },
    { code: 'te', name: 'Telugu', file: path.join(RAW_DIR, 'te/telval.parquet') }
  ];

  const manifest = {
    source: 'ai4bharat/MSMARCO-XI',
    targetLanguages: ['en', 'hi', 'kn', 'ta', 'te'],
    splits: {},
    processedSubsets: {},
    generatedAt: new Date().toISOString()
  };

  const datasetByLang = {};

  for (const lang of languages) {
    console.log(`\n=== Scanning ${lang.name} (${lang.code}) ===`);
    const asyncBuffer = makeAsyncBuffer(lang.file);
    const metadata = await parquetMetadataAsync(asyncBuffer);
    const totalRows = Number(metadata.header?.num_rows || metadata.num_rows || 97941);
    console.log(`Total rows in ${lang.file}: ${totalRows}`);

    manifest.splits[lang.code] = {
      file: path.relative(path.join(__dirname, '..'), lang.file),
      fileSizeBytes: asyncBuffer.byteLength,
      totalRows: totalRows,
      numRowGroups: metadata.row_groups?.length || 1
    };

    // Read first row group (typically 1000-5000 rows, fast)
    let extractedRows = [];
    await parquetRead({
      file: asyncBuffer,
      rowFormat: 'object',
      rowGroup: 0,
      onComplete: (rows) => {
        extractedRows = rows;
      }
    });

    console.log(`Loaded row group 0 with ${extractedRows.length} rows.`);

    // Extract 20 deterministic queries with all passages (gold + non-gold)
    const queries = [];
    const passages = [];

    for (let i = 0; i < Math.min(20, extractedRows.length); i++) {
      const r = extractedRows[i];
      const queryId = `msmarco-xi-${lang.code}-q${i + 1}`;
      const queryText = r.query || r.Query || '';
      const answer = r.Answer || r.answer || (r.answers && r.answers[0]) || '';
      const pObj = r.passages || {};
      const passageTexts = pObj.Translated_passages || pObj.passage_text || [];
      const isSelected = pObj.is_selected || [];

      const goldIdxs = [];
      const queryPassages = [];

      for (let p = 0; p < passageTexts.length; p++) {
        const pText = passageTexts[p];
        if (!pText || pText.trim().length === 0) continue;
        const selected = isSelected[p] === 1 || isSelected[p] === true || isSelected[p] === '1';
        if (selected) goldIdxs.push(p);

        const passageId = `${queryId}-p${p + 1}`;
        const pRecord = {
          passageId,
          docId: `doc-${lang.code}-${i + 1}-${p + 1}`,
          queryId,
          text: pText.trim(),
          isSelected: selected,
          language: lang.code,
          languageName: lang.name,
          source: 'ai4bharat/MSMARCO-XI'
        };
        passages.push(pRecord);
        queryPassages.push(pRecord);
      }

      queries.push({
        queryId,
        query: queryText,
        answer,
        goldIndices: goldIdxs,
        language: lang.code,
        languageName: lang.name,
        numPassages: queryPassages.length
      });
    }

    datasetByLang[lang.code] = {
      language: lang.code,
      languageName: lang.name,
      queries,
      passages
    };

    console.log(`Extracted for ${lang.name}: ${queries.length} queries, ${passages.length} passages.`);

    // If Hindi, also extract official English subset
    if (lang.code === 'hi') {
      console.log(`\n=== Extracting Official English MSMARCO from hinval.parquet ===`);
      const enQueries = [];
      const enPassages = [];

      for (let i = 0; i < Math.min(20, extractedRows.length); i++) {
        const r = extractedRows[i];
        const queryId = `msmarco-xi-en-q${i + 1}`;
        const queryText = r.Eng_Query || r.eng_query || '';
        const answer = r.Eng_Answer || r.eng_answer || '';
        const pObj = r.passages || {};
        const passageTexts = pObj.English_passages || [];
        const isSelected = pObj.is_selected || [];

        if (!queryText) continue;

        const goldIdxs = [];
        const queryPassages = [];

        for (let p = 0; p < passageTexts.length; p++) {
          const pText = passageTexts[p];
          if (!pText || pText.trim().length === 0) continue;
          const selected = isSelected[p] === 1 || isSelected[p] === true || isSelected[p] === '1';
          if (selected) goldIdxs.push(p);

          const passageId = `${queryId}-p${p + 1}`;
          const pRecord = {
            passageId,
            docId: `doc-en-${i + 1}-${p + 1}`,
            queryId,
            text: pText.trim(),
            isSelected: selected,
            language: 'en',
            languageName: 'English',
            source: 'ai4bharat/MSMARCO-XI (Official English MSMARCO)'
          };
          enPassages.push(pRecord);
          queryPassages.push(pRecord);
        }

        enQueries.push({
          queryId,
          query: queryText,
          answer,
          goldIndices: goldIdxs,
          language: 'en',
          languageName: 'English',
          numPassages: queryPassages.length
        });
      }

      datasetByLang['en'] = {
        language: 'en',
        languageName: 'English',
        queries: enQueries,
        passages: enPassages
      };

      console.log(`Extracted for English: ${enQueries.length} queries, ${enPassages.length} passages.`);
    }
  }

  // Summary counts
  let totalQueries = 0;
  let totalPassages = 0;
  manifest.languages = {};

  for (const [lCode, data] of Object.entries(datasetByLang)) {
    totalQueries += data.queries.length;
    totalPassages += data.passages.length;
    manifest.languages[lCode] = {
      languageName: data.languageName,
      queryCount: data.queries.length,
      passageCount: data.passages.length,
      sampleQuery: data.queries[0]?.query || '',
      sampleAnswer: data.queries[0]?.answer || ''
    };
  }

  manifest.total_queries = totalQueries;
  manifest.total_passages = totalPassages;

  // Save files
  const manifestPath = path.join(PROCESSED_DIR, 'dataset_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Manifest written to: ${manifestPath}`);

  const subsetPath = path.join(PROCESSED_DIR, 'msmarco_xi_5lang_subset.json');
  fs.writeFileSync(subsetPath, JSON.stringify(datasetByLang, null, 2));
  console.log(`✓ Multilingual subset written to: ${subsetPath}`);
}

inspectAndExtract().catch(err => {
  console.error('Extraction error:', err);
  process.exit(1);
});
