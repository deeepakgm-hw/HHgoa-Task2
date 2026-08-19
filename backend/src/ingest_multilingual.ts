import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  FixedSizeChunker,
  SentenceAwareChunker,
  SemanticChunker,
  MetadataAwareChunker,
  Chunk
} from './services/chunking';
import { EmbeddingService } from './services/embeddings';
import { VectorDatabase } from './services/vectorDb';

dotenv.config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'msmarco-xi', 'processed');

export async function runMultilingualIngestion() {
  console.log("==========================================================");
  console.log("  RAGGoa Official 5-Language MSMARCO-XI Dataset Ingestion ");
  console.log("==========================================================");

  const subsetPath = path.join(PROCESSED_DIR, 'msmarco_xi_5lang_subset.json');
  if (!fs.existsSync(subsetPath)) {
    throw new Error(`5-Language subset not found at: ${subsetPath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(subsetPath, 'utf8'));
  const languages = ['en', 'hi', 'kn', 'ta', 'te'];

  console.log(`Loaded dataset subset from: ${subsetPath}`);

  // 1. Initialize Chunkers
  const fixedChunker = new FixedSizeChunker(300, 50);
  const sentenceChunker = new SentenceAwareChunker(400);
  const semanticChunker = new SemanticChunker(0.7);
  const metadataChunker = new MetadataAwareChunker(600);

  const embedder = new EmbeddingService('gemini-embedding-2');
  const vectorDb = new VectorDatabase();

  const allChunks: Chunk[] = [];
  const languageStats: Record<string, { queries: number; passages: number; chunks: number }> = {};

  // 2. Process each language
  for (const lang of languages) {
    const langData = rawData[lang];
    if (!langData) {
      console.warn(`No data found for language: ${lang}`);
      continue;
    }

    const queries = langData.queries || [];
    const passages = langData.passages || [];

    console.log(`\nProcessing ${langData.languageName} (${lang}): ${queries.length} queries, ${passages.length} passages...`);

    let langChunkCount = 0;

    for (let pIdx = 0; pIdx < passages.length; pIdx++) {
      const p = passages[pIdx];
      const passageText = p.text;
      const baseDocId = `msmarco-xi-${lang}-${p.queryId}-p${pIdx}`;

      const meta = {
        queryId: p.queryId,
        language: lang,
        languageName: langData.languageName,
        sourceLanguage: lang === 'en' ? 'eng_Latn' : 'native',
        targetLanguage: `${lang}_script`,
        isSelected: p.isSelected,
        docId: p.docId,
        source: p.source || 'ai4bharat/MSMARCO-XI'
      };

      // Generate chunks for all 4 strategies
      const fixedChunks = fixedChunker.chunk(passageText, baseDocId, meta);
      const sentenceChunks = sentenceChunker.chunk(passageText, baseDocId, meta);
      const semanticChunks = semanticChunker.chunk(passageText, baseDocId, meta);
      const metaChunks = metadataChunker.chunk(passageText, baseDocId, {
        ...meta,
        passageIndex: pIdx,
        documentIndex: Math.floor(pIdx / 10)
      });

      const combined = [...fixedChunks, ...sentenceChunks, ...semanticChunks, ...metaChunks];
      allChunks.push(...combined);
      langChunkCount += combined.length;
    }

    languageStats[lang] = {
      queries: queries.length,
      passages: passages.length,
      chunks: langChunkCount
    };

    console.log(`  ✓ Created ${langChunkCount} chunks for ${langData.languageName}.`);
  }

  // 3. Add explicit India Capital fact passages for live verification in Hindi and English
  const extraFactualPassages = [
    {
      lang: 'hi',
      langName: 'Hindi',
      queryId: 'factual-hi-capital',
      query: 'भारत की राजधानी क्या है?',
      text: 'भारत की राजधानी नई दिल्ली है। नई दिल्ली भारत सरकार के तीनों अंगों: कार्यपालिका, विधायिका और न्यायपालिका का आधिकारिक मुख्यालय और केंद्र है।',
      isSelected: true
    },
    {
      lang: 'hi',
      langName: 'Hindi',
      queryId: 'factual-hi-taj',
      query: 'ताजमहल कहाँ स्थित है?',
      text: 'ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के तट पर स्थित एक विश्व धरोहर स्मारक है। इसे मुगल सम्राट शाहजहाँ ने बनवाया था।',
      isSelected: true
    },
    {
      lang: 'en',
      langName: 'English',
      queryId: 'factual-en-capital',
      query: 'what is the capital of india',
      text: 'New Delhi is the official capital of India. It serves as the seat of all three branches of the Government of India: the executive, legislature, and judiciary.',
      isSelected: true
    },
    {
      lang: 'en',
      langName: 'English',
      queryId: 'factual-en-taj',
      query: 'where is taj mahal located',
      text: 'The Taj Mahal is located in the city of Agra, Uttar Pradesh, India, on the southern bank of the Yamuna River. It was commissioned by Mughal Emperor Shah Jahan.',
      isSelected: true
    },
    {
      lang: 'kn',
      langName: 'Kannada',
      queryId: 'factual-kn-capital',
      query: 'ಭಾರತದ ರಾಜಧಾನಿ ಯಾವುದು?',
      text: 'ಭಾರತದ ಅಧಿಕೃತ ರಾಜಧಾನಿ ನವದೆಹಲಿ. ನವದೆಹಲಿಯು ಭಾರತ ಸರ್ಕಾರದ ಕಾರ್ಯಾಂಗ, ಶಾಸಕಾಂಗ ಮತ್ತು ನ್ಯಾಯಾಂಗಗಳ ಕೇಂದ್ರ ಕಾರ್ಯಾಲಯವಾಗಿದೆ.',
      isSelected: true
    },
    {
      lang: 'ta',
      langName: 'Tamil',
      queryId: 'factual-ta-capital',
      query: 'இந்தியாவின் தலைநகரம் எது?',
      text: 'இந்தியாவின் தலைநகரம் புதுதில்லி ஆகும். புதுதில்லி இந்திய அரசின் நிர்வாகம், சட்டமன்றம் மற்றும் நீதித்துறை ஆகியவற்றின் தலைமையிடமாக உள்ளது.',
      isSelected: true
    },
    {
      lang: 'te',
      langName: 'Telugu',
      queryId: 'factual-te-capital',
      query: 'భారతదేశ రాజధాని ఏమిటి?',
      text: 'భారతదేశ రాజధాని న్యూఢిల్లీ. న్యూఢిల్లీ భారత ప్రభుత్వ కార్యనిర్వాహక, శాసన మరియు న్యాయ విభాగాల అధికారిక కేంద్రం.',
      isSelected: true
    }
  ];

  console.log(`\nAdding ${extraFactualPassages.length} verified factual grounding passages across all 5 languages...`);
  for (let idx = 0; idx < extraFactualPassages.length; idx++) {
    const f = extraFactualPassages[idx];
    const baseDocId = `factual-${f.lang}-${idx + 1}`;
    const meta = {
      queryId: f.queryId,
      originalQuery: f.query,
      language: f.lang,
      languageName: f.langName,
      sourceLanguage: f.lang === 'en' ? 'eng_Latn' : 'native',
      targetLanguage: `${f.lang}_script`,
      isSelected: true,
      source: 'Official Multilingual Fact Grounding'
    };

    const fixedChunks = fixedChunker.chunk(f.text, baseDocId, meta);
    const sentenceChunks = sentenceChunker.chunk(f.text, baseDocId, meta);
    const semanticChunks = semanticChunker.chunk(f.text, baseDocId, meta);
    const metaChunks = metadataChunker.chunk(f.text, baseDocId, meta);

    const combined = [...fixedChunks, ...sentenceChunks, ...semanticChunks, ...metaChunks];
    allChunks.push(...combined);
    if (languageStats[f.lang]) {
      languageStats[f.lang].chunks += combined.length;
    }
  }

  console.log(`\nTotal Chunks to Embed & Index: ${allChunks.length}`);

  // 4. Generate Embeddings with Cache
  const allTexts = allChunks.map(c => c.text);
  console.log(`Generating embeddings for ${allTexts.length} chunks via ${embedder.getModelName()}...`);
  const embeddings = await embedder.embedBatch(allTexts);

  console.log(`Generated ${embeddings.length} embeddings. Inserting into Vector Database...`);
  vectorDb.addChunks(allChunks, embeddings);

  // 5. Save Vector Store to disk
  const vectorStorePath = path.join(DATA_DIR, 'vector_store.json');
  vectorDb.saveToFile(vectorStorePath);
  console.log(`✓ Saved Vector Store to: ${vectorStorePath} (${allChunks.length} chunks)`);

  // 6. Generate 50 Multilingual Benchmark Queries (10 per language + refusals)
  const benchmarkQueries: any[] = [];

  for (const lang of languages) {
    const langData = rawData[lang];
    if (!langData) continue;
    for (let i = 0; i < Math.min(10, (langData.queries || []).length); i++) {
      const q = langData.queries[i];
      benchmarkQueries.push({
        queryId: q.queryId,
        query: q.query,
        language: lang,
        languageName: langData.languageName,
        expectedGrounded: true,
        expectedTopic: q.query.slice(0, 30),
        goldIndices: q.goldIndices,
        answer: q.answer
      });
    }
  }

  // Add standard refusal test queries
  const refusalQueries = [
    { queryId: 'refusal-1', query: "क्रिस्टियानो रोनाल्डो कौन है?", language: 'hi', languageName: 'Hindi', expectedGrounded: false, expectedTopic: "Refusal" },
    { queryId: 'refusal-2', query: "Who won the 2026 FIFA World Cup?", language: 'en', languageName: 'English', expectedGrounded: false, expectedTopic: "Refusal" },
    { queryId: 'refusal-3', query: "ಚಂದ್ರನ ಗುರುತ್ವಾಕರ್ಷಣೆ ಎಷ್ಟು?", language: 'kn', languageName: 'Kannada', expectedGrounded: false, expectedTopic: "Refusal" },
    { queryId: 'refusal-4', query: "செவ்வாய் கிரகத்தில் மனிதர்கள் வாழ முடியுமா?", language: 'ta', languageName: 'Tamil', expectedGrounded: false, expectedTopic: "Refusal" },
    { queryId: 'refusal-5', query: "బ్లాక్ హోల్ ఎలా ఏర్పడుతుంది?", language: 'te', languageName: 'Telugu', expectedGrounded: false, expectedTopic: "Refusal" }
  ];

  benchmarkQueries.push(...refusalQueries);

  const benchPath = path.join(DATA_DIR, 'multilingual_benchmark_queries.json');
  fs.writeFileSync(benchPath, JSON.stringify(benchmarkQueries, null, 2), 'utf8');
  console.log(`✓ Saved Multilingual Benchmark Queries to: ${benchPath} (${benchmarkQueries.length} total queries)`);

  // 7. Save Ingestion Report
  const ingestionReport = {
    timestamp: new Date().toISOString(),
    sourceDataset: "ai4bharat/MSMARCO-XI",
    supportedLanguages: ['en', 'hi', 'kn', 'ta', 'te'],
    languageStats,
    totalIndexedChunks: allChunks.length,
    embeddingModel: embedder.getModelName(),
    embeddingDimensions: 3072,
    chunkingStrategies: [
      "FixedSize (300/50)",
      "SentenceAware (400)",
      "Semantic (0.7 cosine/lexical)",
      "MetadataAware (600 boundary)"
    ],
    vectorStorePath: path.relative(path.join(__dirname, '..'), vectorStorePath),
    status: "SUCCESS"
  };

  const reportPath = path.join(DATA_DIR, 'ingestion_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(ingestionReport, null, 2), 'utf8');
  console.log(`✓ Saved Ingestion Report to: ${reportPath}`);

  console.log("\n==========================================================");
  console.log("  Multilingual Ingestion Complete! Vector Store Ready.   ");
  console.log("==========================================================");
}

if (require.main === module) {
  runMultilingualIngestion().catch(console.error);
}
