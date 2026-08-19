const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const payload = JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] });

async function req(i) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
    }, (res) => {
      resolve({ i, status: res.statusCode, time: Date.now() - start });
    });
    req.write(payload);
    req.end();
  });
}

async function run() {
  const p = [];
  for(let i=0; i<25; i++) p.push(req(i));
  const results = await Promise.all(p);
  const tooMany = results.filter(r => r.status === 429).length;
  console.log(`25 requests sent. ${results.filter(r => r.status === 200).length} OK, ${tooMany} Rate Limited (429).`);
  if (tooMany > 0) console.log("Conclusion: FREE TIER (15 RPM limit hit)");
  else console.log("Conclusion: PAID TIER / ENTERPRISE (Rate limit > 15 RPM)");
}
run();
