const fs = require('fs');
const path = require('path');

const GROUNDED_15_QUERIES = [
  { q: "what is a corporation?", lang: "en" },
  { q: "why did rachel carson write silent spring", lang: "en" },
  { q: "corporation definition legal entity", lang: "en" },
  { q: "rachel carson obligation to endure pesticide", lang: "en" },
  { q: "कॉर्पोरेशन क्या है?", lang: "hi" },
  { q: "रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा", lang: "hi" },
  { q: "कंपनी और निगम की कानूनी परिभाषा क्या है?", lang: "hi" },
  { q: "कौवे और पक्षियों पर कीटनाशकों का प्रभाव", lang: "hi" },
  { q: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", lang: "kn" },
  { q: "ನಿಗಮ ಅಥವಾ ಕಂಪನಿಯ ಕಾನೂನು ವ್ಯಾಖ್ಯಾನ", lang: "kn" },
  { q: "ರೇಚಲ್ ಕಾರ್ಸನ್ ಪರಿಸರ ಮಾಲಿನ್ಯ", lang: "kn" },
  { q: "ஒரு நிறுவனம் என்பது என்ன?", lang: "ta", },
  { q: "நிறுவனங்களின் சட்ட வரையறை", lang: "ta" },
  { q: "ரshapeல் கார்சன் பூச்சிக்கொல்லி", lang: "ta" },
  { q: "కార్పొరేషన్ అంటే ఏమిటి?", lang: "te" }
];

const FALLBACK_15_QUERIES = [
  { q: "Who is India Prime Minister?", lang: "en" },
  { q: "What is photosynthesis?", lang: "en" },
  { q: "Who won the FIFA World Cup in 2022?", lang: "en" },
  { q: "What is quantum computing?", lang: "en" },
  { q: "How to bake sourdough bread from scratch?", lang: "en" },
  { q: "What is the speed of light in vacuum?", lang: "en" },
  { q: "Who wrote the play Romeo and Juliet?", lang: "en" },
  { q: "What is the capital of Australia?", lang: "en" },
  { q: "How does the human digestive system work?", lang: "en" },
  { q: "What is the chemical formula for water?", lang: "en" },
  { q: "जापान की राजधानी क्या है?", lang: "hi" },
  { q: "सौरमंडल का सबसे बड़ा ग्रह कौन सा है?", lang: "hi" },
  { q: "ಫ್ರಾನ್ಸ್‌ನ ರಾಜಧಾನಿ ಯಾವುದು?", lang: "kn" },
  { q: "ஒளிச்சேர்க்கை என்றால் என்ன?", lang: "ta" },
  { q: "చంద్రుడిపై మొదట అడుగుపెట్టిన వ్యక్తి ఎవరు?", lang: "te" }
];

function calculatePercentiles(values) {
  if (!values || values.length === 0) return { p50: 0, p70: 0, p100: 0, n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const getP = (p) => {
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Number(sorted[idx].toFixed(2));
  };
  return {
    p50: getP(50),
    p70: getP(70),
    p100: Number(sorted[sorted.length - 1].toFixed(2)),
    n: values.length
  };
}

async function runStrictLatencyBenchmark() {
  console.log('====================================================');
  console.log('WORKSTREAM A3: PER-PATH LATENCY BENCHMARK (15 + 15 QUERIES)');
  console.log('====================================================\n');

  const groundedRuns = [];
  const fallbackRuns = [];

  console.log('--- EXECUTING 15 GROUNDED (MSMARCO-XI) QUERIES ---');
  for (let i = 0; i < GROUNDED_15_QUERIES.length; i++) {
    const item = GROUNDED_15_QUERIES[i];
    const start = Date.now();
    try {
      const res = await fetch('http://localhost:5000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: item.q,
          strategy: 'semantic',
          rerank: true,
          languageCode: item.lang
        })
      });
      const wallMs = Date.now() - start;
      const data = await res.json();
      const record = {
        id: `G-${i + 1}`,
        path: data.source || 'unknown',
        query: item.q,
        lang: item.lang,
        status: data.status,
        isGrounded: data.isGrounded,
        retrievalMs: Number(((data.telemetry?.retrieval || 0) + (data.telemetry?.rerank || 0)).toFixed(2)),
        generationMs: Number((data.telemetry?.generation || 0).toFixed(2)),
        pipelineTotalMs: Number((data.telemetry?.total || wallMs).toFixed(2)),
        wallClockMs: wallMs
      };
      groundedRuns.push(record);
      console.log(`[GROUNDED #${i + 1}/15] "${item.q}" -> Status: ${data.status} | Wall: ${wallMs}ms (Ret: ${record.retrievalMs}ms, Gen: ${record.generationMs}ms)`);
    } catch (e) {
      console.error(`Grounded query #${i + 1} failed:`, e.message);
    }
  }

  console.log('\n--- EXECUTING 15 GEMINI GENERAL KNOWLEDGE FALLBACK QUERIES ---');
  for (let i = 0; i < FALLBACK_15_QUERIES.length; i++) {
    const item = FALLBACK_15_QUERIES[i];
    const start = Date.now();
    try {
      const res = await fetch('http://localhost:5000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: item.q,
          strategy: 'semantic',
          rerank: true,
          languageCode: item.lang
        })
      });
      const wallMs = Date.now() - start;
      const data = await res.json();
      const record = {
        id: `F-${i + 1}`,
        path: data.source || 'unknown',
        query: item.q,
        lang: item.lang,
        status: data.status,
        isGrounded: data.isGrounded,
        retrievalMs: Number(((data.telemetry?.retrieval || 0) + (data.telemetry?.rerank || 0)).toFixed(2)),
        generationMs: Number((data.telemetry?.generation || 0).toFixed(2)),
        pipelineTotalMs: Number((data.telemetry?.total || wallMs).toFixed(2)),
        wallClockMs: wallMs
      };
      fallbackRuns.push(record);
      console.log(`[FALLBACK #${i + 1}/15] "${item.q}" -> Status: ${data.status} | Wall: ${wallMs}ms (Ret: ${record.retrievalMs}ms, Gen: ${record.generationMs}ms)`);
    } catch (e) {
      console.error(`Fallback query #${i + 1} failed:`, e.message);
    }
  }

  const groundedWallTimes = groundedRuns.map(r => r.wallClockMs);
  const fallbackWallTimes = fallbackRuns.map(r => r.wallClockMs);
  const allWallTimes = [...groundedWallTimes, ...fallbackWallTimes];

  const summary = {
    timestamp: new Date().toISOString(),
    groundedPath: {
      pathName: 'msmarco_grounded (In-Corpus Dense Hybrid + Rerank + Grounded LLM)',
      percentiles: calculatePercentiles(groundedWallTimes),
      rawRuns: groundedRuns
    },
    fallbackPath: {
      pathName: 'gemini_general (Out-of-Corpus Disclosed Gemini Direct)',
      percentiles: calculatePercentiles(fallbackWallTimes),
      rawRuns: fallbackRuns
    },
    blendedOverall: {
      pathName: 'Blended Overall (All 30 Executed Queries)',
      percentiles: calculatePercentiles(allWallTimes)
    }
  };

  console.log('\n====================================================');
  console.log('PER-PATH LATENCY PERCENTILES SUMMARY');
  console.log('====================================================');
  console.log('1. Grounded Path (msmarco_grounded, n = 15):', summary.groundedPath.percentiles);
  console.log('2. Fallback Path (gemini_general, n = 15):', summary.fallbackPath.percentiles);
  console.log('3. Blended Overall (All 30 queries):', summary.blendedOverall.percentiles);

  fs.writeFileSync(path.join(__dirname, 'data/strict_per_path_latency_report.json'), JSON.stringify(summary, null, 2), 'utf8');
}

runStrictLatencyBenchmark().catch(console.error);
