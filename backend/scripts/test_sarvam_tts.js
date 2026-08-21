const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');

async function testSarvamTTS() {
  console.log("TESTING SARVAM AI TEXT-TO-SPEECH API");
  const apiKey = process.env.SARVAM_API_KEY;
  console.log("API Key:", apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING');

  const testPayload = {
    inputs: ["नमस्ते, मैं आपकी कैसे मदद कर सकता हूँ?"],
    target_language_code: "hi-IN",
    speaker: "anushka",
    pitch: 0,
    pace: 1.0,
    loudness: 1.5,
    speech_sample_rate: 8000,
    enable_preprocessing: true,
    model: "bulbul:v2"
  };

  const data = JSON.stringify(testPayload);

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
  }, (res) => {
    let body = '';
    console.log('Status Code:', res.statusCode);
    res.on('data', c => body += c);
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        console.log('Response keys:', Object.keys(json));
        if (json.audios && json.audios.length > 0) {
          console.log('✓ Success! Received base64 audio length:', json.audios[0].length);
        } else {
          console.log('Response body:', body.substring(0, 300));
        }
      } catch (e) {
        console.log('Raw body:', body.substring(0, 300));
      }
    });
  });

  req.on('error', e => console.error('Request error:', e.message));
  req.write(data);
  req.end();
}

testSarvamTTS();
