async function testRealFallbackAnswers() {
  console.log('====================================================');
  console.log('TESTING REAL GEMINI GENERAL KNOWLEDGE FALLBACK ANSWERS');
  console.log('====================================================\n');

  const queries = [
    { q: "Who is India Prime Minister?", lang: "en", label: "Query 1: India Prime Minister (Out-of-Corpus)" },
    { q: "What is photosynthesis?", lang: "en", label: "Query 2: Photosynthesis (Out-of-Corpus)" },
    { q: "Who won the FIFA World Cup in 2022?", lang: "en", label: "Query 3: FIFA World Cup 2022 (Out-of-Corpus)" },
    { q: "what is a corporation?", lang: "en", label: "Query 4: Corporation (In-Corpus MSMARCO-XI Grounded)" }
  ];

  for (const item of queries) {
    console.log(`\n----------------------------------------------------`);
    console.log(`[TEST]: ${item.label}`);
    console.log(`[QUERY]: "${item.q}"`);

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

      const data = await res.json();
      console.log(`[STATUS]: ${data.status}`);
      console.log(`[SOURCE]: ${data.source}`);
      console.log(`[IS GROUNDED]: ${data.isGrounded}`);
      if (data.disclosure) {
        console.log(`[DISCLOSURE]: "${data.disclosure}"`);
      }
      console.log(`[ANSWER]: "${data.answer}"`);
      if (data.citations && data.citations.length > 0) {
        console.log(`[CITATIONS]: ${JSON.stringify(data.citations)}`);
      }
    } catch (e) {
      console.error(`Error querying "${item.q}":`, e.message);
    }
  }
}

testRealFallbackAnswers().catch(console.error);
