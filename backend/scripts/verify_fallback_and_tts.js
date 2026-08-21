const http = require('http');

const generalKnowledgeQueries = [
  { lang: 'en', q: 'Who is the Prime Minister of India?' },
  { lang: 'hi', q: 'गोवा में सबसे अच्छा समुद्र तट कौन सा है?' },
  { lang: 'kn', q: 'ಭಾರತದ ಪ್ರಧಾನಿ ಯಾರು?' },
  { lang: 'ta', q: 'இந்தியாவின் பிரதமர் யார்?' },
  { lang: 'te', q: 'భారత ప్రధానమంత్రి ఎవరు?' }
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

function sendTTS(text, lang) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: text,
      languageCode: lang
    });

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/tts',
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
  console.log("1. TESTING GEMINI GENERAL KNOWLEDGE FALLBACK ACROSS ALL LANGUAGES");
  console.log("===============================================================================\n");

  for (const item of generalKnowledgeQueries) {
    const t0 = Date.now();
    const res = await sendQuery(item.q, item.lang);
    const latency = Date.now() - t0;
    console.log(`[${item.lang.toUpperCase()}] Query: "${item.q}"`);
    console.log(`  • Status:     ${res.status} | Mode: ${res.mode} | Source: ${res.source}`);
    console.log(`  • Latency:    ${latency} ms`);
    console.log(`  • Answer:     "${res.answer}"`);
    console.log(`  • Disclosure: "${res.disclosure}"\n`);
  }

  console.log("===============================================================================");
  console.log("2. TESTING /api/tts MULTILINGUAL SPOKEN AUDIO (SARVAM BULBUL TTS)");
  console.log("===============================================================================\n");

  const ttsSamples = [
    { lang: 'hi-IN', text: 'गोवा के सबसे लोकप्रिय समुद्र तटों में बागा और कैलंग्यूट शामिल हैं।' },
    { lang: 'kn-IN', text: 'ಭಾರತದ ಪ್ರಸ್ತುತ ಪ್ರಧಾನ ಮಂತ್ರಿ ನರೇಂದ್ರ ಮೋದಿ.' },
    { lang: 'ta-IN', text: 'இந்தியாவின் தற்போதைய பிரதமர் நரேந்திர மோடி ஆவார்.' },
    { lang: 'te-IN', text: 'ప్రస్తుత భారత ప్రధానమంత్రి నరేంద్ర మోదీ.' },
    { lang: 'en-IN', text: 'The current Prime Minister of India is Narendra Modi.' }
  ];

  for (const s of ttsSamples) {
    const t0 = Date.now();
    const res = await sendTTS(s.text, s.lang);
    const latency = Date.now() - t0;
    console.log(`[${s.lang}] Spoken Voice Synthesis:`);
    console.log(`  • Latency:    ${latency} ms`);
    console.log(`  • Status:     ${res.status}`);
    console.log(`  • Audio Size: ${res.audio ? res.audio.length : 0} base64 chars\n`);
  }
}

verifyAll().catch(console.error);
