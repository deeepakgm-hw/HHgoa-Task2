const path = require('path');
const fs = require('fs');

const vectorStorePath = path.join(__dirname, 'data/vector_store.json');
const rawData = JSON.parse(fs.readFileSync(vectorStorePath, 'utf8'));

// Let's compute cosine similarity with a sample query or look at lexical/BM25 scores
const query = "Who is India Prime Minister?";
const queryTerms = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2);
console.log('Query terms:', queryTerms);

const scored = rawData.map(item => {
  const text = item.chunk.text.toLowerCase();
  const matches = queryTerms.filter(t => text.includes(t));
  return {
    id: item.chunk.id,
    queryId: item.chunk.metadata.queryId,
    lang: item.chunk.metadata.language,
    text: item.chunk.text.substring(0, 100),
    matches
  };
}).filter(x => x.matches.length > 0);

console.log(`\nFound ${scored.length} chunks with any keyword match:`);
scored.forEach(s => {
  console.log(`- ID: ${s.id} | Matches: [${s.matches.join(', ')}] | Lang: ${s.lang} | Text: "${s.text}..."`);
});
