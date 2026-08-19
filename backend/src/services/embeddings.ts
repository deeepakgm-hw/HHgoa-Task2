import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

export class EmbeddingService {
  private ai: any = null;
  private useMock: boolean = false;
  private dimension: number = 3072; // gemini-embedding-2 standard dimension
  private modelName: string;
  private cachePath: string;
  private cache: Record<string, number[]> = {};
  private cacheUpdated: boolean = false;

  constructor(modelName: string = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2', cachePath?: string, forceMock: boolean = false) {
    this.modelName = modelName;
    
    // Setup file-based cache path
    this.cachePath = cachePath || path.join(__dirname, '..', '..', 'data', 'embeddings_cache.json');
    this.loadCache();
    const apiKey = process.env.GEMINI_API_KEY;
    if (forceMock || !apiKey || apiKey.startsWith('your_')) {
      if (forceMock) {
        console.log("EmbeddingService: Mock mode FORCED by constructor.");
      } else {
        console.warn("GEMINI_API_KEY is not set or placeholder is used. Running EmbeddingService in MOCK mode.");
      }
      this.useMock = true;
    } else {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.error("Failed to initialize GoogleGenAI client, fallback to MOCK mode.", err);
        this.useMock = true;
      }
    }
  }

  getModelName(): string {
    return this.modelName;
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
  private getHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Deterministically generate a mock embedding unit vector based on text hashing.
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

    // Normalize to unit length (L2 normalization)
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
   * Generates a 3072-dimensional embedding vector for the input text. Checks local cache first.
   */
  async embedText(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return this.generateMockEmbedding("");
    }

    const hash = this.getHash(text);
    if (this.cache[hash]) {
      return this.cache[hash];
    }

    let embedding: number[];
    if (this.useMock) {
      embedding = this.generateMockEmbedding(text);
    } else {
      try {
        const response = await this.ai.models.embedContent({
          model: this.modelName,
          contents: text
        });
        
        if (response && response.embeddings && response.embeddings[0] && response.embeddings[0].values) {
          embedding = response.embeddings[0].values;
        } else if (response && response.embedding && response.embedding.values) {
          embedding = response.embedding.values;
        } else {
          throw new Error("Invalid embedding response format");
        }
      } catch (error) {
        console.error(`Gemini embedding error for text "${text.substring(0, 30)}...":`, error);
        embedding = this.generateMockEmbedding(text);
      }
    }

    this.cache[hash] = embedding;
    this.cacheUpdated = true;
    if (Object.keys(this.cache).length < 200) {
      this.saveCache();
    }
    return embedding;
  }

  /**
   * Batch embeds multiple texts using client-side batch calls, checking cache first.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check cache
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || text.trim().length === 0) {
        results[i] = this.generateMockEmbedding("");
        continue;
      }
      const hash = this.getHash(text);
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

    let newEmbeddings: number[][] = [];
    if (this.useMock) {
      newEmbeddings = uncachedTexts.map(t => this.generateMockEmbedding(t));
    } else {
      try {
        // Run concurrent single embedding requests in batches of 10 to avoid hitting limits
        const batchSize = 10;
        for (let i = 0; i < uncachedTexts.length; i += batchSize) {
          const chunk = uncachedTexts.slice(i, i + batchSize);
          const promises = chunk.map(text => 
            this.ai.models.embedContent({
              model: this.modelName,
              contents: text
            }).then((res: any) => {
              if (res && res.embeddings && res.embeddings[0] && res.embeddings[0].values) {
                return res.embeddings[0].values;
              } else if (res && res.embedding && res.embedding.values) {
                return res.embedding.values;
              } else {
                return this.generateMockEmbedding(text);
              }
            }).catch(() => this.generateMockEmbedding(text))
          );
          const chunkResults = await Promise.all(promises);
          newEmbeddings.push(...chunkResults);
        }
      } catch (error) {
        console.error("Batch embedding API error, falling back to mock:", error);
        newEmbeddings = uncachedTexts.map(t => this.generateMockEmbedding(t));
      }
    }

    // Map new embeddings back to result index and update cache
    for (let i = 0; i < uncachedIndices.length; i++) {
      const origIdx = uncachedIndices[i];
      const text = uncachedTexts[i];
      const embedding = newEmbeddings[i];
      const hash = this.getHash(text);

      this.cache[hash] = embedding;
      results[origIdx] = embedding;
    }

    this.cacheUpdated = true;
    this.saveCache();
    return results;
  }
}
