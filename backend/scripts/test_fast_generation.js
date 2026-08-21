const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '..', '.env') });
const { GoogleGenAI } = require('@google/genai');

async function testFastGeneration() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite';

  const context = "A corporation is a company or group of people authorized to act as a single legal entity recognized by law.";
  const query = "What is a corporation?";

  const prompt = `Context: ${context}\nQuestion: ${query}\nAnswer factually in 1 clear sentence:`;

  console.log("Testing ultra-fast concise prompt on:", modelName);
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.0,
        maxOutputTokens: 80
      }
    });
    const latency = Date.now() - t0;
    console.log(`Run ${i + 1}: ${latency}ms | Answer: "${(response.text || '').trim()}"`);
  }
}

testFastGeneration().catch(console.error);
