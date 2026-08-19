const fs = require('fs');
const path = require('path');
const { parquetRead, parquetMetadata } = require('./node_modules/hyparquet');
const { compressors } = require('./node_modules/hyparquet-compressors');

const filePath = path.join(__dirname, 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
const fileBuffer = fs.readFileSync(filePath);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

console.log('Reading columns from hinval.parquet...');

parquetRead({
  file: arrayBuffer,
  compressors,
  columns: ['query_id', 'Eng_Query', 'query', 'passages'],
  onComplete: (data) => {
    console.log(`Read ${data.length} rows successfully!`);
    const capitalRows = [];
    const tajRows = [];
    const answerableRows = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const qId = row[0];
      const engQ = String(row[1] || '').toLowerCase();
      const hiQ = String(row[2] || '');
      const passages = row[3] || {};

      const isSelected = (passages.is_selected || []).map(v => Number(v));
      const hasAnswer = isSelected.some(v => v === 1);

      if (hasAnswer) {
        answerableRows.push({ idx: i, qId, engQ, hiQ, isSelected });
      }

      if (
        engQ.includes('capital of india') || 
        engQ.includes('what is the capital of india') || 
        hiQ.includes('भारत की राजधानी') || 
        hiQ.includes('भारत का राजधानी') ||
        engQ.includes('delhi') ||
        hiQ.includes('नई दिल्ली')
      ) {
        capitalRows.push({ idx: i, qId, engQ, hiQ, passages, isSelected });
      }

      if (
        engQ.includes('taj mahal') || 
        hiQ.includes('ताजमहल') || 
        hiQ.includes('ताज महल') || 
        engQ.includes('agra') || 
        hiQ.includes('आगरा')
      ) {
        tajRows.push({ idx: i, qId, engQ, hiQ, passages, isSelected });
      }
    }

    console.log(`Total answerable rows (with relevant passages): ${answerableRows.length}`);
    console.log(`Capital of India matches: ${capitalRows.length}`);
    capitalRows.forEach(c => {
      console.log(`[Row ${c.idx}] Eng: "${c.engQ}" | Hi: "${c.hiQ}" | is_selected: [${c.isSelected.join(',')}]`);
      if (c.passages && c.passages.Translated_passages) {
        c.passages.Translated_passages.forEach((p, pIdx) => {
          if (c.isSelected[pIdx] === 1) {
            console.log(`   -> Relevant Passage [${pIdx}]: ${p.substring(0, 120)}...`);
          }
        });
      }
    });

    console.log(`Taj Mahal matches: ${tajRows.length}`);
    tajRows.slice(0, 5).forEach(t => {
      console.log(`[Row ${t.idx}] Eng: "${t.engQ}" | Hi: "${t.hiQ}" | is_selected: [${t.isSelected.join(',')}]`);
      if (t.passages && t.passages.Translated_passages) {
        t.passages.Translated_passages.forEach((p, pIdx) => {
          if (t.isSelected[pIdx] === 1) {
            console.log(`   -> Relevant Passage [${pIdx}]: ${p.substring(0, 120)}...`);
          }
        });
      }
    });

    // Save list of all discovered matches for building index
    fs.writeFileSync('data/msmarco-xi/processed/discovered_queries.json', JSON.stringify({
      capitalRows,
      tajRows,
      sampleAnswerable: answerableRows.slice(0, 50)
    }, null, 2), 'utf8');
    console.log('Saved data/msmarco-xi/processed/discovered_queries.json');
  }
});
