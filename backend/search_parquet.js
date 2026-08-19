const fs = require('fs');
const path = require('path');
const { parquetRead, parquetMetadata } = require('./node_modules/hyparquet');
const { compressors } = require('./node_modules/hyparquet-compressors');

async function search() {
  const parquetPath = path.join(__dirname, 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
  console.log('Loading parquet buffer...');
  const buffer = fs.readFileSync(parquetPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const metadata = parquetMetadata(arrayBuffer);
  const totalRows = Number(metadata.num_rows);
  console.log('Total rows in hinval.parquet:', totalRows);
  console.log('Row groups count:', metadata.row_groups.length);

  const capitalMatches = [];
  const tajMatches = [];
  const selectedQueries = [];

  // Read in batches of 5000 rows
  const batchSize = 5000;
  for (let start = 0; start < totalRows; start += batchSize) {
    const end = Math.min(start + batchSize, totalRows);
    process.stdout.write(`Scanning rows ${start} to ${end} of ${totalRows}...\r`);
    
    await parquetRead({
      file: arrayBuffer,
      compressors,
      rowStart: start,
      rowEnd: end,
      onComplete: (rows) => {
        rows.forEach((r, idx) => {
          const globalIdx = start + idx;
          // r is an array of columns: [query, passages, query_id] or object
          const query = r[0] || (r.query) || '';
          const passages = r[1] || (r.passages) || {};
          const queryStr = String(query);

          if (queryStr.includes('राजधानी') || queryStr.includes('राजधानी क्या') || queryStr.includes('भारत की राजधानी') || queryStr.includes('भारत का राजधानी')) {
            capitalMatches.push({ index: globalIdx, query: queryStr, passages });
          }
          if (queryStr.includes('ताजमहल') || queryStr.includes('ताज महल') || queryStr.includes('आगरा')) {
            tajMatches.push({ index: globalIdx, query: queryStr, passages });
          }
        });
      }
    });
  }

  console.log('\n\n=== SCAN COMPLETED ===');
  console.log(`Found ${capitalMatches.length} queries matching 'राजधानी':`);
  capitalMatches.slice(0, 15).forEach(m => {
    console.log(`[Row ${m.index}] Query: "${m.query}" (Passages: ${m.passages?.Translated_passages?.length || 0}, is_selected: ${JSON.stringify(m.passages?.is_selected || [])})`);
  });

  console.log(`\nFound ${tajMatches.length} queries matching 'ताजमहल / आगरा':`);
  tajMatches.slice(0, 15).forEach(m => {
    console.log(`[Row ${m.index}] Query: "${m.query}" (Passages: ${m.passages?.Translated_passages?.length || 0}, is_selected: ${JSON.stringify(m.passages?.is_selected || [])})`);
  });

  // Save the full list of capital and taj matches for index construction
  fs.writeFileSync('data/msmarco-xi/processed/found_target_queries.json', JSON.stringify({ capitalMatches, tajMatches }, null, 2), 'utf8');
}

search().catch(console.error);
