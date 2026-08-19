import * as fs from 'fs';
import * as path from 'path';
import { Chunk } from './chunking';

export interface VectorSearchResult {
  chunk: Chunk;
  score: number;
}

/**
 * High-Performance In-Memory Hierarchical Navigable Small World (HNSW) Vector Index
 * Optimized with Float32Array cosine similarity and multi-language partitioned sub-graphs.
 */
export class HNSWVectorIndex {
  private dimension: number;
  private M: number; // Max outgoing connections per node per layer
  private efConstruction: number; // Size of dynamic candidate list during construction
  private efSearch: number; // Size of dynamic candidate list during search
  private mL: number; // Normalization factor for level generation

  // Language partitioned indices
  private partitions: Map<string, {
    nodes: Array<{
      id: number;
      chunk: Chunk;
      vector: Float32Array;
      level: number;
      neighbors: Map<number, number[]>; // layer -> array of neighbor node ids
    }>;
    enterNodeId: number | null;
    maxLevel: number;
  }> = new Map();

  constructor(
    dimension: number = 384,
    M: number = 16,
    efConstruction: number = 64,
    efSearch: number = 32
  ) {
    this.dimension = dimension;
    this.M = M;
    this.efConstruction = efConstruction;
    this.efSearch = efSearch;
    this.mL = 1 / Math.log(M);
  }

  private getPartition(language?: string) {
    const lang = (language || 'en').toLowerCase().split('-')[0];
    if (!this.partitions.has(lang)) {
      this.partitions.set(lang, {
        nodes: [],
        enterNodeId: null,
        maxLevel: -1
      });
    }
    return { lang, partition: this.partitions.get(lang)! };
  }

  private getRandomLevel(): number {
    let r = Math.random();
    while (r === 0) r = Math.random();
    return Math.floor(-Math.log(r) * this.mL);
  }

