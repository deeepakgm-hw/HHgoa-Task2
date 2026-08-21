const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');

const samples = [
  { lang: "hi-IN", text: "नमस्ते, कॉर्पोरेशन एक कानूनी इकाई है।" },
  { lang: "kn-IN", text: "ನಮಸ್ಕಾರ, ಕಾರ್ಪೊರೇಷನ್ ಒಂದು ಕಾನೂನುಬದ್ಧ ಸಂಸ್ಥೆಯಾಗಿದೆ." },
  { lang: "ta-IN", text: "வணக்கம், பெருநிறுவனம் என்பது ஒரு சட்டப்பூர்வ அமைப்பாகும்." },
  { lang: "te-IN", text: "నమస్కారం, కార్పొరేషన్ అనేది ఒక చట్టపరమైన సంస్థ." },
  { lang: "en-IN", text: "Hello, a corporation is a recognized legal entity." }
];

async function callSarvamTTS(text, lang) {
  const apiKey = process.env.SARVAM_API_KEY;
  const payload = {
    inputs: [text],
    target_language_code: lang,
    speaker: "anushka",
    pitch: 0,
    pace: 1.0,
    loudness: 1.5,
    speech_sample_rate: 16000,
    enable_preprocessing: true,
    model: "bulbul:v2"
  };

  const data = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.sarvam.ai',
      port: 443,
      path: '/text-to-speech',
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.audios && json.audios[0]) {
            resolve({ success: true, audioLength: json.audios[0].length });
          } else {
            resolve({ success: false, error: body });
          }
        } catch (e) {
          resolve({ success: false, error: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runMultilingualTTS() {
  console.log("TESTING MULTILINGUAL SARVAM AI TTS ACROSS 5 LANGUAGES");
  for (const s of samples) {
    const t0 = Date.now();
    const res = await callSarvamTTS(s.text, s.lang);
    const latency = Date.now() - t0;
    console.log(`[${s.lang}] Latency: ${latency}ms | Success: ${res.success} | Audio bytes: ${res.audioLength || 0}`);
  }
}

runMultilingualTTS();
