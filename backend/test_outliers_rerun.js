async function testOutliersMitigated() {
  console.log('====================================================');
  console.log('RE-TESTING 4 PREVIOUS OUTLIER QUERIES');
  console.log('====================================================\n');

  const queries = [
    { id: 'F-10', q: 'What is the chemical formula for water?', lang: 'en' },
    { id: 'F-11', q: 'जापान की राजधानी क्या है?', lang: 'hi' },
    { id: 'F-13', q: 'ಫ್ರಾನ್ಸ್‌ನ ರಾಜಧಾನಿ ಯಾವುದು?', lang: 'kn' },
    { id: 'F-15', q: 'చంద్రుడిపై మొదట అడుగుపెట్టిన వ్యక్తి ఎవరు?', lang: 'te' }
  ];

  for (const item of queries) {
    const start = Date.now();
    const res = await fetch('http://localhost:5000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: item.q, languageCode: item.lang })
    });
    const wallMs = Date.now() - start;
    const data = await res.json();
    console.log(`[${item.id}] "${item.q}" -> Wall-Clock: ${wallMs}ms | Status: ${data.status} | Source: ${data.source}`);
    console.log(`      Answer: "${data.answer}"\n`);
  }
}

testOutliersMitigated().catch(console.error);
