async function testModel() {
  console.log('================================================================================');
  console.log('BENCHMARKING LOCAL MULTILINGUAL EMBEDDING MODEL (Xenova/multilingual-e5-small)');
  console.log('================================================================================\n');

  console.log('Loading pipeline from @xenova/transformers...');
  const { pipeline } = await import('@xenova/transformers');
  
  const t0 = Date.now();
  console.log('Downloading / initializing Xenova/multilingual-e5-small (quantized ONNX)...');
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
    quantized: true
  });
  console.log(`✓ Model loaded in ${((Date.now() - t0)/1000).toFixed(2)}s.\n`);

  async function embed(text, isQuery = false) {
    const prefix = isQuery ? 'query: ' : 'passage: ';
    const output = await extractor(prefix + text, { pooling: 'mean', normalize: true });
    return output.data;
  }

  function cosineSim(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  // 1. Multilingual Semantic Alignment Test across all 5 languages
  console.log('--- TEST 1: MULTILINGUAL CROSS-LANGUAGE SEMANTIC SIMILARITY ---');
  const testPairs = [
    { lang: 'English', q: 'What is the capital of France?', target: 'Paris is the capital and most populous city of France.', distractor: 'Photosynthesis is a process used by plants to convert light energy.' },
    { lang: 'Hindi', q: 'भारत के प्रधानमंत्री कौन हैं?', target: 'नरेंद्र मोदी भारत के वर्तमान प्रधानमंत्री हैं।', distractor: 'सौरमंडल में आठ मुख्य ग्रह सूर्य की परिक्रमा करते हैं।' },
    { lang: 'Kannada', q: 'ಭಾರತದ ರಾಜಧಾನಿ ಯಾವುದು?', target: 'ನವದೆಹಲಿ ಭಾರತದ ರಾಜಧಾನಿಯಾಗಿದೆ.', distractor: 'ಮರಗಳು ಆಮ್ಲಜನಕವನ್ನು ಉತ್ಪಾದಿಸುತ್ತವೆ.' },
    { lang: 'Tamil', q: 'தமிழ்நாட்டின் தலைநகரம் எது?', target: 'சென்னை தமிழ்நாட்டின் தலைநகரமாகும்.', distractor: 'சூரியன் ஒரு நடுத்தர அளவிலான நட்சத்திரம்.' },
    { lang: 'Telugu', q: 'భారతదేశ ప్రధాన మంత్రి ఎవరు?', target: 'నరేంద్ర మోదీ భారత దేశ ప్రస్తుత ప్రధాన మంత్రి.', distractor: 'నీటి రసాయన సూత్రం H2O.' }
  ];

  let dim = 0;
  for (const pair of testPairs) {
    const qOut = await embed(pair.q, true);
    const tOut = await embed(pair.target, false);
    const dOut = await embed(pair.distractor, false);

    dim = qOut.length;
    const simTarget = cosineSim(qOut, tOut);
    const simDistractor = cosineSim(qOut, dOut);

    console.log(`[${pair.lang.padEnd(7)}] Query: "${pair.q}"`);
    console.log(`  • Semantic Match Score:     ${simTarget.toFixed(4)} (Target: "${pair.target.slice(0, 35)}...")`);
    console.log(`  • Irrelevant Distractor:   ${simDistractor.toFixed(4)} (Distractor: "${pair.distractor.slice(0, 35)}...")`);
    console.log(`  • Margin Separation:       +${(simTarget - simDistractor).toFixed(4)} ${simTarget > simDistractor + 0.20 ? '✓ STRONG SIGNAL' : '⚠ WEAK'}\n`);
  }

  console.log(`✓ Real Model Dimension: ${dim} float values per vector (Native, unpadded).\n`);

  // 2. Latency Profiling across 100 and 500 chunks
  console.log('--- TEST 2: CPU INFERENCE LATENCY BENCHMARK ---');
  
  const sampleTexts = [
    "The prime minister of India is the head of government of the Republic of India.",
    "Photosynthesis is a biological process used by many cellular organisms to convert light energy into chemical energy.",
    "భారత రాజ్యాంగం దేశ అత్యున్నత చట్టం మరియు పౌరుల ప్రాథమిక హక్కులను నిర్ధారిస్తుంది.",
    "தமிழ் இலக்கியம் இரண்டாயிரத்திற்கும் மேற்பட்ட ஆண்டுகள் பழமையான வரலாற்றுத் தொடர்ச்சி கொண்டது.",
    "ಕನ್ನಡ ಸಾಹಿತ್ಯವು ಸಾವಿರಕ್ಕೂ ಹೆಚ್ಚು ವರ್ಷಗಳ ಇತಿಹಾಸವನ್ನು ಹೊಂದಿದೆ ಮತ್ತು ಪ್ರಮುಖ ಕೃತಿಗಳನ್ನು ಒಳಗೊಂಡಿದೆ.",
    "New Delhi was planned by British architects Sir Edwin Lutyens and Sir Herbert Baker.",
    "Water is an inorganic compound with the chemical formula H2O.",
    "Quantum computing is a rapidly-emerging technology that harnesses the laws of quantum mechanics.",
    "सौर मंडल में सूर्य और वह खगोलीय पिंड सम्मलित हैं जो इस मंडल में एक दूसरे से गुरुत्वाकर्षण बल द्वारा बंधे हैं।",
    "Bengaluru is the capital and largest city of the Indian state of Karnataka."
  ];

  const batch100 = Array.from({ length: 100 }, (_, i) => sampleTexts[i % sampleTexts.length]);
  const batch500 = Array.from({ length: 500 }, (_, i) => sampleTexts[i % sampleTexts.length]);

  // Warmup
  await embed("Warmup sample text for neural inference profiling.", false);

  // 100 chunks benchmark
  const t100Start = Date.now();
  for (let i = 0; i < batch100.length; i++) {
    await embed(batch100[i], false);
  }
  const t100Total = Date.now() - t100Start;
  const msPerChunk100 = t100Total / 100;
  console.log(`• 100 Chunks (Sequential CPU):  ${t100Total}ms total (${msPerChunk100.toFixed(2)} ms / chunk)`);

  // 500 chunks benchmark
  const t500Start = Date.now();
  for (let i = 0; i < batch500.length; i++) {
    await embed(batch500[i], false);
  }
  const t500Total = Date.now() - t500Start;
  const msPerChunk500 = t500Total / 500;
  console.log(`• 500 Chunks (Sequential CPU):  ${t500Total}ms total (${msPerChunk500.toFixed(2)} ms / chunk)\n`);

  // 3. Projections for Full 84,667 Chunks
  console.log('================================================================================');
  console.log('EXTRAPOLATED PROJECTIONS FOR 84,667 CHUNKS');
  console.log('================================================================================');
  const totalSeconds = (84667 * msPerChunk500) / 1000;
  const totalMinutes = totalSeconds / 60;
  const totalHours = totalMinutes / 60;

  console.log(`• Total Chunks:              84,667`);
  console.log(`• Average Inference Time:    ${msPerChunk500.toFixed(2)} ms / chunk`);
  console.log(`• Projected Sequential Time: ${totalMinutes.toFixed(1)} minutes (${totalHours.toFixed(2)} hours)`);
  console.log(`• Vector Buffer Memory (384-dim): ${(84667 * 384 * 4 / (1024 * 1024)).toFixed(2)} MB (vs 992 MB for 3072-dim)`);
  console.log(`• Graph Topology Memory:     ~35 MB (vs 206 MB for 3072-dim)`);
  console.log('================================================================================\n');
}

testModel().catch(console.error);
