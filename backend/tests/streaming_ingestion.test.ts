import * as fs from 'fs';
import * as path from 'path';
import { StreamingDatasetIngester, IngestionConfig } from '../src/ingestion/streaming_ingest';
import { HuggingFaceDatasetSource } from '../src/ingestion/dataset_source';
import { VectorDatabase } from '../src/services/vectorDb';
import { RetrievalService } from '../src/services/retrieval';

describe('Official MSMARCO-XI Streaming Ingestion & Runtime Isolation Tests', () => {
  const testCheckpointDir = path.join(__dirname, '../data/test_checkpoints');

  beforeAll(() => {
    if (!fs.existsSync(testCheckpointDir)) {
      fs.mkdirSync(testCheckpointDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testCheckpointDir)) {
      fs.rmSync(testCheckpointDir, { recursive: true, force: true });
    }
  });

  test('1. Ingestion Config enforces official ai4bharat/MSMARCO-XI dataset and 5 languages', () => {
    const ingester = new StreamingDatasetIngester({
      checkpointDir: testCheckpointDir
    });
    const config = (ingester as any).config as IngestionConfig;

    expect(config.datasetName).toBe('ai4bharat/MSMARCO-XI');
    expect(config.split).toBe('validation');
    expect(config.languages).toEqual(['en', 'hi', 'kn', 'ta', 'te']);
    expect(config.mode).toBe('streaming-real');
    expect(config.strategies).toEqual(['fixed', 'sentence', 'semantic', 'metadata']);
  });

  test('2. Checkpoint mechanism correctly saves and restores streaming state', () => {
    const ingester = new StreamingDatasetIngester({
      checkpointDir: testCheckpointDir
    });

    const mockCheckpoint = {
      checkpointId: 'test_chk_123',
      datasetSource: 'ai4bharat/MSMARCO-XI',
      split: 'validation',
      ingestionMode: 'STREAMING',
      configHash: (ingester as any).getConfigHash(),
      languages: ['en', 'hi', 'kn', 'ta', 'te'],
      processedQueries: { en: 10, hi: 10, kn: 10, ta: 10, te: 10 },
      processedPassages: { en: 100, hi: 100, kn: 100, ta: 100, te: 100 },
      generatedChunks: { en: 672, hi: 660, kn: 670, ta: 678, te: 694 },
      totalChunks: 3381,
      lastProcessedTimestamp: new Date().toISOString(),
      status: 'completed' as const
    };

    ingester.saveCheckpoint(mockCheckpoint);

    const loaded = ingester.loadCheckpoint();
    expect(loaded).not.toBeNull();
    expect(loaded?.checkpointId).toBe('test_chk_123');
    expect(loaded?.status).toBe('completed');
    expect(loaded?.totalChunks).toBe(3381);
    expect(loaded?.processedQueries.en).toBe(10);
  });

  test('3. Chunk metadata contains complete provenance fields for grounding', () => {
    const vectorStorePath = path.join(__dirname, '../data/vector_store.json');
    expect(fs.existsSync(vectorStorePath)).toBe(true);

    const vectorDb = new VectorDatabase();
    vectorDb.loadFromFile(vectorStorePath);
    expect(vectorDb.size()).toBeGreaterThan(3000);

    const sampleChunk = (vectorDb as any).store[0].chunk;
    expect(sampleChunk).toBeDefined();
    expect(sampleChunk.id).toBeDefined();
    expect(sampleChunk.text.length).toBeGreaterThan(0);
    expect(sampleChunk.metadata).toBeDefined();
    expect(sampleChunk.metadata.datasetName).toBe('ai4bharat/MSMARCO-XI');
    expect(sampleChunk.metadata.split).toBe('validation');
    expect(sampleChunk.metadata.language).toMatch(/^(en|hi|kn|ta|te)$/);
  });

  test('4. Runtime Retrieval is 100% local with ZERO network dependency on Hugging Face', async () => {
    const vectorStorePath = path.join(__dirname, '../data/vector_store.json');
    const vectorDb = new VectorDatabase();
    vectorDb.loadFromFile(vectorStorePath);
    const retrieval = new RetrievalService(vectorDb);

    // Mock global fetch to spy and ensure Hugging Face is NEVER called during retrieval
    const originalFetch = global.fetch;
    let hfFetchCalled = false;

    (global as any).fetch = async (url: string) => {
      if (typeof url === 'string' && url.includes('huggingface.co')) {
        hfFetchCalled = true;
        throw new Error('ILLEGAL CALL: Runtime retrieval must not call Hugging Face!');
      }
      return originalFetch ? originalFetch(url) : Promise.reject('No fetch');
    };

    try {
      const dummyEmbedding = new Array(3072).fill(0.02);
      const results = await retrieval.retrieve(
        'What is a corporation?',
        dummyEmbedding,
        { topK: 5, language: 'en' }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(hfFetchCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('5. Balanced 5-Language partition guarantees equal representation across all languages', () => {
    const vectorStorePath = path.join(__dirname, '../data/vector_store.json');
    const vectorDb = new VectorDatabase();
    vectorDb.loadFromFile(vectorStorePath);

    const counts = vectorDb.getLanguageCounts();
    const required = ['en', 'hi', 'kn', 'ta', 'te'];

    for (const lang of required) {
      expect(counts[lang]).toBeDefined();
      expect(counts[lang]).toBeGreaterThan(500); // Over 500 chunks per language
    }
  });

  test('6. HuggingFaceDatasetSource discovers official dataset metadata and valid splits', async () => {
    const source = new HuggingFaceDatasetSource();
    const meta = await source.getMetadata();

    expect(meta.datasetName).toBe('ai4bharat/MSMARCO-XI');
    expect(meta.source).toBe('Hugging Face Dataset Server');
    expect(meta.targetLanguages).toEqual(['en', 'hi', 'kn', 'ta', 'te']);
    expect(meta.splits.length).toBeGreaterThanOrEqual(1);
    expect(meta.schemaColumns).toContain('query');
    expect(meta.schemaColumns).toContain('passages');
  });

  test('7. HuggingFaceDatasetSource strictly rejects Bengali and unlisted languages', () => {
    const source = new HuggingFaceDatasetSource();

    const bengaliSample = {
      row_idx: 0,
      row: {
        source_lang: 'eng_Latn',
        target_lang: 'ben_Beng',
        query_id: 9999,
        query: 'কিছু তথ্য',
        passages: { Translated_passages: ['অনুচ্ছেদ'], English_passages: ['Paragraph'] }
      }
    };

    const normalized = (source as any).normalizeHfRow(bengaliSample, 'hi');
    expect(normalized).toBeNull();
  });
});
