import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetMetadataAsync, parquetRead } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data/msmarco-xi');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

function createLocalAsyncBuffer(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const stat = fs.fstatSync(fd);
  return {
    byteLength: stat.size,
    async slice(start, end) {
      const targetEnd = end ?? stat.size;
      const length = targetEnd - start;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length);
      return ab;
    }
  };
}

function bigintReplacer(_k, v) {
  return typeof v === 'bigint' ? Number(v) : v;
}

async function extractOneLanguage(code, name, filePath, rowEnd = 20) {
  console.log(`\n[${name} - ${code.toUpperCase()}] Opening ${filePath}...`);
  const asyncBuffer = createLocalAsyncBuffer(filePath);
  const metadata = await parquetMetadataAsync(asyncBuffer);
  const totalRows = Number(metadata.num_rows || 97941);
  console.log(`[${name}] Total rows: ${totalRows}, File size: ${(asyncBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  return new Promise((resolve, reject) => {
    parquetRead({
      file: asyncBuffer,
      compressors,
      rowFormat: 'object',
      rowStart: 0,
      rowEnd,
      onComplete: (readRows) => {
        try {
          console.log(`[${name}] Decoded ${readRows.length} rows.`);
          const queries = [];
          const passages = [];

          // Take up to 10 queries
          for (let i = 0; i < Math.min(10, readRows.length); i++) {
            const r = readRows[i];
            const queryId = `msmarco-xi-${code}-q${i + 1}`;
            const queryText = r.query || r.Query || '';
            const answer = r.Answer || r.answer || (r.answers && r.answers[0]) || '';
            const pObj = r.passages || {};
            const passageTexts = pObj.Translated_passages || pObj.passage_text || [];
            const isSelected = pObj.is_selected || [];

            const goldIdxs = [];
            const qPassages = [];

            for (let p = 0; p < passageTexts.length; p++) {
              const pText = passageTexts[p];
              if (!pText || pText.trim().length === 0) continue;
              const selected = Number(isSelected[p]) === 1;
              if (selected) goldIdxs.push(p);

              const passageId = `${queryId}-p${p + 1}`;
              const pRecord = {
                passageId,
                docId: `doc-${code}-${i + 1}-${p + 1}`,
                queryId,
                text: pText.trim(),
                isSelected: selected,
                language: code,
                languageName: name,
                source: 'ai4bharat/MSMARCO-XI'
              };
              passages.push(pRecord);
              qPassages.push(pRecord);
            }

            queries.push({
              queryId,
              query: queryText,
              answer,
              goldIndices: goldIdxs,
              language: code,
              languageName: name,
              numPassages: qPassages.length
            });
          }

          console.log(`[${name}] Extracted ${queries.length} queries and ${passages.length} passages.`);

          let enData = null;
          if (code === 'hi') {
            console.log(`[English] Extracting English MSMARCO from hinval.parquet...`);
            const enQueries = [];
            const enPassages = [];

            for (let i = 0; i < Math.min(10, readRows.length); i++) {
              const r = readRows[i];
              const queryId = `msmarco-xi-en-q${i + 1}`;
              const queryText = r.Eng_Query || r.eng_query || '';
              const answer = r.Eng_Answer || r.eng_answer || '';
              const pObj = r.passages || {};
              const passageTexts = pObj.English_passages || [];
              const isSelected = pObj.is_selected || [];

              if (!queryText) continue;

              const goldIdxs = [];
              const qPassages = [];

              for (let p = 0; p < passageTexts.length; p++) {
                const pText = passageTexts[p];
                if (!pText || pText.trim().length === 0) continue;
                const selected = Number(isSelected[p]) === 1;
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
                qPassages.push(pRecord);
              }

              enQueries.push({
                queryId,
                query: queryText,
                answer,
                goldIndices: goldIdxs,
                language: 'en',
                languageName: 'English',
                numPassages: qPassages.length
              });
            }

            enData = {
              language: 'en',
              languageName: 'English',
              queries: enQueries,
              passages: enPassages
            };
            console.log(`[English] Extracted ${enQueries.length} queries and ${enPassages.length} passages.`);
          }

          resolve({
            splitInfo: {
              file: path.relative(path.join(__dirname, '..'), filePath),
              fileSizeBytes: asyncBuffer.byteLength,
              totalRows,
              numRowGroups: metadata.row_groups?.length || 1
            },
            langData: {
              language: code,
              languageName: name,
              queries,
              passages
            },
            enData
          });
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

export async function run() {
  console.log('=== MULTILINGUAL MSMARCO-XI PARQUET EXTRACTION ===');

  const datasetByLang = {};
  const manifest = {
    source: 'ai4bharat/MSMARCO-XI',
    targetLanguages: ['en', 'hi', 'kn', 'ta', 'te'],
    splits: {},
    processedSubsets: {},
    generatedAt: new Date().toISOString()
  };

  const configs = [
    { code: 'hi', name: 'Hindi', file: path.join(RAW_DIR, 'hi/hinval.parquet') },
    { code: 'kn', name: 'Kannada', file: path.join(RAW_DIR, 'kn/kanval.parquet') },
    { code: 'ta', name: 'Tamil', file: path.join(RAW_DIR, 'ta/tamval.parquet') },
    { code: 'te', name: 'Telugu', file: path.join(RAW_DIR, 'te/telval.parquet') }
  ];

  for (const cfg of configs) {
    const res = await extractOneLanguage(cfg.code, cfg.name, cfg.file, 15);
    manifest.splits[cfg.code] = res.splitInfo;
    datasetByLang[cfg.code] = res.langData;
    if (res.enData) {
      datasetByLang['en'] = res.enData;
    }
  }

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
      sampleAnswer: data.queries[0]?.answer || '',
      samplePassage: data.passages[0]?.text?.slice(0, 100) || ''
    };
  }

  manifest.total_queries = totalQueries;
  manifest.total_passages = totalPassages;

  // Write manifest
  const manifestPath = path.join(PROCESSED_DIR, 'dataset_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, bigintReplacer, 2), 'utf8');
  console.log(`\n✓ Manifest written to: ${manifestPath}`);

  // Write 5-language subset
  const subsetPath = path.join(PROCESSED_DIR, 'msmarco_xi_5lang_subset.json');
  fs.writeFileSync(subsetPath, JSON.stringify(datasetByLang, bigintReplacer, 2), 'utf8');
  console.log(`✓ 5-Language dataset subset written to: ${subsetPath}`);

  console.log('\n=== ALL 5 LANGUAGES EXTRACTED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Fatal extraction error:', err);
  process.exit(1);
});
