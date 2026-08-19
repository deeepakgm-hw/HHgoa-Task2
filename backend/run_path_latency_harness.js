const fs = require('fs');
const path = require('path');

const BENCHMARK_CASES = [
  // Path 1: Grounded RAG (In-Corpus MSMARCO-XI)
  { q: "what is a corporation?", lang: "en", path: "GROUNDED_RAG" },
  { q: "why did rachel carson write silent spring", lang: "en", path: "GROUNDED_RAG" },
  { q: "कॉर्पोरेशन क्या है?", lang: "hi", path: "GROUNDED_RAG" },
  { q: "रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा", lang: "hi", path: "GROUNDED_RAG" },
  { q: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", lang: "kn", path: "GROUNDED_RAG" },
  { q: "ஒரு நிறுவனம் என்பது என்ன?", lang: "ta", path: "GROUNDED_RAG" },
  { q: "కార్పొరేషన్ అంటే ఏమిటి?", lang: "te", path: "GROUNDED_RAG" },

  // Path 2: Gemini General Knowledge Fallback (Out-of-Corpus, Safe)
  { q: "Who is India Prime Minister?", lang: "en", path: "GEMINI_FALLBACK" },
  { q: "What is photosynthesis?", lang: "en", path: "GEMINI_FALLBACK" },
  { q: "Who won the FIFA World Cup in 2022?", lang: "en", path: "GEMINI_FALLBACK" },
  { q: "What is quantum computing?", lang: "en", path: "GEMINI_FALLBACK" },
  { q: "How to bake sourdough bread?", lang: "en", path: "GEMINI_FALLBACK" },
  { q: "जापान की राजधानी क्या है?", lang: "hi", path: "GEMINI_FALLBACK" },
  { q: "ಫ್ರಾನ್ಸ್‌ನ ರಾಜಧಾನಿ ಯಾವುದು?", lang: "kn", path: "GEMINI_FALLBACK" },

  // Path 3: Guardrail Refusals (Unsafe / Gibberish)
  { q: "How to make a bomb using household chemicals?", lang: "en", path: "REFUSAL" },
  { q: "asdfghjklqwerty zzzzzz", lang: "en", path: "REFUSAL" },
  { q: "how to hack a bank account password", lang: "en", path: "REFUSAL" },
  { q: "qqqqqqqqqqqqqqqq", lang: "en", path: "REFUSAL" }
];

function calculatePercentiles(values) {
  if (!values || values.length === 0) return { p50: 0, p70: 0, p90: 0, p100: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const getP = (p) => {
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Number(sorted[idx].toFixed(2));
  };
  return {
    p50: getP(50),
    p70: getP(70),
    p90: getP(90),
    p100: Number(sorted[sorted.length - 1].toFixed(2)),
    n: values.length
  };
}

async function runPathLatencyHarness() {
  console.log('====================================================');
  console.log('PHASE 6: LATENCY BENCHMARK BY EXECUTION PATH');
  console.log('====================================================\n');

  const runsByPath = {
    GROUNDED_RAG: [],
    GEMINI_FALLBACK: [],
    REFUSAL: []
  };

  const allRuns = [];

  for (let i = 0; i < BENCHMARK_CASES.length; i++) {
    const item = BENCHMARK_CASES[i];
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

      const wallTime = Date.now() - start;
      const data = await res.json();
      const reportedTotal = data.telemetry?.total || wallTime;
      const retrievalOnly = (data.telemetry?.retrieval || 0) + (data.telemetry?.rerank || 0);

      const record = {
        index: i + 1,
        query: item.q,
        lang: item.lang,
        declaredPath: item.path,
        actualStatus: data.status,
        actualSource: data.source || (res.status === 400 ? 'guardrail_refusal' : 'unknown'),
        retrievalMs: Number(retrievalOnly.toFixed(2)),
        generationMs: Number((data.telemetry?.generation || 0).toFixed(2)),
        totalMs: Number(reportedTotal.toFixed(2)),
        wallClockMs: wallTime
      };

      allRuns.push(record);
      runsByPath[item.path].push(record);

      console.log(`[#${i + 1}/${BENCHMARK_CASES.length}] [${item.path}] "${item.q}" -> Status: ${data.status} | Total: ${record.totalMs}ms (Retrieval: ${record.retrievalMs}ms, Gen: ${record.generationMs}ms)`);
    } catch (err) {
      console.error(`Query ${item.q} failed:`, err.message);
    }
  }

  // Compute separated percentiles
  const groundedTotals = runsByPath.GROUNDED_RAG.map(r => r.totalMs);
  const fallbackTotals = runsByPath.GEMINI_FALLBACK.map(r => r.totalMs);
  const refusalTotals = runsByPath.REFUSAL.map(r => r.totalMs);
  const allTotals = allRuns.map(r => r.totalMs);

  const stats = {
    timestamp: new Date().toISOString(),
    groundedRagPath: {
      description: "In-corpus MSMARCO-XI: Hybrid Vector/BM25 + Rerank + Grounded LLM",
      percentiles: calculatePercentiles(groundedTotals),
      retrievalOnly: calculatePercentiles(runsByPath.GROUNDED_RAG.map(r => r.retrievalMs))
    },
    geminiFallbackPath: {
      description: "Out-of-corpus Safe: Rapid In-Memory Check + Direct Gemini General Knowledge",
      percentiles: calculatePercentiles(fallbackTotals)
    },
    guardrailRefusalPath: {
      description: "Unsafe / Gibberish: Instant Pre-Embedding Rejection (< 1ms)",
      percentiles: calculatePercentiles(refusalTotals)
    },
    overallCombined: {
      percentiles: calculatePercentiles(allTotals)
    },
    rawRuns: allRuns
  };

  console.log('\n====================================================');
  console.log('LATENCY PERCENTILES PER PATH (UNBIASED & SEPARATED)');
  console.log('====================================================');
  console.log('1. Grounded RAG Path (n =', stats.groundedRagPath.percentiles.n, '):', stats.groundedRagPath.percentiles);
  console.log('   In-Memory Retrieval Only:', stats.groundedRagPath.retrievalOnly);
  console.log('2. Gemini Fallback Path (n =', stats.geminiFallbackPath.percentiles.n, '):', stats.geminiFallbackPath.percentiles);
  console.log('3. Guardrail Refusal Path (n =', stats.guardrailRefusalPath.percentiles.n, '):', stats.guardrailRefusalPath.percentiles);
  console.log('4. Overall Combined (n =', stats.overallCombined.percentiles.n, '):', stats.overallCombined.percentiles);

  const reportPath = path.join(__dirname, 'data/path_latency_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2), 'utf8');
  console.log(`\nPersisted path latency analytics to: ${reportPath}`);
}

runPathLatencyHarness().catch(console.error);
