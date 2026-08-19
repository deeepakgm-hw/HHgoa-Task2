const path = require('path');
const fs = require('fs');

const vectorStorePath = path.join(__dirname, 'data/vector_store.json');
const store = JSON.parse(fs.readFileSync(vectorStorePath, 'utf8'));

// Reconstruct simple cosine similarity
function cosine(v1, v2) {
  let dot = 0;
  for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
  return dot;
}

const STOP_WORDS = new Set([
  'what', 'is', 'a', 'an', 'the', 'in', 'of', 'to', 'for', 'on', 'with', 'at', 'by', 'from',
  'and', 'or', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'why', 'how', 'where', 'when', 'who', 'which', 'whom', 'whose', 'this', 'that', 'these', 'those'
]);

function keywordScore(query, text) {
  const norm = t => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const qWords = norm(query).filter(w => !STOP_WORDS.has(w));
  if (qWords.length === 0) return 0;
  const tWords = new Set(norm(text));
  let m = 0;
  for (const w of qWords) {
    if (tWords.has(w) || text.toLowerCase().includes(w)) m++;
  }
  return m / qWords.length;
}

// In-domain queries from English subset
const inDomainQueries = [
  "what is a corporation?",
  "obligation to endure silent spring",
  "low potassium foods kidney disease",
  "what is a dog's normal body temperature",
  "what is integrity in the workplace"
];

// Out-of-domain queries
const outOfDomainQueries = [
  "Who is India Prime Minister?",
  "How to bake a chocolate cake?",
  "What is the capital of Australia?",
  "Who won the 2022 FIFA World Cup?",
  "How does photosynthesis work?"
];

console.log('=== EVALUATING IN-DOMAIN QUERIES ===');
for (const q of inDomainQueries) {
  // Let's compute keyword score against all chunks
  let bestVec = 0;
  let bestLex = 0;
  let bestHybrid = 0;
  let bestChunk = null;

  for (const item of store) {
    if (item.chunk.metadata.language !== 'en') continue;
    const lex = keywordScore(q, item.chunk.text);
    if (lex > bestLex) bestLex = lex;
    const hyb = 0.75 * 0.7 + 0.25 * lex; // approx vector
    if (hyb > bestHybrid) {
      bestHybrid = hyb;
      bestChunk = item.chunk;
    }
  }
  console.log(`[IN-DOMAIN] "${q}" -> Best Lex: ${bestLex.toFixed(3)} | Best Chunk: ${bestChunk.id} ("${bestChunk.text.substring(0, 60)}...")`);
}

console.log('\n=== EVALUATING OUT-OF-DOMAIN QUERIES ===');
for (const q of outOfDomainQueries) {
  let bestLex = 0;
  let bestChunk = null;

  for (const item of store) {
    if (item.chunk.metadata.language !== 'en') continue;
    const lex = keywordScore(q, item.chunk.text);
    if (lex > bestLex) {
      bestLex = lex;
      bestChunk = item.chunk;
    }
  }
  console.log(`[OUT-OF-DOMAIN] "${q}" -> Best Lex: ${bestLex.toFixed(3)} | Best Chunk: ${bestChunk ? bestChunk.id : 'none'}`);
}
