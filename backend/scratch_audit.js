const path = require('path');
const fs = require('fs');

const vectorStorePath = path.join(__dirname, 'data/vector_store.json');
const rawData = JSON.parse(fs.readFileSync(vectorStorePath, 'utf8'));

console.log(`Vector Store has ${rawData.length} items.`);

const chunks = rawData.map(item => item.chunk);

// Let's inspect chunks mentioning Comey, India, Prime Minister
const comeyChunks = chunks.filter(c => c.text && c.text.toLowerCase().includes('comey'));
console.log(`\nComey chunks count: ${comeyChunks.length}`);
comeyChunks.forEach(c => {
  console.log(`ID: ${c.id} | QueryId: ${c.metadata && c.metadata.queryId} | Lang: ${c.metadata && c.metadata.language} | Text: ${c.text.substring(0, 150)}`);
});

const indiaChunks = chunks.filter(c => c.text && c.text.toLowerCase().includes('india'));
console.log(`\nIndia chunks count: ${indiaChunks.length}`);
indiaChunks.forEach(c => {
  console.log(`ID: ${c.id} | QueryId: ${c.metadata && c.metadata.queryId} | Lang: ${c.metadata && c.metadata.language} | Text: ${c.text.substring(0, 150)}`);
});

// Let's check what queries are in the dataset subset!
const subsetPath = path.join(__dirname, 'data/msmarco-xi/msmarco_xi_5lang_subset.json');
if (fs.existsSync(subsetPath)) {
  const subset = JSON.parse(fs.readFileSync(subsetPath, 'utf8'));
  console.log('\n--- Queries in 5-language subset ---');
  for (const lang of Object.keys(subset)) {
    console.log(`\n[${lang.toUpperCase()}] ${subset[lang].length} queries:`);
    subset[lang].forEach((q, i) => {
      console.log(`  ${i+1}. [QID: ${q.queryId}] "${q.query}" (Eng: "${q.engQuery}") -> Passages: ${q.passages.length}`);
    });
  }
}
