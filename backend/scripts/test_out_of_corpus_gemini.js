const http = require('http');

const testQueries = [
  "Who is the Prime Minister of India?",
  "What is photosynthesis?",
  "गोवा में सबसे अच्छा समुद्र तट कौन सा है?",
  "ಭಾರತದ ಪ್ರಧಾನಿ ಯಾರು?",
  "இந்தியாவின் பிரதமர் யார்?",
  "భారత ప్రధానమంత్రి ఎవరు?"
];

function queryServer(q) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ query: q, strategy: 'semantic', rerank: true });
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log("TESTING OUT-OF-CORPUS GENERAL KNOWLEDGE QUERIES");
  for (const q of testQueries) {
    console.log(`\nQuery: "${q}"`);
    const res = await queryServer(q);
    console.log(`  • Status:     ${res.status}`);
    console.log(`  • Mode:       ${res.mode}`);
    console.log(`  • Source:     ${res.source}`);
    console.log(`  • Answer:     "${res.answer}"`);
    console.log(`  • Disclosure: "${res.disclosure}"`);
  }
}

runTest();
