const fs = require('fs');
const path = require('path');
const { parquetRead } = require('./node_modules/hyparquet');
const { compressors } = require('./node_modules/hyparquet-compressors');

const filePath = path.join(__dirname, 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
const fileBuffer = fs.readFileSync(filePath);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

console.log('Searching all 97,941 rows for passage keywords...');

parquetRead({
  file: arrayBuffer,
  compressors,
  columns: ['query_id', 'Eng_Query', 'query', 'passages'],
  onComplete: (data) => {
    console.log(`Scanning passages in ${data.length} rows...`);
    const capitalPassageRows = [];
    const tajPassageRows = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const qId = Number(row[0]);
      const engQ = String(row[1] || '');
      const hiQ = String(row[2] || '');
      const passages = row[3] || {};

      const trPassages = passages.Translated_passages || [];
      const isSelected = (passages.is_selected || []).map(v => Number(v));

      for (let pIdx = 0; pIdx < trPassages.length; pIdx++) {
        const pText = trPassages[pIdx] || '';
        if (pText.includes('राजधानी') && (pText.includes('भारत') || pText.includes('दिल्ली') || pText.includes('New Delhi') || pText.includes('नई दिल्ली'))) {
          capitalPassageRows.push({
            rowIdx: i,
            qId,
            engQ,
            hiQ,
            pIdx,
            isSelected: isSelected[pIdx],
            passage: pText
          });
        }

        if (pText.includes('ताजमहल') || pText.includes('ताज महल') || (pText.includes('Taj Mahal') && pText.includes('Agra'))) {
          tajPassageRows.push({
            rowIdx: i,
            qId,
            engQ,
            hiQ,
            pIdx,
            isSelected: isSelected[pIdx],
            passage: pText
          });
        }
      }
    }

    console.log(`\nFound ${capitalPassageRows.length} passages mentioning 'राजधानी + भारत/दिल्ली':`);
    capitalPassageRows.forEach(c => {
      console.log(`[Row ${c.rowIdx}] Q: "${c.hiQ}" (Eng: "${c.engQ}") | isSelected: ${c.isSelected}`);
      console.log(`   -> Passage: ${c.passage.substring(0, 160)}...`);
    });

    console.log(`\nFound ${tajPassageRows.length} passages mentioning 'ताजमहल':`);
    tajPassageRows.forEach(t => {
      console.log(`[Row ${t.rowIdx}] Q: "${t.hiQ}" (Eng: "${t.engQ}") | isSelected: ${t.isSelected}`);
      console.log(`   -> Passage: ${t.passage.substring(0, 160)}...`);
    });

    // Also find other capital queries in the dataset
    const allCapitalQueries = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const engQ = String(row[1] || '').toLowerCase();
      const hiQ = String(row[2] || '');
      const passages = row[3] || {};
      const isSelected = (passages.is_selected || []).map(v => Number(v));

      if ((engQ.startsWith('what is the capital') || engQ.startsWith('capital of') || hiQ.includes('की राजधानी')) && isSelected.some(v => v === 1)) {
        allCapitalQueries.push({
          rowIdx: i,
          qId: Number(row[0]),
          engQ,
          hiQ,
          selectedPassages: (passages.Translated_passages || []).filter((_, idx) => isSelected[idx] === 1)
        });
      }
    }

    console.log(`\nTotal Answerable Capital Queries in MSMARCO-XI validation set: ${allCapitalQueries.length}`);
    allCapitalQueries.slice(0, 20).forEach(q => {
      console.log(`[Row ${q.rowIdx}] "${q.hiQ}" (Eng: "${q.engQ}")`);
      q.selectedPassages.forEach(p => console.log(`   -> ${p.substring(0, 120)}...`));
    });
  }
});
