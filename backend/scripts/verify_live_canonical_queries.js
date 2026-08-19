const http = require('http');

const queriesToTest = [
  // 1. Hindi Gold Query
  {
    language: 'hi',
    languageName: 'Hindi',
    query: 'कॉर्पोरेशन क्या है?',
    expectedAnswerSubstring: 'निगम',
    expectedGoldPassageSubstring: 'मैकडॉनल्ड कॉर्पोरेशन'
  },
  // 2. Hindi Stye Query
  {
    language: 'hi',
    languageName: 'Hindi',
    query: 'स्टाई कारण होता है',
    expectedAnswerSubstring: 'गुहांजनी',
    expectedGoldPassageSubstring: 'गुहेरी आम तौर पर पलक'
  },
  // 3. Kannada Gold Query
  {
    language: 'kn',
    languageName: 'Kannada',
    query: '. ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?',
    expectedAnswerSubstring: 'ನಿಗಮವು',
    expectedGoldPassageSubstring: 'ಮೆಕ್‌ಡೊನಾಲ್ಡ್ಸ್ ಕಾರ್ಪೊರೇಷನ್'
  },
  // 4. Tamil Gold Query
  {
    language: 'ta',
    languageName: 'Tamil',
    query: 'கார்ப்பரேஷன் என்றால் என்ன?',
    expectedAnswerSubstring: 'கூட்டுத்தாபனம்',
    expectedGoldPassageSubstring: 'மெக்டொனால்ட்ஸ் கார்ப்பரேஷன்'
  },
  // 5. Telugu Gold Query
  {
    language: 'te',
    languageName: 'Telugu',
    query: 'కార్పొరేషన్ అంటే ఏమిటి?',
    expectedAnswerSubstring: 'కార్పొరేషన్',
    expectedGoldPassageSubstring: 'మెక్‌డొనాల్డ్స్ కార్పొరేషన్'
  },
  // 6. English Gold Query
  {
    language: 'en',
    languageName: 'English',
    query: '. what is a corporation?',
    expectedAnswerSubstring: 'corporation',
    expectedGoldPassageSubstring: "McDonald's Corporation"
  },
  // 7. Out-of-Corpus Fallback Query (True Negative testing Gemini Fallback)
  {
    language: 'hi',
    languageName: 'Hindi (Out-of-Corpus / Fallback)',
    query: 'गोवा में सबसे अच्छा समुद्र तट कौन सा है?',
    expectedAnswerSubstring: 'गोवा',
    isOutOfCorpus: true
  }
];

function sendPost(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ rawBody: body, statusCode: res.statusMessage });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runLiveAppVerification() {
  console.log('===============================================================================');
  console.log('LIVE RAGGOA ENDPOINT VERIFICATION (CANONICAL 7-QUERY PROOF-OF-LIFE TEST SET)');
  console.log('===============================================================================\n');

  for (let i = 0; i < queriesToTest.length; i++) {
    const item = queriesToTest[i];
    console.log(`[Test ${i + 1}/7] Testing ${item.languageName}: "${item.query}"...`);
    const t0 = Date.now();
    try {
      const response = await sendPost({
        query: item.query,
        languageCode: item.language,
        strategy: 'semantic'
      });
      const latencyMs = Date.now() - t0;

      const pathUsed = response.executionPath || (response.debugInfo?.executionPath) || 'UNKNOWN';
      const answer = response.answer || response.response || '';
      const citations = response.citations || [];
      const topChunk = citations[0]?.text || '';
      const isGoldRank1 = item.expectedGoldPassageSubstring
        ? topChunk.includes(item.expectedGoldPassageSubstring)
        : false;

      console.log(`  • Execution Path: ${pathUsed}`);
      console.log(`  • Latency:        ${latencyMs} ms`);
      console.log(`  • Grounded Rank 1 Gold Passage: ${isGoldRank1 ? '✓ YES (Strict Gold Hit)' : (item.isOutOfCorpus ? 'N/A (Intended Fallback)' : '⚠ Distractor/Alternative In-Cluster Passage')}`);
      console.log(`  • Answer Preview: "${answer.substring(0, 140)}..."\n`);
    } catch (err) {
      console.error(`  ✕ Error testing query: ${err.message}\n`);
    }
  }
}

runLiveAppVerification().catch(console.error);