  /**
   * Fast Dot-Product / Cosine Similarity using Float32Array with 8-way loop unrolling
   */
  public static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0.0;
    const len = a.length;
    let i = 0;
    for (; i <= len - 8; i += 8) {
      dot += a[i] * b[i] +
             a[i + 1] * b[i + 1] +
             a[i + 2] * b[i + 2] +
             a[i + 3] * b[i + 3] +
             a[i + 4] * b[i + 4] +
             a[i + 5] * b[i + 5] +
             a[i + 6] * b[i + 6] +
             a[i + 7] * b[i + 7];
    }
    for (; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  private static insertSorted(arr: Array<{ id: number; score: number }>, item: { id: number; score: number }): void {
    let low = 0;
    let high = arr.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (arr[mid].score > item.score) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    arr.splice(low, 0, item);
  }

  /**
   * Insert a chunk with its float embedding into the HNSW graph
   */
  public add(chunk: Chunk, rawEmbedding: number[] | Float32Array): void {
    const { partition } = this.getPartition(chunk.metadata?.language);
    const vector = rawEmbedding instanceof Float32Array ? rawEmbedding : new Float32Array(rawEmbedding);

    // Ensure L2 normalization
    let norm = 0.0;
    for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    if (norm > 0) {
      const invNorm = 1.0 / Math.sqrt(norm);
      for (let i = 0; i < vector.length; i++) vector[i] *= invNorm;
    }

    const newNodeId = partition.nodes.length;
    const nodeLevel = this.getRandomLevel();
    const neighbors = new Map<number, number[]>();

    for (let l = 0; l <= nodeLevel; l++) {
      neighbors.set(l, []);
    }

    const newNode = {
      id: newNodeId,
      chunk,
      vector,
      level: nodeLevel,
      neighbors
    };

    if (partition.enterNodeId === null) {
      partition.nodes.push(newNode);
      partition.enterNodeId = newNodeId;
      partition.maxLevel = nodeLevel;
      return;
    }

    let currObj = partition.enterNodeId;
    let currDist = HNSWVectorIndex.cosineSimilarity(vector, partition.nodes[currObj].vector);

    // 1. Search upper layers to find closest entry point to nodeLevel
    for (let level = partition.maxLevel; level > nodeLevel; level--) {
      let changed = true;
      while (changed) {
        changed = false;
        const neighborIds = partition.nodes[currObj].neighbors.get(level) || [];
        for (const nId of neighborIds) {
          const d = HNSWVectorIndex.cosineSimilarity(vector, partition.nodes[nId].vector);
          if (d > currDist) {
            currDist = d;
            currObj = nId;
            changed = true;
          }
        }
      }
    }

    // 2. Search and connect at layers <= nodeLevel
    for (let level = Math.min(nodeLevel, partition.maxLevel); level >= 0; level--) {
      const candidates = this.searchLayer(partition, vector, currObj, this.efConstruction, level);
      const chosenNeighbors = candidates.slice(0, this.M).map(c => c.id);

      newNode.neighbors.set(level, chosenNeighbors);

      // Add bidirectional edges
      for (const nId of chosenNeighbors) {
        const nNeighbors = partition.nodes[nId].neighbors.get(level);
        if (nNeighbors) {
          nNeighbors.push(newNodeId);
          if (nNeighbors.length > this.M * 2) {
            nNeighbors.splice(this.M * 2);
          }
        }
      }

      if (candidates.length > 0) {
        currObj = candidates[0].id;
      }
    }

    if (nodeLevel > partition.maxLevel) {
      partition.maxLevel = nodeLevel;
      partition.enterNodeId = newNodeId;
    }

    partition.nodes.push(newNode);
  }

  private searchLayer(
    partition: { nodes: any[] },
    queryVector: Float32Array,
    entryPointId: number,
    ef: number,
    level: number
  ): Array<{ id: number; score: number }> {
    const visited = new Set<number>();
    visited.add(entryPointId);

    const entryDist = HNSWVectorIndex.cosineSimilarity(queryVector, partition.nodes[entryPointId].vector);
    const candidates: Array<{ id: number; score: number }> = [{ id: entryPointId, score: entryDist }];
    const w: Array<{ id: number; score: number }> = [{ id: entryPointId, score: entryDist }];

    while (candidates.length > 0) {
      const curr = candidates.shift()!;
      const worstW = w[w.length - 1];

      if (curr.score < worstW.score && w.length >= ef) {
        break;
      }

      const neighborIds = partition.nodes[curr.id].neighbors.get(level) || [];
      for (const nId of neighborIds) {
        if (!visited.has(nId)) {
          visited.add(nId);
          const d = HNSWVectorIndex.cosineSimilarity(queryVector, partition.nodes[nId].vector);
          if (d > worstW.score || w.length < ef) {
            const item = { id: nId, score: d };
            HNSWVectorIndex.insertSorted(candidates, item);
            HNSWVectorIndex.insertSorted(w, item);
            if (w.length > ef) {
              w.pop();
            }
          }
        }
      }
    }

    return w;
  }

  /**
   * Search top-K nearest neighbors using the HNSW graph index
   */
  public search(
    queryVector: number[] | Float32Array,
    topK: number = 5,
    language?: string
  ): VectorSearchResult[] {
    const { partition } = this.getPartition(language);
    if (partition.nodes.length === 0 || partition.enterNodeId === null) {
      return [];
    }

    const qVec = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);

    // Ensure L2 normalization of query vector
    let qNorm = 0.0;
    for (let i = 0; i < qVec.length; i++) qNorm += qVec[i] * qVec[i];
    if (qNorm > 0) {
      const invNorm = 1.0 / Math.sqrt(qNorm);
      for (let i = 0; i < qVec.length; i++) qVec[i] *= invNorm;
    }

    let currObj = partition.enterNodeId;
    let currDist = HNSWVectorIndex.cosineSimilarity(qVec, partition.nodes[currObj].vector);

    // Zoom down the levels
    for (let level = partition.maxLevel; level > 0; level--) {
      let changed = true;
      while (changed) {
        changed = false;
        const neighborIds = partition.nodes[currObj].neighbors.get(level) || [];
        for (const nId of neighborIds) {
          const d = HNSWVectorIndex.cosineSimilarity(qVec, partition.nodes[nId].vector);
          if (d > currDist) {
            currDist = d;
            currObj = nId;
            changed = true;
          }
        }
      }
    }

    // Search layer 0 with efSearch
    const results = this.searchLayer(partition, qVec, currObj, Math.max(this.efSearch, topK * 2), 0);

    return results.slice(0, topK).map(r => ({
      chunk: partition.nodes[r.id].chunk,
      score: Math.max(0, Math.min(1, (r.score + 1) / 2)) // Normalize [-1, 1] to [0, 1]
    }));
  }

