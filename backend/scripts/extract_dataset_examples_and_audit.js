const fs = require('fs');
const path = require('path');

async function extractRawExamples() {
  const { parquetRead } = await import('hyparquet');
  const { compressors } = await import('hyparquet-compressors');

  const rawDir = path.join(__dirname, '..', 'data', 'msmarco-xi', 'raw');
  const files = {
    hi: path.join(rawDir, 'hi', 'hinval.parquet'),
    kn: path.join(rawDir, 'kn', 'kanval.parquet'),
    ta: path.join(rawDir, 'ta', 'tamval.parquet'),
    te: path.join(rawDir, 'te', 'telval.parquet')
  };

  const results = {};

  for (const [lang, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
    
    const rows = await new Promise((resolve) => {
      parquetRead({
        file: arrayBuffer,
        compressors,
        rowStart: 0,
        rowEnd: 50,
        onComplete: (data) => resolve(data)
      });
    });

    results[lang] = [];
    
    for (let r = 0; r < rows.length && results[lang].length < 3; r++) {
      const row = rows[r];
      // 0: source_language, 1: target_language, 2: url, 3: Answer, 4: query_id, 5: query_type, 6: passages, 7: Eng_Query, 8: Eng_Answer, 9: query
      const sourceLang = row[0];
      const targetLang = row[1];
      const answer = row[3];
      const queryId = typeof row[4] === 'bigint' ? row[4].toString() : String(row[4]);
      const passagesObj = row[6] || {};
      const engQuery = row[7];
      const engAnswer = row[8];
      const query = row[9];

      const translatedPassages = passagesObj.Translated_passages || [];
      const englishPassages = passagesObj.English_passages || [];
      const isSelectedArr = passagesObj.is_selected || [];

      // Find index where is_selected == 1
      const goldIdx = isSelectedArr.findIndex(x => Number(x) === 1);
      if (goldIdx === -1) continue;

      results[lang].push({
        queryId,
        sourceLang,
        targetLang,
        query,
        answer: Array.isArray(answer) ? answer.join(' ') : String(answer),
        engQuery,
        engAnswer: Array.isArray(engAnswer) ? engAnswer.join(' ') : String(engAnswer),
        goldPassageIdx: goldIdx,
        goldPassageText: translatedPassages[goldIdx] || '',
        goldEnglishPassageText: englishPassages[goldIdx] || '',
        totalCandidates: translatedPassages.length
      });
    }
  }

  // Print results formatted clearly
  console.log("\n===============================================================================");
  console.log("RAW GENUINE MSMARCO-XI EXAMPLES EXTRACTED DIRECTLY FROM PARQUET FILES");
  console.log("===============================================================================\n");

  for (const [lang, list] of Object.entries(results)) {
    console.log(`-------------------------------------------------------------------------------`);
    console.log(`LANGUAGE: ${lang.toUpperCase()} (Source Parquet: ${path.basename(files[lang])})`);
    console.log(`-------------------------------------------------------------------------------`);
    list.forEach((ex, i) => {
      console.log(`\n[Example ${i + 1}] (${lang.toUpperCase()}) — Query ID: ${ex.queryId}`);
      console.log(`• Query (Indic):       "${ex.query}"`);
      console.log(`• Answer (Indic):      "${ex.answer}"`);
      console.log(`• Eng_Query:           "${ex.engQuery}"`);
      console.log(`• Eng_Answer:          "${ex.engAnswer}"`);
      console.log(`• Gold Passage [is_selected == 1, Candidate #${ex.goldPassageIdx + 1} of ${ex.totalCandidates}]:`);
      console.log(`  "${ex.goldPassageText}"`);
      console.log(`• English Gold Passage (Source):`);
      console.log(`  "${ex.goldEnglishPassageText}"\n`);
    });
  }

  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'verified_12_dataset_test_set.json'),
    JSON.stringify(results, null, 2)
  );
  console.log("✓ Successfully saved verified examples to backend/data/verified_12_dataset_test_set.json");
}

extractRawExamples().catch(console.error);
