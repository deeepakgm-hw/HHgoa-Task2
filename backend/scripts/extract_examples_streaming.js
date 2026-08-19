const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function extractGenuineDatasetExamplesStream() {
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  console.log("Streaming vector store to extract raw MSMARCO-XI examples...");

  const fileStream = fs.createReadStream(vsPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const languages = ['hi', 'kn', 'ta', 'te', 'en'];
  const extracted = { hi: [], kn: [], ta: [], te: [], en: [] };
  const seenQueries = { hi: new Set(), kn: new Set(), ta: new Set(), te: new Set(), en: new Set() };

  let allFilled = false;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && (trimmed.endsWith('}') || trimmed.endsWith('},'))) {
      const cleanJson = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
      try {
        const item = JSON.parse(cleanJson);
        const c = item.chunk;
        const meta = c.metadata || {};
        const cLang = meta.language;
        const isSelected = meta.isSelected;
        const query = meta.originalQuery;
        const goldAnswer = meta.goldAnswer;

        if (languages.includes(cLang) && isSelected === true && query && !seenQueries[cLang].has(query)) {
          seenQueries[cLang].add(query);
          extracted[cLang].push({
            queryId: meta.queryId,
            language: cLang,
            query: query,
            answer: goldAnswer || 'N/A',
            goldPassageText: c.text,
            passageIdx: meta.passageIdx,
            chunkId: c.chunkId || c.id
          });

          if (languages.every(l => extracted[l].length >= 3)) {
            allFilled = true;
            break;
          }
        }
      } catch (e) {}
    }
  }

  rl.close();
  fileStream.destroy();

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

  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'verified_12_dataset_test_set.json'),
    JSON.stringify(extracted, null, 2)
  );
  console.log("✓ Saved 15 verified examples to backend/data/verified_12_dataset_test_set.json");
}

extractGenuineDatasetExamplesStream().catch(console.error);
