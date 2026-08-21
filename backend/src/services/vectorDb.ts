import * as fs from 'fs';
import * as path from 'path';
import { Chunk } from './chunking';
import { HNSWVectorIndex } from './hnswIndex';

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export class VectorDatabase {
  private store: { chunk: Chunk; embedding: number[] }[] = [];
  private hnswIndex: HNSWVectorIndex = new HNSWVectorIndex();

  constructor() {}

  /**
   * Clears the in-memory vector store and HNSW index.
   */
  clear(): void {
    this.store = [];
    this.hnswIndex.clear();
  }

  /**
   * Adds chunks and their pre-computed embeddings to the database and HNSW graph index.
   */
  addChunks(chunks: Chunk[], embeddings: number[][]): void {
    if (chunks.length !== embeddings.length) {
      throw new Error(`Dimension mismatch: chunks length (${chunks.length}) does not match embeddings length (${embeddings.length})`);
    }

    for (let i = 0; i < chunks.length; i++) {
      this.store.push({
        chunk: chunks[i],
        embedding: embeddings[i]
      });
      this.hnswIndex.add(chunks[i], embeddings[i]);
    }
  }

  /**
   * Computes cosine similarity via dot product of unit-length vectors.
   */
  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dot = 0;
    const len = Math.min(v1.length, v2.length);
    for (let i = 0; i < len; i++) {
      dot += v1[i] * v2[i];
    }
    return dot;
  }

  /**
   * Performs HNSW vector similarity search with optional strategy and language filtering.
   */
  search(
    queryEmbedding: number[],
    topK: number = 3,
    filterStrategy?: 'fixed' | 'sentence' | 'semantic' | 'metadata',
    filterLanguage?: string
  ): SearchResult[] {
    const hnswResults = this.hnswIndex.search(queryEmbedding, topK * 4, filterLanguage);
    
    let filtered = hnswResults;
    if (filterStrategy) {
      filtered = filtered.filter(r => r.chunk.strategy === filterStrategy);
      if (filtered.length === 0) filtered = hnswResults;
    }

    return filtered.slice(0, topK);
  }

  /**
   * Performs hybrid search combining HNSW vector candidate retrieval and lexical keyword scoring.
   */
  searchWithHybrid(
    queryText: string,
    queryEmbedding: number[],
    keywordScorer: (query: string, text: string) => number,
    hybridWeight: number = 0.35,
    filterStrategy?: 'fixed' | 'sentence' | 'semantic' | 'metadata',
    filterLanguage?: string
  ): SearchResult[] {
    // 1. Retrieve top-60 nearest neighbor vector candidates from HNSW index
    const vectorCandidates = this.hnswIndex.search(queryEmbedding, 60, filterLanguage);

    let candidates = vectorCandidates;
    if (filterStrategy) {
      const stratCandidates = candidates.filter(item => item.chunk.strategy === filterStrategy);
      if (stratCandidates.length >= 3) {
        candidates = stratCandidates;
      }
    }

    // 2. Score candidates with hybrid formula
    const results: SearchResult[] = candidates.map(item => {
      const keywordScore = keywordScorer(queryText, item.chunk.text);
      const score = (1 - hybridWeight) * item.score + hybridWeight * keywordScore;
      return {
        chunk: item.chunk,
        score
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Returns all stored chunks.
   */
  getAllChunks(): Chunk[] {
    return this.store.map(item => item.chunk);
  }

  /**
   * Returns all stored items with both chunks and embeddings.
   */
  getAllChunksWithEmbeddings(): { chunk: Chunk; embedding: number[] }[] {
    return this.store;
  }

  /**
   * Returns chunks filtered by language.
   */
  getChunksByLanguage(language: string): Chunk[] {
    const target = language.toLowerCase().split('-')[0];
    return this.store
      .map(item => item.chunk)
      .filter(c => {
        const l = (c.metadata?.language || c.metadata?.targetLanguage || '').toLowerCase();
        return l === target || l.startsWith(target);
      });
  }

  /**
   * Returns counts of chunks grouped by language.
   */
  getLanguageCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      en: 0,
      hi: 0,
      kn: 0,
      ta: 0,
      te: 0
    };

    for (const item of this.store) {
      const l = (item.chunk.metadata?.language || item.chunk.metadata?.targetLanguage || 'en').toLowerCase().split('-')[0];
      if (counts[l] !== undefined) {
        counts[l]++;
      } else {
        counts[l] = 1;
      }
    }

    return counts;
  }

  /**
   * Serialize the store to a JSON file.
   */
  saveToFile(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const serialized = JSON.stringify(this.store);
    fs.writeFileSync(filePath, serialized, 'utf8');
  }

  /**
   * Saves the in-memory HNSW index structure and binary vectors directly to disk.
   */
  saveSerializedIndex(metaPath?: string, vectorsPath?: string): void {
    const defaultMeta = path.join(__dirname, '..', '..', 'data', 'hnsw_index.json');
    const defaultVectors = path.join(__dirname, '..', '..', 'data', 'hnsw_vectors.bin');
    this.hnswIndex.serializeToDisk(metaPath || defaultMeta, vectorsPath || defaultVectors);
  }

  /**
   * Instantly loads pre-built HNSW graph and binary vectors from disk (<1s).
   */
  loadSerializedIndex(metaPath?: string, vectorsPath?: string): boolean {
    const defaultMeta = path.join(__dirname, '..', '..', 'data', 'hnsw_index.json');
    const defaultVectors = path.join(__dirname, '..', '..', 'data', 'hnsw_vectors.bin');
    const res = this.hnswIndex.deserializeFromDisk(metaPath || defaultMeta, vectorsPath || defaultVectors);
    if (res.success) {
      this.store = res.chunks;
      return true;
    }
    return false;
  }

  loadFromFile(filePath: string): boolean {
    const defaultMeta = path.join(path.dirname(filePath), 'hnsw_index.json');
    const defaultVectors = path.join(path.dirname(filePath), 'hnsw_vectors.bin');
    if (fs.existsSync(defaultMeta) && fs.existsSync(defaultVectors)) {
      return this.loadSerializedIndex(defaultMeta, defaultVectors);
    }
    throw new Error("Use loadFromFileAsync instead to build or convert raw JSON store.");
  }

  async loadFromFileAsync(filePath: string): Promise<boolean> {
    const defaultMeta = path.join(path.dirname(filePath), 'hnsw_index.json');
    const defaultVectors = path.join(path.dirname(filePath), 'hnsw_vectors.bin');

    // 1. FAST PATH: Instant binary deserialization if pre-serialized files exist (<1 second)
    if (fs.existsSync(defaultMeta) && fs.existsSync(defaultVectors)) {
      const fastStart = Date.now();
      const loaded = this.loadSerializedIndex(defaultMeta, defaultVectors);
      if (loaded) {
        const elapsed = Date.now() - fastStart;
        console.log(`✓ Instantly loaded pre-built HNSW index (${this.size()} chunks) in ${elapsed}ms.`);
        return true;
      }
    }

    // 2. MULTI-PART GZIP PATH: Load compressed 84,661 chunks from 3 git-tracked parts
    const dir = path.dirname(filePath);
    const p1 = path.join(dir, 'vector_store_part1.json.gz');
    const p2 = path.join(dir, 'vector_store_part2.json.gz');
    const p3 = path.join(dir, 'vector_store_part3.json.gz');

    if (fs.existsSync(p1) && fs.existsSync(p2) && fs.existsSync(p3)) {
      try {
        this.store = [];
        this.hnswIndex.clear();
        console.log(`Loading full 84,661 vector store from 3 gzip parts in ${dir}...`);
        const zlib = await import('zlib');
        const readline = await import('readline');

        for (const partPath of [p1, p2, p3]) {
          const gunzip = zlib.createGunzip();
          const stream = fs.createReadStream(partPath).pipe(gunzip);
          const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
          for await (const line of rl) {
            const t = line.trim();
            if (!t || t === '[' || t === ']') continue;
            const jsonStr = t.endsWith(',') ? t.slice(0, -1) : t;
            try {
              const item = JSON.parse(jsonStr);
              if (item && item.chunk && item.embedding) {
                this.store.push(item);
                this.hnswIndex.add(item.chunk, item.embedding);
              }
            } catch (e) {}
          }
        }
        console.log(`✓ Successfully loaded full dataset (${this.store.length} chunks) from 3 compressed parts.`);
        return true;
      } catch (err) {
        console.error(`Failed to load multi-part gzip vector store:`, err);
      }
    }

    // 3. Fallback to standard JSON or streaming line-delimited JSON
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      this.store = [];
      this.hnswIndex.clear();
      
      console.log(`Loading vector store from ${filePath}...`);
      const fileContent = fs.readFileSync(filePath, 'utf8').trim();

      if (fileContent.startsWith('[')) {
        // Standard JSON Array format (e.g. vector_store_seed.json)
        const items = JSON.parse(fileContent);
        for (const item of items) {
          if (item && item.chunk && item.embedding) {
            this.store.push(item);
            this.hnswIndex.add(item.chunk, item.embedding);
          }
        }
        console.log(`✓ Successfully loaded ${this.store.length} chunks into HNSW index.`);
        return true;
      }

      // Line-delimited / streaming JSON format
      const readline = await import('readline');
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']') continue;
        
        const jsonStr = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
        try {
          const item = JSON.parse(jsonStr);
          if (item && item.chunk && item.embedding) {
            this.store.push(item);
            this.hnswIndex.add(item.chunk, item.embedding);
          }
        } catch (e) {}
      }

      console.log(`✓ Successfully loaded ${this.store.length} chunks from line-delimited stream.`);
      return true;
    } catch (err) {
      console.error(`Failed to load vector store from ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Gets the total number of chunks currently indexed.
   */
  size(): number {
    return this.store.length;
  }
}
