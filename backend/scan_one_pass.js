const fs = require('fs');
const path = require('path');
const { parquetRead, parquetMetadata } = require('./node_modules/hyparquet');
const { compressors } = require('./node_modules/hyparquet-compressors');

async function scanOnePass() {
  const parquetPath = path.join(__dirname, 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
  console.log('Loading parquet buffer into memory...');
  const buffer = fs.readFileSync(parquetPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  console.log('Reading parquet metadata...');
  const metadata = parquetMetadata(arrayBuffer);
  const totalRows = Number(metadata.num_rows);
  console.log('Total rows:', totalRows);
  console.log('Schema:', metadata.schema.map(s => s.name));

  const capitalMatches = [];
  const tajMatches = [];
  const validAnswerableQueries = [];

  let count = 0;
  console.log('Scanning rows via single-pass onRows...');

  await parquetRead({
    file: arrayBuffer,
    compressors,
    onRows: (rows) => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const query = r[0] || '';
        const passages = r[1] || {};
        const qId = r[2] || '';
        const queryStr = String(query);

        count++;
        if (count % 10000 === 0) {
          process.stdout.write(`Processed ${count}/${totalRows} rows...\r`);
        }

        const isSelected = passages.is_selected || [];
        const hasPositiveRelevance = isSelected.some(v => v === 1);

        if (hasPositiveRelevance) {
          validAnswerableQueries.push({
            index: count - 1,
            query_id: qId,
            query: queryStr,
            selected_count: isSelected.filter(v => v === 1).length,
            passages_count: passages.Translated_passages ? passages.Translated_passages.length : 0
          });
        }

        if (queryStr.includes('राजधानी') || queryStr.includes('capital') || queryStr.includes('भारत')) {
          capitalMatches.push({ index: count - 1, query: queryStr, passages });
        }
        if (queryStr.includes('ताजमहल') || queryStr.includes('ताज महल') || queryStr.includes('आगरा')) {
          tajMatches.push({ index: count - 1, query: queryStr, passages });
        }
      }
    }
  });

  console.log(`\nScan complete! Total rows scanned: ${count}`);
  console.log(`Total answerable queries (is_selected has 1): ${validAnswerableQueries.length}`);
  console.log(`Found ${capitalMatches.length} queries matching राजधानी/भारत`);
  console.log(`Found ${tajMatches.length} queries matching ताजमहल/आगरा`);

  fs.writeFileSync('data/msmarco-xi/processed/parquet_scan_summary.json', JSON.stringify({
    totalRows: count,
    answerableCount: validAnswerableQueries.length,
    capitalMatches: capitalMatches.slice(0, 50),
    tajMatches: tajMatches.slice(0, 50),
    sampleAnswerable: validAnswerableQueries.slice(0, 100)
  }, null, 2), 'utf8');

  console.log('Saved summary to data/msmarco-xi/processed/parquet_scan_summary.json');
}

scanOnePass().catch(console.error);
