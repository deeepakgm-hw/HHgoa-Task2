const http = require('http');

const queries = [
  { lang: 'en', q: 'what is a corporation?' },
  { lang: 'hi', q: 'कॉर्पोरेशन क्या है?' },
  { lang: 'hi', q: 'स्टाई कारण होता है' },
  { lang: 'kn', q: '. ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?' },
  { lang: 'ta', q: 'கார்ப்பரேஷன் என்றால் என்ன?' },
  { lang: 'te', q: 'కార్పొరేషన్ అంటే ఏమిటి?' }
];

function sendQuery(q, lang) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      query: q,
      languageCode: lang,
      strategy: 'semantic',
      rerank: true
    });

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
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function verifyAll() {
  console.log("===============================================================================");
  console.log("VERIFYING DATASET RETRIEVAL AND GROUNDED ANSWER GENERATION ACROSS ALL LANGUAGES");
  console.log("===============================================================================\n");

  for (const item of queries) {
    console.log(`[${item.lang.toUpperCase()}] Query: "${item.q}"`);
    const t0 = Date.now();
    try {
      const res = await sendQuery(item.q, item.lang);
      const latency = Date.now() - t0;
      console.log(`  • Status:     ${res.status}`);
      console.log(`  • Latency:    ${latency} ms`);
      console.log(`  • Sources:    ${res.sources ? res.sources.length : 0} cited`);
      console.log(`  • Answer:     "${(res.answer || '').substring(0, 180)}..."\n`);
    } catch (e) {
      console.error(`  ✕ Error: ${e.message}\n`);
    }
  }
}

verifyAll().catch(console.error);
