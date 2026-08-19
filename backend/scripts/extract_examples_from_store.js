const fs = require('fs');
const path = require('path');

async function extractGenuineDatasetExamples() {
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  console.log("Loading vector store to extract raw MSMARCO-XI examples...");
  
  // Stream parse vector store to find first 3 distinct queries per language with gold passages
  const rawData = JSON.parse(fs.readFileSync(vsPath, 'utf8'));
  console.log(`Loaded ${rawData.length} chunks from vector store.`);

  const languages = ['hi', 'kn', 'ta', 'te', 'en'];
  const extracted = {};

  for (const lang of languages) {
    extracted[lang] = [];
    const seenQueries = new Set();

    for (const item of rawData) {
      const c = item.chunk;
      const meta = c.metadata || {};
      const cLang = meta.language;
      const isSelected = meta.isSelected;
      const query = meta.originalQuery;
      const goldAnswer = meta.goldAnswer;

      if (cLang === lang && isSelected === true && query && !seenQueries.has(query)) {
        // Find the full text for this chunk or passage
        seenQueries.add(query);
        extracted[lang].push({
          queryId: meta.queryId,
          language: lang,
          query: query,
          answer: goldAnswer || 'N/A',
          goldPassageText: c.text,
          passageIdx: meta.passageIdx,
          chunkId: c.chunkId || c.id
        });

        if (extracted[lang].length === 3) break;
      }
    }
  }

  // Print results formatted clearly
  console.log("\n===============================================================================");
  console.log("RAW GENUINE MSMARCO-XI EXAMPLES (3 PER LANGUAGE: HI, KN, TA, TE, EN)");
  console.log("===============================================================================\n");

  for (const lang of languages) {
    console.log(`-------------------------------------------------------------------------------`);
    console.log(`LANGUAGE: ${lang.toUpperCase()}`);
    console.log(`-------------------------------------------------------------------------------`);
    extracted[lang].forEach((ex, i) => {
      console.log(`\n[Example ${i + 1}] (${lang.toUpperCase()}) — Query ID: ${ex.queryId}`);
      console.log(`• Query:       "${ex.query}"`);
      console.log(`• Gold Answer: "${ex.answer}"`);
      console.log(`• Gold Passage [is_selected == 1, Passage #${ex.passageIdx}]:`);
      console.log(`  "${ex.goldPassageText}"\n`);
    });
  }

  // Also save clean JSON for verification
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'verified_12_dataset_test_set.json'),
    JSON.stringify(extracted, null, 2)
  );
  console.log("✓ Saved 15 verified examples to backend/data/verified_12_dataset_test_set.json");
}

extractGenuineDatasetExamples().catch(console.error);
