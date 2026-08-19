import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { Chunk, FixedSizeChunker, SentenceAwareChunker, SemanticChunker, MetadataAwareChunker } from './services/chunking';
import { EmbeddingService } from './services/embeddings';
import { VectorDatabase } from './services/vectorDb';

export interface MSMARCOXIEntry {
  queryId?: number;
  query: string;
  answers: string[];
  engQuery?: string;
  engAnswer?: string;
  passages: {
    is_selected: number[];
    English_passages: string[];
    Translated_passages: string[];
  };
  source_lang: string;
  target_lang: string;
}

// Local fallback seed dataset (5 queries / 12 passages)
export const localFallbackDataset: MSMARCOXIEntry[] = [
  {
    query: "ताजमहल कहाँ स्थित है?",
    answers: ["ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के किनारे स्थित है।"],
    passages: {
      is_selected: [1, 0, 0],
      English_passages: [
        "The Taj Mahal is an ivory-white marble mausoleum on the south bank of the Yamuna river in the Indian city of Agra, Uttar Pradesh.",
        "The Agra Fort is a historical fort in the city of Agra in India. It was the main residence of the emperors of the Mughal Dynasty.",
        "New Delhi is the capital of India and a part of the National Capital Territory of Delhi."
      ],
      Translated_passages: [
        "ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के दक्षिणी तट पर स्थित एक हाथीदांत-सफेद संगमरमर का मकबरा है। इसे मुगल सम्राट शाहजहाँ ने अपनी पसंदीदा पत्नी मुमताज महल के मकबरे के लिए बनवाया था।",
        "आगरा किला भारत के आगरा शहर में एक ऐतिहासिक किला है। यह मुगल राजवंश के सम्राटों का मुख्य निवास स्थान था, जो अपनी वास्तुकला के लिए प्रसिद्ध है।",
        "नई दिल्ली भारत की राजधानी है और दिल्ली के राष्ट्रीय राजधानी क्षेत्र का एक हिस्सा है। यह शहर अपने चौड़े रास्तों और हरे-भरे पेड़ों के लिए जाना जाता है।"
      ]
    },
    source_lang: "eng_Latn",
    target_lang: "hin_Deva"
  },
  {
    query: "भारत की राजधानी क्या है?",
    answers: ["भारत की राजधानी नई दिल्ली है।"],
    passages: {
      is_selected: [1, 0, 0],
      English_passages: [
        "New Delhi is the capital of India and houses the executive, legislative, and judiciary branches of the Government.",
        "Mumbai, formerly called Bombay, is the financial capital of India and the capital city of Maharashtra state.",
        "Kolkata is the capital of the Indian state of West Bengal. It is known for its grand colonial architecture."
      ],
      Translated_passages: [
        "नई दिल्ली भारत की राजधानी है और यह भारत सरकार की कार्यकारी, विधायी और न्यायिक शाखाओं का घर है। इसका उद्घाटन 1931 में हुआ था।",
        "मुंबई, जिसे पहले बॉम्बे कहा जाता था, भारत की वित्तीय राजधानी और महाराष्ट्र राज्य की राजधानी है। यह देश का सबसे अधिक आबादी वाला शहर है।",
        "कोलकाता भारतीय राज्य पश्चिम बंगाल की राजधानी है। यह हुगली नदी के पूर्वी किनारे पर स्थित है और इसे संस्कृति का शहर कहा जाता है।"
      ]
    },
    source_lang: "eng_Latn",
    target_lang: "hin_Deva"
  },
  {
    query: "सूर्य ग्रहण कब और क्यों होता है?",
    answers: ["सूर्य ग्रहण तब होता है जब चंद्रमा पृथ्वी और सूर्य के बीच आ जाता है, जिससे सूर्य की रोशनी आंशिक या पूर्ण रूप से अवरुद्ध हो जाती है।"],
    passages: {
      is_selected: [1, 0],
      English_passages: [
        "A solar eclipse occurs when the Moon passes between Earth and the Sun, thereby totally or partly obscuring the image of the Sun for a viewer on Earth.",
        "A lunar eclipse occurs when the Moon moves into the Earth's shadow. This can occur only when the Sun, Earth, and Moon are exactly aligned."
      ],
      Translated_passages: [
        "सूर्य ग्रहण तब होता है जब चंद्रमा पृथ्वी और सूर्य के बीच से गुजरता है, जिससे पृथ्वी पर किसी दर्शक के लिए सूर्य की छवि पूरी तरह या आंशिक रूप से अस्पष्ट हो जाती है। यह घटना केवल अमावस्या के दिन ही हो सकती है जब सूर्य और चंद्रमा पृथ्वी के साथ एक सीध में होते हैं।",
        "चंद्र ग्रहण तब होता है जब चंद्रमा पृथ्वी की छाया में चला जाता है। यह केवल पूर्णिमा की रात को ही हो सकता है जब पृथ्वी सूर्य और चंद्रमा के बीच आ जाती है।"
      ]
    },
    source_lang: "eng_Latn",
    target_lang: "hin_Deva"
  },
  {
    query: "प्रकाश संश्लेषण प्रक्रिया क्या है?",
    answers: ["प्रकाश संश्लेषण पौधों और अन्य जीवों द्वारा उपयोग की जाने वाली एक प्रक्रिया है जो प्रकाश ऊर्जा (आमतौर पर सूर्य की रोशनी) को रासायनिक ऊर्जा में परिवर्तित करती है जिसे बाद में जीवों की गतिविधियों को बढ़ावा देने के लिए जारी किया जा सकता है। इस प्रक्रिया में ऑक्सीजन उप-उत्पाद के रूप में निकलती है।",
    "कोशिकीय श्वसन चयापचय प्रतिक्रियाओं और प्रक्रियाओं का एक सेट है जो पोषक तत्वों से जैव रासायनिक ऊर्जा को एडेनोसिन ट्राइफॉस्फेट (एटीपी) में परिवर्तित करने के लिए किया जाता है।"],
    passages: {
      is_selected: [1, 0],
      English_passages: [
        "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy that can later be released to fuel the organisms' activities.",
        "Cellular respiration is a set of metabolic reactions and processes that take place in the cells of organisms to convert chemical energy from nutrients into ATP."
      ],
      Translated_passages: [
        "प्रकाश संश्लेषण पौधों और अन्य जीवों द्वारा उपयोग की जाने वाली एक प्रक्रिया है जो प्रकाश ऊर्जा (आमतौर पर सूर्य की रोशनी) को रासायनिक ऊर्जा में परिवर्तित करती है जिसे बाद में जीवों की गतिविधियों को बढ़ावा देने के लिए जारी किया जा सकता है। इस प्रक्रिया में ऑक्सीजन उप-उत्पाद के रूप में निकलती है।",
        "कोशिकीय श्वसन चयापचय प्रतिक्रियाओं और प्रक्रियाओं का एक सेट है जो पोषक तत्वों से जैव रासायनिक ऊर्जा को एडेनोसिन ट्राइफॉस्फेट (एटीपी) में परिवर्तित करने के लिए किया जाता है।"
      ]
    },
    source_lang: "eng_Latn",
    target_lang: "hin_Deva"
  },
  {
    query: "कंप्यूटर का आविष्कार किसने किया?",
    answers: ["कंप्यूटर का आविष्कार चार्ल्स बैबेज ने किया था, जिन्हें कंप्यूटर का जनक माना जाता है।"],
    passages: {
      is_selected: [1, 0],
      English_passages: [
        "Charles Babbage, an English mechanical engineer and polymath, originated the concept of a programmable computer. He is considered the 'father of the computer'.",
        "Alan Turing was an English mathematician and computer scientist. He was highly influential in the development of theoretical computer science."
      ],
      Translated_passages: [
        "चार्ल्स बैबेज, एक अंग्रेजी मैकेनिकल इंजीनियर और बहुश्रुत थे, जिन्होंने एक प्रोग्राम करने योग्य कंप्यूटर की अवधारणा की शुरुआत की थी। उन्हें कंप्यूटर का 'जनक' या 'पिता' माना जाता है। उन्होंने एनालिटिकल इंजन का डिजाइन तैयार किया था।",
        "एलन ट्यूरिंग एक अंग्रेजी गणितज्ञ और कंप्यूटर वैज्ञानिक थे। वह सैद्धांतिक कंप्यूटर विज्ञान और कृत्रिम बुद्धिमत्ता के विकास में अत्यधिक प्रभावशाली थे।"
      ]
    },
    source_lang: "eng_Latn",
    target_lang: "hin_Deva"
  }
];

