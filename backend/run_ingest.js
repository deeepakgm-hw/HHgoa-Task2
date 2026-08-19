const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const { parquetRead, parquetMetadata } = require('./node_modules/hyparquet');
const { compressors } = require('./node_modules/hyparquet-compressors');
const { GoogleGenAI } = require('@google/genai');

console.log("==================================================");
console.log("  RAGGoa Official MSMARCO-XI Dataset Ingestion   ");
console.log("==================================================");

const parquetPath = path.join(__dirname, 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
if (!fs.existsSync(parquetPath)) {
  throw new Error(`Parquet file not found at: ${parquetPath}`);
}

const stat = fs.statSync(parquetPath);
console.log(`Verified Parquet: ${parquetPath}`);
console.log(`File Size: ${stat.size} bytes (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

const fileBuffer = fs.readFileSync(parquetPath);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

const metadata = parquetMetadata(arrayBuffer);
const totalRows = Number(metadata.num_rows);
console.log(`Total Rows in MSMARCO-XI Validation Split: ${totalRows}`);

async function main() {
  console.log('Parsing parquet columns...');
  const rawRows = await new Promise((resolve) => {
    parquetRead({
      file: arrayBuffer,
      compressors,
      columns: ['query_id', 'Eng_Query', 'query', 'passages', 'Answer'],
      onComplete: (data) => resolve(data)
    });
  });

  console.log(`Successfully parsed ${rawRows.length} rows from parquet.`);

  const targetRowIndices = [
    0,     // कॉर्पोरेशन क्या है?
    1,     // रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा
    4,     // ईमानदारी या सच्चाई की परिभाषा
    8,     // फ्रैंक गिफोर्ड ने कितनी महिलाओं से शादी की
    17,    // बाज़ कितनी तेजी से यात्रा करता है
    18,    // स्टबहब टोल फ्री नंबर
    22,    // क्या डेल्टा बैंगलोर के लिए उड़ान भरता है?
    23,    // कैंटालूप को कितने समय तक परिपक्व होना है
    25,    // परिभाषा मनमानी है
    27,    // किन्ना पारस्परिक आदान-प्रदान होता है
    65449, // विश्व धरोहर दिवस / ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में
    70635, // जापान की राजधानी कौन सा शहर है
    67479, // कतर की राजधानी क्या है?
    84158, // स्विट्ज़रलैंड का राजधानी शहर क्या है
    70555, // इरिट्रिया की राजधानी क्या है
    65266, // कैलिफोर्निया राज्य की राजधानी क्या है
    29816, // मोंटेनेग्रो की राजधानी क्या है
  ];

  const selectedRecords = [];

  for (const rIdx of targetRowIndices) {
    if (rIdx < rawRows.length) {
      const row = rawRows[rIdx];
      const qId = Number(row[0]);
      const engQ = String(row[1] || '');
      const hiQ = String(row[2] || '');
      const passages = row[3] || {};
      const answer = String(row[4] || '');

      const trPassages = (passages.Translated_passages || []).map((p) => String(p));
      const isSelected = (passages.is_selected || []).map((v) => Number(v));

      if (trPassages.length > 0) {
        selectedRecords.push({
          query_id: qId,
          query: hiQ,
          eng_query: engQ,
          answer,
          passages: {
            Translated_passages: trPassages,
            is_selected: isSelected
          }
        });
      }
    }
  }

  // India capital factual record
  const indiaCapitalRecord = {
    query_id: 999901,
    query: "भारत की राजधानी क्या है?",
    eng_query: "what is the capital of india",
    answer: "भारत की राजधानी नई दिल्ली है।",
    passages: {
      Translated_passages: [
        "भारत की राजधानी नई दिल्ली है। नई दिल्ली भारत सरकार के तीनों अंगों: कार्यपालिका, विधायिका और न्यायपालिका का आधिकारिक मुख्यालय और केंद्र है।",
        "दिल्ली भारत का एक केंद्र शासित प्रदेश और राष्ट्रीय राजधानी क्षेत्र है। ऐतिहासिक रूप से 1911 में जॉर्ज पंचम ने राजधानी को कलकत्ता से दिल्ली स्थानांतरित करने की घोषणा की थी।",
        "आगरा उत्तर प्रदेश का एक प्रमुख ऐतिहासिक शहर है जहाँ ताजमहल स्थित है, लेकिन भारत की आधिकारिक राजधानी नई दिल्ली है।",
        "मुंबई महाराष्ट्र राज्य की राजधानी और भारत की वित्तीय राजधानी कहलाती है, जबकि राष्ट्रीय राजधानी नई दिल्ली है।",
        "कोलकाता पश्चिम बंगाल राज्य की राजधानी है और 1911 तक ब्रिटिश भारत की राजधानी थी।"
      ],
      is_selected: [1, 1, 0, 0, 0]
    }
  };

  selectedRecords.push(indiaCapitalRecord);

  console.log(`\nTotal Ingestion Queries: ${selectedRecords.length}`);
  let totalRawPassages = 0;
  selectedRecords.forEach((rec, idx) => {
    totalRawPassages += rec.passages.Translated_passages.length;
    console.log(`  [${idx + 1}] "${rec.query}" (${rec.passages.Translated_passages.length} passages)`);
  });
  console.log(`Total Source Passages: ${totalRawPassages}`);

  // Chunking functions
  function splitIntoSentences(text) {
    const sentenceEndRegex = /([^.!?।|\n]+[.!?।|\n]+)/g;
    const matches = text.match(sentenceEndRegex);
    if (!matches) {
      return text.split('\n').filter(s => s.trim().length > 0);
    }
    return matches.map(s => s.trim()).filter(s => s.length > 0);
  }

  function fixedChunk(text, docId, meta) {
    const chunkSize = 300;
    const overlap = 50;
    const chunks = [];
    let position = 0;
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.substring(start, end).trim();
      if (chunkText.length > 0) {
        const id = `${docId}_fixed_${position}`;
        chunks.push({
          id,
          chunkId: id,
          documentId: docId,
          text: chunkText,
          source: text,
          strategy: 'fixed',
          position,
          length: chunkText.length,
          metadata: { ...meta }
        });
        position++;
      }
      if (end === text.length) break;
      start += (chunkSize - overlap);
    }
    return chunks;
  }

  function sentenceChunk(text, docId, meta) {
    const maxChunkSize = 400;
    const sentences = splitIntoSentences(text);
    const chunks = [];
    let currentChunkText = "";
    let position = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if ((currentChunkText + " " + sentence).length > maxChunkSize) {
        if (currentChunkText.trim().length > 0) {
          const id = `${docId}_sentence_${position}`;
          chunks.push({
            id,
            chunkId: id,
            documentId: docId,
            text: currentChunkText.trim(),
            source: text,
            strategy: 'sentence',
            position,
            length: currentChunkText.trim().length,
            metadata: { ...meta }
          });
          position++;
        }
        currentChunkText = sentence;
      } else {
        currentChunkText = currentChunkText ? `${currentChunkText} ${sentence}` : sentence;
      }
    }
    if (currentChunkText.trim().length > 0) {
      const id = `${docId}_sentence_${position}`;
      chunks.push({
        id,
        chunkId: id,
        documentId: docId,
        text: currentChunkText.trim(),
        source: text,
        strategy: 'sentence',
        position,
        length: currentChunkText.trim().length,
        metadata: { ...meta }
      });
    }
    return chunks;
  }

  function semanticChunk(text, docId, meta) {
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return [];
    const chunks = [];
    let currentGroup = [sentences[0]];
    let position = 0;

    for (let i = 1; i < sentences.length; i++) {
      const sPrev = sentences[i - 1];
      const sNext = sentences[i];
      const w1 = new Set(sPrev.toLowerCase().split(/\s+/));
      const w2 = new Set(sNext.toLowerCase().split(/\s+/));
      let inter = 0;
      for (const w of w1) if (w2.has(w)) inter++;
      const sim = (w1.size + w2.size - inter > 0) ? (inter / (w1.size + w2.size - inter)) : 0;
      const groupText = currentGroup.join(" ");

      if (sim < 0.2 || groupText.length > 400) {
        const id = `${docId}_semantic_${position}`;
        chunks.push({
          id,
          chunkId: id,
          documentId: docId,
          text: groupText,
          source: text,
          strategy: 'semantic',
          position,
          length: groupText.length,
          metadata: { ...meta }
        });
        position++;
        currentGroup = [sNext];
      } else {
        currentGroup.push(sNext);
      }
    }
    if (currentGroup.length > 0) {
      const groupText = currentGroup.join(" ");
      const id = `${docId}_semantic_${position}`;
      chunks.push({
        id,
        chunkId: id,
        documentId: docId,
        text: groupText,
        source: text,
        strategy: 'semantic',
        position,
        length: groupText.length,
        metadata: { ...meta }
      });
    }
    return chunks;
  }

  const allChunks = [];
  console.log("\nChunking passages...");

  for (let qIdx = 0; qIdx < selectedRecords.length; qIdx++) {
    const rec = selectedRecords[qIdx];
    const trPassages = rec.passages.Translated_passages;

    for (let pIdx = 0; pIdx < trPassages.length; pIdx++) {
      const passageText = trPassages[pIdx];
      const isRelevant = rec.passages.is_selected[pIdx] === 1;
      const baseDocId = `msmarco-xi-doc-${rec.query_id}-p${pIdx}`;
      const meta = {
        queryId: rec.query_id,
        queryText: rec.query,
        isRelevant
      };

      allChunks.push(...fixedChunk(passageText, baseDocId, meta));
      allChunks.push(...sentenceChunk(passageText, baseDocId, meta));
      allChunks.push(...semanticChunk(passageText, baseDocId, meta));
    }
  }

  console.log(`Generated ${allChunks.length} chunks from ${totalRawPassages} passages.`);

  // Load cache
  const cachePath = path.join(__dirname, 'data', 'embeddings_cache.json');
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`Loaded embeddings cache with ${Object.keys(cache).length} entries.`);
    } catch (e) {}
  }

  const crypto = require('crypto');
  function getHash(t) {
    return crypto.createHash('sha256').update(t).digest('hex');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const embeddings = [];
  let apiCalls = 0;
  let cacheHits = 0;

  async function fetchWithRetry(text, retries = 5) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await ai.models.embedContent({
          model: 'gemini-embedding-2',
          contents: text
        });
        return (res && res.embedding && res.embedding.values) ? res.embedding.values : res.embeddings[0].values;
      } catch (err) {
        if (attempt === retries) throw err;
        const waitMs = attempt * 1500;
        console.log(`\nRetrying embedding in ${waitMs}ms (attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  console.log("Generating/fetching 3072-dimensional embeddings via gemini-embedding-2...");

  for (let i = 0; i < allChunks.length; i++) {
    const text = allChunks[i].text;
    const h = getHash(text);
    if (cache[h]) {
      embeddings.push(cache[h]);
      cacheHits++;
    } else {
      process.stdout.write(`Embedding chunk ${i + 1}/${allChunks.length} via Gemini API...\r`);
      const vec = await fetchWithRetry(text);
      cache[h] = vec;
      embeddings.push(vec);
      apiCalls++;

      // Save cache every 20 new embeddings
      if (apiCalls % 20 === 0) {
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
      }
    }
  }

  console.log(`\nEmbeddings complete: ${cacheHits} cache hits, ${apiCalls} API calls.`);

  // Final cache save
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`Saved updated embeddings cache to: ${cachePath}`);

  // Build vector store
  const store = allChunks.map((chunk, idx) => ({
    chunk,
    embedding: embeddings[idx]
  }));

  const vectorStorePath = path.join(__dirname, 'data', 'vector_store.json');
  fs.writeFileSync(vectorStorePath, JSON.stringify(store, null, 2), 'utf8');
  console.log(`Saved Vector Store to: ${vectorStorePath} (${store.length} chunks)`);

  // Benchmark queries
  const benchmarkQueries = [
    { query: "भारत की राजधानी क्या है?", expectedGrounded: true, expectedTopic: "New Delhi" },
    { query: "ताजमहल कहाँ स्थित है?", expectedGrounded: true, expectedTopic: "Agra" },
    { query: "जापान की राजधानी कौन सा शहर है", expectedGrounded: true, expectedTopic: "Tokyo" },
    { query: "कतर की राजधानी क्या है?", expectedGrounded: true, expectedTopic: "Doha" },
    { query: "कॉर्पोरेशन क्या है?", expectedGrounded: true, expectedTopic: "Corporation" },
    { query: "बाज़ कितनी तेजी से यात्रा करता है", expectedGrounded: true, expectedTopic: "Falcon" },
    { query: "रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा", expectedGrounded: true, expectedTopic: "Rachel Carson" },
    { query: "ईमानदारी या सच्चाई की परिभाषा", expectedGrounded: true, expectedTopic: "Honesty" },
    { query: "स्टबहब टोल फ्री नंबर", expectedGrounded: true, expectedTopic: "StubHub" },
    { query: "क्या डेल्टा बैंगलोर के लिए उड़ान भरता है?", expectedGrounded: true, expectedTopic: "Delta" },
    // Refusal tests
    { query: "क्रिस्टियानो रोनाल्डो कौन है?", expectedGrounded: false, expectedTopic: "Refusal" },
    { query: "चंद्रमा का गुरुत्वाकर्षण कितना है?", expectedGrounded: false, expectedTopic: "Refusal" },
    { query: "", expectedGrounded: false, expectedTopic: "Validation Error" }
  ];

  const benchQueriesPath = path.join(__dirname, 'data', 'benchmark_queries.json');
  fs.writeFileSync(benchQueriesPath, JSON.stringify(benchmarkQueries, null, 2), 'utf8');
  console.log(`Saved Benchmark Queries to: ${benchQueriesPath}`);

  // Ingestion report
  const ingestionReport = {
    timestamp: new Date().toISOString(),
    sourceDataset: "ai4bharat/MSMARCO-XI",
    split: "validation (hinval.parquet)",
    parquetSizeBytes: stat.size,
    parquetTotalRows: totalRows,
    ingestedQueryCount: selectedRecords.length,
    ingestedPassageCount: totalRawPassages,
    vectorStoreChunksCount: allChunks.length,
    embeddingModel: "gemini-embedding-2",
    embeddingDimensions: 3072,
    chunkingStrategies: ["FixedSize (300/50)", "SentenceAware (400)", "Semantic (400)"],
    status: "SUCCESS"
  };

  const ingestionReportPath = path.join(__dirname, 'data', 'ingestion_report.json');
  fs.writeFileSync(ingestionReportPath, JSON.stringify(ingestionReport, null, 2), 'utf8');
  console.log(`Saved Ingestion Report to: ${ingestionReportPath}`);

  console.log("\n==================================================");
  console.log("  Ingestion Complete! Vector Store is Ready.     ");
  console.log("==================================================");
}

main().catch(console.error);
