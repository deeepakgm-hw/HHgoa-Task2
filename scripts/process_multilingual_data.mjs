import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetRead } from 'hyparquet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.join(__dirname, '../backend/data/msmarco-xi');
const RAW_DIR = path.join(BASE_DIR, 'raw');
const PROCESSED_DIR = path.join(BASE_DIR, 'processed');

if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

function bigintReplacer(k, v) {
  return typeof v === 'bigint' ? Number(v) : v;
}

export async function parseParquetFile(filePath, maxRows = 20) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const records = [];
  await parquetRead({
    file: arrayBuffer,
    rowFormat: 'object',
    onComplete: (rows) => {
      // rows is an array of objects
      for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
        records.push(rows[i]);
      }
    }
  });

  return records;
}

export async function build5LanguageSubsets() {
  console.log('--- Processing 5 Official Language Datasets from MSMARCO-XI ---');

  const langConfigs = [
    { lang: 'hi', name: 'Hindi', file: path.join(RAW_DIR, 'hi/hinval.parquet') },
    { lang: 'kn', name: 'Kannada', file: path.join(RAW_DIR, 'kn/kanval.parquet') },
    { lang: 'ta', name: 'Tamil', file: path.join(RAW_DIR, 'ta/tamval.parquet') },
    { lang: 'te', name: 'Telugu', file: path.join(RAW_DIR, 'te/telval.parquet') }
  ];

  const datasetByLang = {};

  for (const cfg of langConfigs) {
    if (!fs.existsSync(cfg.file)) {
      console.warn(`File not found yet: ${cfg.file}`);
      continue;
    }
    console.log(`Reading ${cfg.name} (${cfg.lang}) from ${path.basename(cfg.file)}...`);
    const rawRows = await parseParquetFile(cfg.file, 20);
    console.log(`Parsed ${rawRows.length} rows for ${cfg.name}.`);

    const langQueries = [];
    const langPassages = [];

    for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
      const row = rawRows[rIdx];
      const queryId = row.query_id || `q_${cfg.lang}_${rIdx}`;
      const queryText = row.query || row.Query || '';
      const answer = row.Answer || row.answer || (row.answers && row.answers[0]) || '';
      const passagesObj = row.passages || {};
      const passageTexts = passagesObj.Translated_passages || passagesObj.passage_text || [];
      const isSelected = passagesObj.is_selected || [];

      langQueries.push({
        queryId,
        query: queryText,
        answer,
        goldIndices: isSelected.map((s, idx) => s === 1 || s === true ? idx : -1).filter(idx => idx !== -1)
      });

      for (let pIdx = 0; pIdx < passageTexts.length; pIdx++) {
        const text = passageTexts[pIdx];
        if (!text || text.trim().length === 0) continue;
        const selected = isSelected[pIdx] === 1 || isSelected[pIdx] === true;
        langPassages.push({
          passageId: `${queryId}_p${pIdx}`,
          queryId,
          text: text.trim(),
          isSelected: selected,
          language: cfg.lang,
          languageName: cfg.name,
          source: 'ai4bharat/MSMARCO-XI'
        });
      }
    }

    datasetByLang[cfg.lang] = {
      language: cfg.lang,
      languageName: cfg.name,
      queries: langQueries,
      passages: langPassages
    };
  }

  // Build English from the official English passages in hinval.parquet / kanval.parquet
  const hiFile = path.join(RAW_DIR, 'hi/hinval.parquet');
  if (fs.existsSync(hiFile)) {
    console.log('Extracting official English passages and queries...');
    const rawRows = await parseParquetFile(hiFile, 20);
    const enQueries = [];
    const enPassages = [];

    for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
      const row = rawRows[rIdx];
      const queryId = row.query_id || `q_en_${rIdx}`;
      const queryText = row.Eng_Query || row.eng_query || '';
      const answer = row.Eng_Answer || row.eng_answer || '';
      const passagesObj = row.passages || {};
      const passageTexts = passagesObj.English_passages || [];
      const isSelected = passagesObj.is_selected || [];

      if (!queryText) continue;

      enQueries.push({
        queryId,
        query: queryText,
        answer,
        goldIndices: isSelected.map((s, idx) => s === 1 || s === true ? idx : -1).filter(idx => idx !== -1)
      });

      for (let pIdx = 0; pIdx < passageTexts.length; pIdx++) {
        const text = passageTexts[pIdx];
        if (!text || text.trim().length === 0) continue;
        const selected = isSelected[pIdx] === 1 || isSelected[pIdx] === true;
        enPassages.push({
          passageId: `${queryId}_p${pIdx}`,
          queryId,
          text: text.trim(),
          isSelected: selected,
          language: 'en',
          languageName: 'English',
          source: 'ai4bharat/MSMARCO-XI (Official English MSMARCO)'
        });
      }
    }

    datasetByLang['en'] = {
      language: 'en',
      languageName: 'English',
      queries: enQueries,
      passages: enPassages
    };
  }

  const outPath = path.join(PROCESSED_DIR, 'msmarco_xi_5lang_subset.json');
  fs.writeFileSync(outPath, JSON.stringify(datasetByLang, bigintReplacer, 2));
  console.log(`\n✓ Generated multilingual dataset subset: ${outPath}`);

  return datasetByLang;
}
