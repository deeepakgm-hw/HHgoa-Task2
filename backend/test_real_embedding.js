const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function testRealGoogleEmbedding() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing real Gemini embedding with API key:', apiKey ? apiKey.substring(0, 8) + '...' : 'NONE');
  const ai = new GoogleGenAI({ apiKey });

  const models = ['text-embedding-004', 'embedding-001', 'gemini-embedding-2', 'models/text-embedding-004'];
  for (const m of models) {
    try {
      const start = Date.now();
      const res = await ai.models.embedContent({
        model: m,
        contents: 'what is a corporation?'
      });
      const lat = Date.now() - start;
      const values = res.embedding?.values || res.embeddings?.[0]?.values;
      console.log(`[${m}] SUCCESS in ${lat}ms! Vector dimension: ${values?.length}, sample: [${values?.slice(0, 3).map(v => v.toFixed(4)).join(', ')}]`);
    } catch (e) {
      console.log(`[${m}] FAILED: ${e.message}`);
    }
  }
}

testRealGoogleEmbedding().catch(console.error);
