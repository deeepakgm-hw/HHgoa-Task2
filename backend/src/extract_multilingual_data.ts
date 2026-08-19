import fs from 'fs';
import path from 'path';
import { parquetMetadataAsync, parquetRead } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const DATA_DIR = path.join(__dirname, '../data/msmarco-xi');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

function createLocalAsyncBuffer(filePath: string) {
  const fd = fs.openSync(filePath, 'r');
  const stat = fs.fstatSync(fd);
  return {
    byteLength: stat.size,
    async slice(start: number, end?: number): Promise<ArrayBuffer> {
      const targetEnd = end ?? stat.size;
      const length = targetEnd - start;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length);
      return ab;
    }
  };
}

function bigintReplacer(_k: string, v: any) {
  return typeof v === 'bigint' ? Number(v) : v;
}

export async function extractAll5Languages() {
  console.log('=== MULTILINGUAL MSMARCO-XI EXTRACTION & MANIFEST GENERATOR ===\n');

  const languages = [
    { code: 'hi', name: 'Hindi', file: path.join(RAW_DIR, 'hi/hinval.parquet') },
    { code: 'kn', name: 'Kannada', file: path.join(RAW_DIR, 'kn/kanval.parquet') },
    { code: 'ta', name: 'Tamil', file: path.join(RAW_DIR, 'ta/tamval.parquet') },
    { code: 'te', name: 'Telugu', file: path.join(RAW_DIR, 'te/telval.parquet') }
  ];

  const manifest: Record<string, any> = {
    source: 'ai4bharat/MSMARCO-XI',
    targetLanguages: ['en', 'hi', 'kn', 'ta', 'te'],
    splits: {},
    processedSubsets: {},
    generatedAt: new Date().toISOString()
  };

  const datasetByLang: Record<string, any> = {};

  for (const lang of languages) {
    console.log(`Scanning ${lang.name} (${lang.code}) from ${lang.file}...`);
    const asyncBuffer = createLocalAsyncBuffer(lang.file);
    const metadata = await parquetMetadataAsync(asyncBuffer);
    const totalRows = Number((metadata as any).num_rows || 97941);

    manifest.splits[lang.code] = {
      file: path.relative(path.join(__dirname, '..'), lang.file),
      fileSizeBytes: asyncBuffer.byteLength,
      totalRows: totalRows,
      numRowGroups: metadata.row_groups?.length || 1
    };

    console.log(`  File size: ${(asyncBuffer.byteLength / 1024 / 1024).toFixed(2)} MB, total rows: ${totalRows}`);

    // Read first 25 rows with compressors
    const rows: any[] = [];
    await (parquetRead as any)({
      file: asyncBuffer,
      compressors,
      rowFormat: 'object',
      rowStart: 0,
      rowEnd: 25,
      onComplete: (readRows: any[]) => {
        rows.push(...readRows);
      }
    });

    console.log(`  Decoded ${rows.length} rows with Snappy decompressor.`);

    // Extract queries with at least 1 selected gold passage, target 15 queries per language
    const filteredRows = rows.filter(r => {
      const isSel = r.passages?.is_selected || [];
      return isSel.some((s: any) => s === 1 || s === true || s === '1');
    }).slice(0, 15);

    console.log(`  Selected ${filteredRows.length} high-quality gold-grounded queries.`);

    const langQueries: any[] = [];
    const langPassages: any[] = [];

    for (let i = 0; i < filteredRows.length; i++) {
      const r = filteredRows[i];
      const queryId = `msmarco-xi-${lang.code}-q${i + 1}`;
      const queryText = r.query || r.Query || '';
      const answer = r.Answer || r.answer || (r.answers && r.answers[0]) || '';
      const pObj = r.passages || {};
      const passageTexts = pObj.Translated_passages || pObj.passage_text || [];
      const isSelected = pObj.is_selected || [];

      const goldIdxs: number[] = [];
      const queryPassages: any[] = [];

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
        langPassages.push(pRecord);
        queryPassages.push(pRecord);
      }

      langQueries.push({
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
      queries: langQueries,
      passages: langPassages
    };

    console.log(`  ✓ Extracted for ${lang.name}: ${langQueries.length} queries, ${langPassages.length} passages.`);

    // If Hindi, extract official English MSMARCO records
    if (lang.code === 'hi') {
      console.log(`\nExtracting Official English MSMARCO records from hinval.parquet...`);
      const enQueries: any[] = [];
      const enPassages: any[] = [];

      for (let i = 0; i < filteredRows.length; i++) {
        const r = filteredRows[i];
        const queryId = `msmarco-xi-en-q${i + 1}`;
        const queryText = r.Eng_Query || r.eng_query || '';
        const answer = r.Eng_Answer || r.eng_answer || '';
        const pObj = r.passages || {};
        const passageTexts = pObj.English_passages || [];
        const isSelected = pObj.is_selected || [];

        if (!queryText) continue;

        const goldIdxs: number[] = [];
        const queryPassages: any[] = [];

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

      console.log(`  ✓ Extracted for English: ${enQueries.length} queries, ${enPassages.length} passages.`);
    }
  }

  // Calculate totals and manifest metadata
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

  console.log('\n=== EXTRACTION COMPLETE ===');
}

extractAll5Languages().catch(err => {
  console.error('Fatal extraction error:', err);
  process.exit(1);
});
