import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

export class EmbeddingService {
  private dimension: number = 384; // Xenova/multilingual-e5-small native dimension
  private modelName: string = 'Xenova/multilingual-e5-small';
  private cachePath: string;
  private cache: Record<string, number[]> = {};
  private cacheUpdated: boolean = false;
  private pipelinePromise: Promise<any> | null = null;
  private isPipelineReady: boolean = false;

  constructor(modelName?: string, cachePath?: string, forceMock: boolean = false) {
    if (modelName) this.modelName = modelName;
    this.cachePath = cachePath || path.join(__dirname, '..', '..', 'data', 'embeddings_cache.json');
    this.loadCache();

    if (!forceMock) {
      this.initPipeline();
    } else {
      console.log("EmbeddingService: Running in forced mock mode.");
    }
  }

  private initPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        try {
          const { pipeline } = await import('@xenova/transformers');
          const extractor = await pipeline('feature-extraction', this.modelName, {
            quantized: true
          });
          this.isPipelineReady = true;
          return extractor;
        } catch (err) {
          console.error(`Failed to load local embedding pipeline ${this.modelName}:`, err);
          return null;
        }
      })();
    }
    return this.pipelinePromise;
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getDimension(): number {
    return this.dimension;
  }

  /**
   * Loads the persistent cache of text embeddings from disk.
   */
  private loadCache(): void {
    if (fs.existsSync(this.cachePath)) {
      try {
        const data = fs.readFileSync(this.cachePath, 'utf8');
        this.cache = JSON.parse(data);
      } catch (err) {
        console.error(`Failed to load embeddings cache from ${this.cachePath}:`, err);
      }
    }
  }

  /**
   * Persists the text embeddings cache to disk if updates occurred.
   */
  public saveCache(): void {
    if (!this.cacheUpdated) return;
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf8');
      this.cacheUpdated = false;
    } catch (err) {
      console.error(`Failed to save embeddings cache to ${this.cachePath}:`, err);
    }
  }

  /**
   * Creates a SHA-256 hash of the input text to serve as the cache lookup key.
   */
  private getHash(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Deterministically generate a fallback unit vector if neural pipeline is unavailable.
   */
  public generateMockEmbedding(text: string): number[] {
    const vector = new Array(this.dimension).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }

    for (let i = 0; i < this.dimension; i++) {
      const val = Math.sin(hash + i * 31) * 10000;
      vector[i] = val - Math.floor(val) - 0.5;
    }

    let sumSquares = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSquares += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSquares);
    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }

  /**
   * Generates a 384-dimensional embedding vector for the input text. Checks local cache first.
   */
  async embedText(text: string, isQuery: boolean = true): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return this.generateMockEmbedding("");
    }

    const cacheKey = `${isQuery ? 'q:' : 'p:'}${text}`;
    const hash = this.getHash(cacheKey);
    if (this.cache[hash]) {
      return this.cache[hash];
    }

    let embedding: number[];
    try {
      const extractor = await this.initPipeline();
      if (extractor) {
        const input = (isQuery ? 'query: ' : 'passage: ') + text;
        const output = await extractor(input, { pooling: 'mean', normalize: true });
        embedding = Array.from(output.data);
      } else {
        embedding = this.generateMockEmbedding(text);
      }
    } catch (error) {
      console.error(`Local embedding inference error for text "${text.substring(0, 30)}...":`, error);
      embedding = this.generateMockEmbedding(text);
    }

    this.cache[hash] = embedding;
    this.cacheUpdated = true;
    if (Object.keys(this.cache).length % 100 === 0) {
      this.saveCache();
    }
    return embedding;
  }

  /**
   * Batch embeds multiple texts using local transformer pipeline, checking cache first.
   */
  async embedBatch(texts: string[], isQuery: boolean = false): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // 1. Check cache
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || text.trim().length === 0) {
        results[i] = this.generateMockEmbedding("");
        continue;
      }
      const cacheKey = `${isQuery ? 'q:' : 'p:'}${text}`;
      const hash = this.getHash(cacheKey);
      if (this.cache[hash]) {
        results[i] = this.cache[hash];
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(text);
      }
    }

    if (uncachedTexts.length === 0) {
      return results;
    }

    // 2. Compute embeddings for uncached texts
    const extractor = await this.initPipeline();
    for (let i = 0; i < uncachedTexts.length; i++) {
      const origIdx = uncachedIndices[i];
      const text = uncachedTexts[i];
      let embedding: number[];
      try {
        if (extractor) {
          const input = (isQuery ? 'query: ' : 'passage: ') + text;
          const output = await extractor(input, { pooling: 'mean', normalize: true });
          embedding = Array.from(output.data);
        } else {
          embedding = this.generateMockEmbedding(text);
        }
      } catch (err) {
        embedding = this.generateMockEmbedding(text);
      }

      const cacheKey = `${isQuery ? 'q:' : 'p:'}${text}`;
      const hash = this.getHash(cacheKey);
      this.cache[hash] = embedding;
      results[origIdx] = embedding;
    }

    this.cacheUpdated = true;
    this.saveCache();
    return results;
  }
}