/**
 * Loads the dataset according to the configured mode (real vs seed).
 */
export async function loadDataset(requestedMode?: 'real' | 'seed'): Promise<{
  entries: MSMARCOXIEntry[];
  source: string;
  mode: 'real' | 'seed';
  provenanceDetail: string;
}> {
  const modeEnv = (process.env.DATASET_MODE || '').toLowerCase();
  const isSeedForced = requestedMode === 'seed' || modeEnv === 'seed' || process.argv.includes('--seed');
  const isRealForced = requestedMode === 'real' || modeEnv === 'real' || process.argv.includes('--real');

  const subsetPath = path.join(__dirname, '..', 'data', 'msmarco-xi', 'processed', 'msmarco_xi_real_subset.json');

  if (!isSeedForced && fs.existsSync(subsetPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(subsetPath, 'utf8')) as MSMARCOXIEntry[];
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[Dataset Loader] Successfully loaded REAL ai4bharat/MSMARCO-XI dataset (${data.length} queries) from local processed repository.`);
        return {
          entries: data,
          source: 'ai4bharat/MSMARCO-XI (Validation Split, Hindi hin_Deva)',
          mode: 'real',
          provenanceDetail: `ai4bharat/MSMARCO-XI Real Dataset (${data.length} queries / ${data.reduce((acc, d) => acc + (d.passages?.Translated_passages?.length || 0), 0)} passages)`
        };
      }
    } catch (err: any) {
      console.warn(`[Dataset Loader] Failed to read real subset from ${subsetPath}: ${err.message}.`);
    }
  }

  if (isRealForced && !fs.existsSync(subsetPath)) {
    console.warn(`[Dataset Loader] Real dataset requested but subset file not found at ${subsetPath}. Falling back to local offline seed dataset.`);
  }

  console.log(`[Dataset Loader] Using Local Offline Seed Dataset (5 Queries / 12 Passages).`);
  return {
    entries: localFallbackDataset,
    source: 'local_fallback',
    mode: 'seed',
    provenanceDetail: 'Local Offline Seed / Development Evaluation Split (5 Queries / 12 Passages)'
  };
}

export async function runIngestion(targetMode?: 'real' | 'seed') {
  console.log("=========================================");
  console.log("Starting MSMARCO-XI Ingestion Pipeline");
  console.log("=========================================");

  // 1. Load dataset
  const { entries, source, mode, provenanceDetail } = await loadDataset(targetMode);
  console.log(`Ingestion Mode: ${mode.toUpperCase()}`);
  console.log(`Dataset Source: ${source}`);

  const embedService = new EmbeddingService();
  const vectorDb = new VectorDatabase();

  const fixedChunker = new FixedSizeChunker(300, 50);
  const sentenceChunker = new SentenceAwareChunker(400);
  const semanticChunker = new SemanticChunker(0.7, embedService, 400);
  const metadataChunker = new MetadataAwareChunker(600);

  const allChunks: Chunk[] = [];
  const documentsProcessed = new Set<string>();

  // Strategy comparative metrics tracking arrays
  const strategyMetrics: Record<'fixed' | 'sentence' | 'semantic' | 'metadata', {
    chunks: number;
    sizes: number[];
  }> = {
    fixed: { chunks: 0, sizes: [] },
    sentence: { chunks: 0, sizes: [] },
    semantic: { chunks: 0, sizes: [] },
    metadata: { chunks: 0, sizes: [] }
  };

  let totalPassagesIndexed = 0;

  for (let docIdx = 0; docIdx < entries.length; docIdx++) {
    const entry = entries[docIdx];
    const docId = `msmarco-xi-doc-${docIdx}`;
    documentsProcessed.add(docId);

    // Validate entry structure
    if (!entry.query || !entry.passages || !entry.passages.Translated_passages) {
      console.warn(`[Validation Warning] Skipping malformed entry at row index ${docIdx}`);
      continue;
    }

    const passageCount = entry.passages.Translated_passages.length;
    for (let pIdx = 0; pIdx < passageCount; pIdx++) {
      const text = (entry.passages.Translated_passages[pIdx] || "").trim();
      const englishText = (entry.passages.English_passages && entry.passages.English_passages[pIdx]) || "";
      const isSelected = entry.passages.is_selected && entry.passages.is_selected[pIdx] === 1;

      if (!text) continue;
      totalPassagesIndexed++;

      const sourceMetadata = {
        docIdx,
        passageIdx: pIdx,
        documentIndex: docIdx,
        passageIndex: pIdx,
        isSelected,
        englishSource: englishText,
        sourceLanguage: entry.source_lang || "eng_Latn",
        targetLanguage: entry.target_lang || "hin_Deva",
        originalQuery: entry.query
      };

      const passageId = `${docId}-p${pIdx}`;

      // Run all 4 chunking strategies
      const fChunks = fixedChunker.chunk(text, passageId, sourceMetadata);
      const sChunks = sentenceChunker.chunk(text, passageId, sourceMetadata);
      const semChunks = await semanticChunker.chunkAsync(text, passageId, sourceMetadata);
      const mChunks = metadataChunker.chunk(text, passageId, sourceMetadata);

      // Record metrics
      strategyMetrics.fixed.chunks += fChunks.length;
      strategyMetrics.fixed.sizes.push(...fChunks.map(c => c.length));

      strategyMetrics.sentence.chunks += sChunks.length;
      strategyMetrics.sentence.sizes.push(...sChunks.map(c => c.length));

      strategyMetrics.semantic.chunks += semChunks.length;
      strategyMetrics.semantic.sizes.push(...semChunks.map(c => c.length));

      strategyMetrics.metadata.chunks += mChunks.length;
      strategyMetrics.metadata.sizes.push(...mChunks.map(c => c.length));

      allChunks.push(...fChunks, ...sChunks, ...semChunks, ...mChunks);
    }
  }

  console.log(`Ingesting and generating embeddings for ${allChunks.length} chunks across ${totalPassagesIndexed} passages...`);

  // Batch embed chunks using the updated service (automatically cache-friendly and client-side batched)
  const chunkTexts = allChunks.map(c => c.text);
  const embeddings = await embedService.embedBatch(chunkTexts);

  // Validate embeddings
  const hasNaN = embeddings.some((vec) => vec.some(v => isNaN(v) || !isFinite(v)));
  if (hasNaN) {
    throw new Error("Validation Error: Embedding vector contains NaN or Infinity values.");
  }

  // Load into vector DB
  vectorDb.addChunks(allChunks, embeddings);

  // Persist index file
  const outputPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  vectorDb.saveToFile(outputPath);
  console.log(`Saved vector store entries to: ${outputPath}`);

  // Create comparative stats
  const compileStats = (key: 'fixed' | 'sentence' | 'semantic' | 'metadata') => {
    const sizes = strategyMetrics[key].sizes;
    if (sizes.length === 0) return { chunks: 0, avg: 0, min: 0, max: 0 };
    const sum = sizes.reduce((a, b) => a + b, 0);
    return {
      chunks: strategyMetrics[key].chunks,
      avg: parseFloat((sum / sizes.length).toFixed(1)),
      min: Math.min(...sizes),
      max: Math.max(...sizes)
    };
  };

  const fixedStats = compileStats('fixed');
  const sentenceStats = compileStats('sentence');
  const semanticStats = compileStats('semantic');
  const metadataStats = compileStats('metadata');

  // Print Comparison Table
  console.log("\n========================================================");
  console.log("Chunking Comparative Analysis");
  console.log("========================================================");
  console.log("Strategy    | Documents | Chunks | Avg Size | Min | Max");
  console.log("------------+-----------+--------+----------+-----+-----");
  console.log(`FixedSize   | ${documentsProcessed.size.toString().padEnd(9)} | ${fixedStats.chunks.toString().padEnd(6)} | ${fixedStats.avg.toString().padEnd(8)} | ${fixedStats.min.toString().padEnd(3)} | ${fixedStats.max}`);
  console.log(`Sentence    | ${documentsProcessed.size.toString().padEnd(9)} | ${sentenceStats.chunks.toString().padEnd(6)} | ${sentenceStats.avg.toString().padEnd(8)} | ${sentenceStats.min.toString().padEnd(3)} | ${sentenceStats.max}`);
  console.log(`Semantic    | ${documentsProcessed.size.toString().padEnd(9)} | ${semanticStats.chunks.toString().padEnd(6)} | ${semanticStats.avg.toString().padEnd(8)} | ${semanticStats.min.toString().padEnd(3)} | ${semanticStats.max}`);
  console.log(`Metadata    | ${documentsProcessed.size.toString().padEnd(9)} | ${metadataStats.chunks.toString().padEnd(6)} | ${metadataStats.avg.toString().padEnd(8)} | ${metadataStats.min.toString().padEnd(3)} | ${metadataStats.max}`);
  console.log("========================================================\n");

  // Save report JSON file
  const reportPath = path.join(__dirname, '..', 'data', 'ingestion_report.json');
  const isReal = mode === 'real';
  const report = {
    timestamp: new Date().toISOString(),
    datasetMode: mode,
    fullDatasetSource: "ai4bharat/MSMARCO-XI",
    currentEvaluationData: provenanceDetail,
    source,
    split: "validation",
    isRemoteIngested: isReal,
    fallbackUsed: !isReal,
    documentsProcessedCount: totalPassagesIndexed,
    queriesProcessedCount: entries.length,
    totalChunksIndexed: allChunks.length,
    languages: Array.from(new Set(entries.map(e => e.target_lang))),
    metrics: {
      fixed: { documents: documentsProcessed.size, passages: totalPassagesIndexed, ...fixedStats },
      sentence: { documents: documentsProcessed.size, passages: totalPassagesIndexed, ...sentenceStats },
      semantic: { documents: documentsProcessed.size, passages: totalPassagesIndexed, ...semanticStats },
      metadata: { documents: documentsProcessed.size, passages: totalPassagesIndexed, ...metadataStats }
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Successfully generated Ingestion Report at: ${reportPath}`);
}

if (require.main === module) {
  runIngestion().catch(err => {
    console.error("Ingestion pipeline failed:", err);
    process.exit(1);
  });
}
