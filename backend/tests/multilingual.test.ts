import * as fs from 'fs';
import * as path from 'path';
import { VectorDatabase } from '../src/services/vectorDb';
import { RetrievalService } from '../src/services/retrieval';
import { EmbeddingService } from '../src/services/embeddings';
import { GenerationService } from '../src/services/generation';
import { SttService } from '../src/services/stt';
import { RagPipeline } from '../src/services/ragPipeline';
import { GuardrailService } from '../src/services/guardrails';
import { RerankingService } from '../src/services/reranking';

describe('Multilingual 5-Language MSMARCO-XI System Tests', () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const manifestPath = path.join(dataDir, 'msmarco-xi', 'processed', 'dataset_manifest.json');
  const subsetPath = path.join(dataDir, 'msmarco-xi', 'processed', 'msmarco_xi_5lang_subset.json');
  const vectorStorePath = path.join(dataDir, 'vector_store.json');
  const ingestionReportPath = path.join(dataDir, 'ingestion_report.json');

  test('1. Dataset manifest exists and contains exact 5 official languages with 10 queries/100 passages each', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.source).toBe('ai4bharat/MSMARCO-XI');
    expect(manifest.targetLanguages).toEqual(['en', 'hi', 'kn', 'ta', 'te']);
    expect(manifest.total_queries).toBe(50);
    expect(manifest.total_passages).toBe(500);

    for (const lang of ['en', 'hi', 'kn', 'ta', 'te']) {
      expect(manifest.languages[lang]).toBeDefined();
      expect(manifest.languages[lang].queryCount).toBe(10);
      expect(manifest.languages[lang].passageCount).toBe(100);
    }
  });

  test('2. Processed 5-language subset JSON has all 5 languages populated with non-empty text', () => {
    expect(fs.existsSync(subsetPath)).toBe(true);
    const subset = JSON.parse(fs.readFileSync(subsetPath, 'utf8'));

    for (const lang of ['en', 'hi', 'kn', 'ta', 'te']) {
      expect(subset[lang]).toBeDefined();
      expect(subset[lang].queries.length).toBe(10);
      expect(subset[lang].passages.length).toBe(100);

      // Verify query text
      for (const q of subset[lang].queries) {
        expect(q.query.trim().length).toBeGreaterThan(3);
        expect(q.queryId).toBeDefined();
      }

      // Verify passage text
      for (const p of subset[lang].passages) {
        expect(p.text.trim().length).toBeGreaterThan(10);
        expect(p.passageId).toBeDefined();
      }
    }
  });

  test('3. Vector Store has chunks for all 5 languages and strictly enforces language isolation', () => {
    expect(fs.existsSync(vectorStorePath)).toBe(true);
    const vectorDb = new VectorDatabase();
    const loaded = vectorDb.loadFromFile(vectorStorePath);
    expect(loaded).toBe(true);
    expect(vectorDb.size()).toBeGreaterThan(3000);

    const counts = vectorDb.getLanguageCounts();
    expect(counts['en']).toBeGreaterThan(500);
    expect(counts['hi']).toBeGreaterThan(500);
    expect(counts['kn']).toBeGreaterThan(500);
    expect(counts['ta']).toBeGreaterThan(500);
    expect(counts['te']).toBeGreaterThan(500);

    const dummyEmbedding = new Array(3072).fill(0.01);

    // Language Isolation check for each language
    for (const lang of ['en', 'hi', 'kn', 'ta', 'te']) {
      const results = vectorDb.search(dummyEmbedding, 10, undefined, lang);
      expect(results.length).toBeGreaterThan(0);
      for (const res of results) {
        const chunkLang = (res.chunk.metadata?.language || res.chunk.metadata?.targetLanguage || '').toLowerCase();
        expect(chunkLang).toBe(lang);
      }
    }
  });

  test('4. GenerationService accurately detects Indic scripts and English', () => {
    const gen = new GenerationService(true);
    expect(gen.detectLanguage("Where is the Taj Mahal located?")).toBe('en');
    expect(gen.detectLanguage("ताजमहल कहाँ स्थित है?")).toBe('hi');
    expect(gen.detectLanguage("ತಾಜ್ ಮಹಲ್ ಎಲ್ಲಿದೆ?")).toBe('kn');
    expect(gen.detectLanguage("தாஜ்மஹால் எங்கே உள்ளது?")).toBe('ta');
    expect(gen.detectLanguage("తాజ్ మహల్ ఎక్కడ ఉంది?")).toBe('te');
  });

  test('5. Sarvam STT supports all 5 standard language codes', () => {
    const stt = new SttService();
    const supported = stt.getSupportedLanguages();
    expect(supported).toContain('hi-IN');
    expect(supported).toContain('kn-IN');
    expect(supported).toContain('ta-IN');
    expect(supported).toContain('te-IN');
    expect(supported).toContain('en-IN');
  });

  test('6. Ingestion report matches real dataset totals and has no mock flags', () => {
    expect(fs.existsSync(ingestionReportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(ingestionReportPath, 'utf8'));

    expect(report.dataset || report.sourceDataset).toBe('ai4bharat/MSMARCO-XI');
    expect(report.languages || report.supportedLanguages).toEqual(['en', 'hi', 'kn', 'ta', 'te']);
    expect(report.totalChunksIndexed || report.totalIndexedChunks).toBeGreaterThan(3000);
    expect(report.chunkingStrategies.length).toBe(4);
    expect(report.runtimeHfDependency).toBe(false);
  });

  test('7. RagPipeline executes queries across all 5 languages without cross-language pollution', async () => {
    const vectorDb = new VectorDatabase();
    vectorDb.loadFromFile(vectorStorePath);
    const embedService = new EmbeddingService('gemini-embedding-2', undefined, true);
    const retrievalService = new RetrievalService(vectorDb);
    const rerankingService = new RerankingService();
    const genService = new GenerationService(true);
    const guardrailService = new GuardrailService(0.30);
    const sttService = new SttService();

    const pipeline = new RagPipeline(
      sttService,
      embedService,
      retrievalService,
      rerankingService,
      genService,
      guardrailService
    );

    const testQueries = [
      { q: "Where is the Taj Mahal located?", lang: "en" },
      { q: "ताजमहल कहाँ स्थित है?", lang: "hi" },
      { q: "ತಾಜ್ ಮಹಲ್ ಎಲ್ಲಿದೆ?", lang: "kn" },
      { q: "தாஜ்மஹால் எங்கே உள்ளது?", lang: "ta" },
      { q: "తాజ్ మహల్ ఎక్కడ ఉంది?", lang: "te" }
    ];

    for (const t of testQueries) {
      const output = await pipeline.executeTextQuery(`test_${t.lang}`, {
        query: t.q,
        languageCode: t.lang,
        confidenceThreshold: 0.1
      });

      expect(output.language).toBe(t.lang);
      expect(output.requestId).toBe(`test_${t.lang}`);
      // All returned sources must match query language
      for (const src of output.sources) {
        expect(src.language).toBe(t.lang);
      }
    }
  });
});
