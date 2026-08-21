const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '..', '.env') });
const { GoogleGenAI } = require('@google/genai');

async function testGeminiAllLanguages() {
  console.log("===============================================================================");
  console.log("TESTING GEMINI API CONNECTIVITY ACROSS ALL 5 LANGUAGES");
  console.log("===============================================================================\n");

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`• API Key Configured: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NONE'}`);
  console.log(`• Configured Model:   ${process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite'}\n`);

  if (!apiKey) {
    console.error("✕ Error: GEMINI_API_KEY is missing!");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite';

  const testPrompts = [
    {
      lang: 'en',
      langName: 'English',
      context: "McDonald's Corporation is an American multinational fast food chain. A corporation is a company or group of people authorized to act as a single legal entity.",
      query: "What is a corporation?"
    },
    {
      lang: 'hi',
      langName: 'Hindi',
      context: "एक निगम (कॉर्पोरेशन) एक कंपनी या लोगों का समूह है जो एक एकल इकाई (कानूनी रूप से एक व्यक्ति) के रूप में कार्य करने के लिए अधिकृत है और कानून में इस तरह से मान्यता प्राप्त है।",
      query: "कॉर्पोरेशन क्या है?"
    },
    {
      lang: 'kn',
      langName: 'Kannada',
      context: "ನಿಗಮವು ಒಂದು ಏಕೈಕ ಘಟಕವಾಗಿ (ಕಾನೂನುಬದ್ಧವಾಗಿ ಒಬ್ಬ ವ್ಯಕ್ತಿ) ಕಾರ್ಯನಿರ್ವಹಿಸಲು ಮತ್ತು ಕಾನೂನಿನಲ್ಲಿ ಅಂತಹ ಮಾನ್ಯತೆ ಪಡೆದ ಜನರ ಗುಂಪು ಅಥವಾ ಕಂಪನಿಯಾಗಿದೆ.",
      query: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?"
    },
    {
      lang: 'ta',
      langName: 'Tamil',
      context: "ஒரு பெருநிறுவனம் (கார்ப்பரேஷன்) என்பது ஒரு தனி நிறுவனமாக (சட்டப்பூர்வமாக ஒரு நபர்) செயல்பட அங்கீகரிக்கப்பட்ட மற்றும் சட்டத்தில் அவ்வாறு அங்கீகரிக்கப்பட்ட ஒரு நிறுவனம் அல்லது மக்களின் குழுவாகும்.",
      query: "கார்ப்பரேஷன் என்றால் என்ன?"
    },
    {
      lang: 'te',
      langName: 'Telugu',
      context: "కార్పొరేషన్ అనేది ఒక వ్యక్తిగా (చట్టపరంగా ఒక వ్యక్తి) వ్యవహరించడానికి అధికారం ఉన్న మరియు చట్టంలో గుర్తించబడిన ఒక కంపెనీ లేదా ప్రజల సమూహం.",
      query: "కార్పొరేషన్ అంటే ఏమిటి?"
    }
  ];

  for (const t of testPrompts) {
    console.log(`Testing ${t.langName} (${t.lang})...`);
    const prompt = `Context: ${t.context}\n\nQuestion: ${t.query}\n\nBased strictly on the provided context, provide a clear, factual answer in the same language.`;
    const t0 = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt
      });
      const latency = Date.now() - t0;
      const text = response.text || '';
      console.log(`  ✓ Status: SUCCESS (${latency}ms)`);
      console.log(`  ✓ Response: "${text.trim()}"\n`);
    } catch (err) {
      console.error(`  ✕ Error in ${t.langName}:`, err.message || err);
      // Try fallback model if rate limit or model name issue
      if (modelName !== 'gemini-3.6-flash') {
        console.log(`  Attempting fallback model gemini-3.6-flash...`);
        try {
          const res2 = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt
          });
          console.log(`  ✓ Fallback Status: SUCCESS (${Date.now() - t0}ms)`);
          console.log(`  ✓ Fallback Response: "${(res2.text || '').trim()}"\n`);
        } catch (e2) {
          console.error(`  ✕ Fallback also failed:`, e2.message || e2);
        }
      }
    }
  }
}

testGeminiAllLanguages().catch(console.error);