  public getTotalSize(): number {
    let count = 0;
    for (const p of this.partitions.values()) {
      count += p.nodes.length;
    }
    return count;
  }

  public clear(): void {
    this.partitions.clear();
  }

  /**
   * Serializes the pre-built HNSW graph and float vectors to disk for instant (<1s) cold-start loading.
   */
  public serializeToDisk(metaPath: string, vectorsPath: string): void {
    let totalNodes = 0;
    for (const p of this.partitions.values()) {
      totalNodes += p.nodes.length;
    }

    const floatBuffer = new Float32Array(totalNodes * this.dimension);
    const serializedPartitions: Record<string, any> = {};
    let globalVectorIdx = 0;

    for (const [lang, p] of this.partitions.entries()) {
      const nodesData = [];
      for (const node of p.nodes) {
        const offset = globalVectorIdx * this.dimension;
        floatBuffer.set(node.vector, offset);
        
        nodesData.push({
          id: node.id,
          chunk: node.chunk,
          level: node.level,
          neighbors: Array.from(node.neighbors.entries()),
          vectorOffset: offset
        });
        globalVectorIdx++;
      }

      serializedPartitions[lang] = {
        enterNodeId: p.enterNodeId,
        maxLevel: p.maxLevel,
        nodes: nodesData
      };
    }

    const dir = path.dirname(metaPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 1. Write binary vector buffer
    fs.writeFileSync(vectorsPath, Buffer.from(floatBuffer.buffer));

    // 2. Write metadata and graph topology
    const metaObj = {
      dimension: this.dimension,
      M: this.M,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      totalNodes,
      partitions: serializedPartitions
    };
    fs.writeFileSync(metaPath, JSON.stringify(metaObj), 'utf8');
  }

  /**
   * Instantly loads pre-built HNSW graph and binary vectors from disk.
   */
  public deserializeFromDisk(metaPath: string, vectorsPath: string): { success: boolean; totalNodes: number; chunks: { chunk: Chunk; embedding: number[] }[] } {
    if (!fs.existsSync(metaPath) || !fs.existsSync(vectorsPath)) {
      return { success: false, totalNodes: 0, chunks: [] };
    }

    try {
      const rawMeta = fs.readFileSync(metaPath, 'utf8');
      const meta = JSON.parse(rawMeta);

      this.dimension = meta.dimension;
      this.M = meta.M;
      this.efConstruction = meta.efConstruction;
      this.efSearch = meta.efSearch;
      this.mL = 1 / Math.log(this.M);

      const rawVectors = fs.readFileSync(vectorsPath);
      const floatBuffer = new Float32Array(rawVectors.buffer, rawVectors.byteOffset, rawVectors.byteLength / 4);

      this.partitions.clear();
      const allItems: { chunk: Chunk; embedding: number[] }[] = [];

      for (const [lang, pData] of Object.entries<any>(meta.partitions)) {
        const nodes = pData.nodes.map((n: any) => {
          const vec = floatBuffer.subarray(n.vectorOffset, n.vectorOffset + this.dimension);
          const neighborsMap = new Map<number, number[]>();
          for (const [lvl, nList] of n.neighbors) {
            neighborsMap.set(Number(lvl), nList);
          }
          const nodeObj = {
            id: n.id,
            chunk: n.chunk,
            vector: vec,
            level: n.level,
            neighbors: neighborsMap
          };
          allItems.push({ chunk: n.chunk, embedding: [] });
          return nodeObj;
        });

        this.partitions.set(lang, {
          nodes,
          enterNodeId: pData.enterNodeId,
          maxLevel: pData.maxLevel
        });
      }

      return { success: true, totalNodes: meta.totalNodes, chunks: allItems };
    } catch (err) {
      console.error('Failed to deserialize HNSW index from disk:', err);
      return { success: false, totalNodes: 0, chunks: [] };
    }
  }
}
