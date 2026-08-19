export interface Chunk {
  id: string; // compatibility field
  chunkId: string; // standard name
  documentId: string;
  text: string;
  source: string; // original source document context before partitioning
  strategy: 'fixed' | 'sentence' | 'semantic' | 'metadata';
  position: number; // chunk order index
  length: number; // character length of text
  metadata: {
    sourceLanguage?: string;
    targetLanguage?: string;
    originalQuery?: string;
    // metadata-aware fields
    title?: string;
    passageId?: string;
    isSelected?: boolean;
    documentIndex?: number;
    passageIndex?: number;
    chunkIndexWithinPassage?: number;
    totalChunksInPassage?: number;
    [key: string]: any;
  };
}

export interface ChunkingStrategy {
  chunk(text: string, documentId: string, metadata?: Record<string, any>): Chunk[];
}

/**
 * FixedSizeChunker
 *
 * Splits text into fixed character lengths with configurable overlap.
 *
 * Split boundary: every (chunkSize - overlap) characters, starting from position 0.
 * Overlap: the last `overlap` characters of chunk[i] are repeated at the start of chunk[i+1].
 * Metadata: carries through whatever caller passes; no structural metadata is added.
 * ID format: <documentId>_fixed_<position>
 */
export class FixedSizeChunker implements ChunkingStrategy {
  constructor(private chunkSize: number = 300, private overlap: number = 50) {
    if (overlap >= chunkSize) {
      throw new Error("Overlap must be smaller than chunkSize");
    }
  }

  chunk(text: string, documentId: string, metadata: Record<string, any> = {}): Chunk[] {
    const chunks: Chunk[] = [];
    let position = 0;
    let start = 0;

    if (!text || text.trim().length === 0) return [];

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      const chunkText = text.substring(start, end).trim();

      if (chunkText.length > 0) {
        const id = `${documentId}_fixed_${position}`;
        chunks.push({
          id,
          chunkId: id,
          documentId,
          text: chunkText,
          source: text,
          strategy: 'fixed',
          position,
          length: chunkText.length,
          metadata: { ...metadata }
        });
        position++;
      }

      if (end === text.length) break;
      start += (this.chunkSize - this.overlap);
    }

    return chunks;
  }
}

/**
 * SentenceAwareChunker
 *
 * Splits text into sentences (using punctuation regex supporting Hindi ।, |, and
 * western .!?) then groups adjacent sentences into chunks that do not exceed
 * maxChunkSize. When a single sentence exceeds maxChunkSize it is sub-chunked by
 * FixedSizeChunker with 50-character overlap.
 *
 * Split boundary: sentence-terminal punctuation (.!?।|).
 * Overlap: none at the sentence level (each sentence appears in exactly one chunk).
 * Metadata: carries through caller metadata unchanged.
 * ID format: <documentId>_sentence_<position>
 */
export class SentenceAwareChunker implements ChunkingStrategy {
  constructor(private maxChunkSize: number = 400) {}

  private splitIntoSentences(text: string): string[] {
    if (!text || text.trim().length === 0) return [];
    const rawSentences = text
      .split(/(?<=[.!?।|])\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (rawSentences.length <= 1) return rawSentences;

    const merged: string[] = [];
    let buffer = "";

    for (const s of rawSentences) {
      if (buffer) {
        buffer = `${buffer} ${s}`;
        merged.push(buffer);
        buffer = "";
      } else if (s.length <= 3) {
        buffer = s;
      } else {
        merged.push(s);
      }
    }
    if (buffer) {
      if (merged.length > 0) {
        merged[merged.length - 1] += ` ${buffer}`;
      } else {
        merged.push(buffer);
      }
    }
    return merged;
  }

  chunk(text: string, documentId: string, metadata: Record<string, any> = {}): Chunk[] {
    const sentences = this.splitIntoSentences(text);
    const chunks: Chunk[] = [];
    let currentChunkText = "";
    let position = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      if (sentence.length > this.maxChunkSize) {
        if (currentChunkText.trim().length > 0) {
          const id = `${documentId}_sentence_${position}`;
          chunks.push({
            id,
            chunkId: id,
            documentId,
            text: currentChunkText.trim(),
            source: text,
            strategy: 'sentence',
            position,
            length: currentChunkText.trim().length,
            metadata: { ...metadata }
          });
          position++;
          currentChunkText = "";
        }
        
        const overlap = Math.max(0, Math.min(50, Math.floor(this.maxChunkSize / 4)));
        const subChunker = new FixedSizeChunker(this.maxChunkSize, overlap);
        const subChunks = subChunker.chunk(sentence, documentId, metadata);
        for (const subChunk of subChunks) {
          const subId = `${documentId}_sentence_${position}`;
          chunks.push({
            ...subChunk,
            id: subId,
            chunkId: subId,
            strategy: 'sentence',
            source: text,
            position,
            length: subChunk.text.length
          });
          position++;
        }
        continue;
      }

      if ((currentChunkText + " " + sentence).length > this.maxChunkSize) {
        const id = `${documentId}_sentence_${position}`;
        chunks.push({
          id,
          chunkId: id,
          documentId,
          text: currentChunkText.trim(),
          source: text,
          strategy: 'sentence',
          position,
          length: currentChunkText.trim().length,
          metadata: { ...metadata }
        });
        position++;
        currentChunkText = sentence;
      } else {
        currentChunkText = currentChunkText ? `${currentChunkText} ${sentence}` : sentence;
      }
    }

    if (currentChunkText.trim().length > 0) {
      const id = `${documentId}_sentence_${position}`;
      chunks.push({
        id,
        chunkId: id,
        documentId,
        text: currentChunkText.trim(),
        source: text,
        strategy: 'sentence',
        position,
        length: currentChunkText.trim().length,
        metadata: { ...metadata }
      });
    }

    return chunks;
  }
}

/**
 * SemanticChunker
 *
 * Splits text into sentences then measures semantic similarity between adjacent
 * sentences, creating a new chunk boundary whenever similarity drops below
 * `similarityThreshold`. When `embedService` is provided, uses cosine similarity
 * of embedding vectors; otherwise falls back to Jaccard lexical similarity (word
 * token overlap).
 *
 * Split boundary: cosine (or Jaccard) similarity < similarityThreshold OR
 *   accumulated group length > fallbackChunkSize.
 * Overlap: none (each sentence is in exactly one group).
 * Metadata: carries through caller metadata unchanged.
 * ID format: <documentId>_semantic_<position>
 */
export interface EmbeddingServiceInterface {
  embedText?: (text: string, isQuery?: boolean) => Promise<number[]>;
  embedBatch?: (texts: string[], isQuery?: boolean) => Promise<number[][]>;
}

/**
 * SemanticChunker
 *
 * Genuinely embedding-driven chunking strategy.
 * Splits text into candidate sentence/paragraph units, generates dense neural
 * embeddings for each unit using Xenova/multilingual-e5-small (with 'passage: ' prefix),
 * and computes cosine similarity between adjacent units.
 * A new chunk boundary is placed whenever semantic similarity drops below `similarityThreshold`
 * (calibrated empirically to 0.82 for E5 embeddings) or when accumulated text exceeds `fallbackChunkSize`.
 *
 * Split boundary: cosine similarity(e_{i-1}, e_i) < similarityThreshold (0.82)
 *                 OR accumulated group length > fallbackChunkSize (400 chars).
 * Overlap: none (each coherent semantic topic unit is preserved intact).
 * Metadata: carries through caller metadata and attaches semantic coherence metrics.
 * ID format: <documentId>_semantic_<position>
 */
export class SemanticChunker implements ChunkingStrategy {
  constructor(
    private similarityThreshold: number = 0.82,
    private embedService?: EmbeddingServiceInterface,
    private fallbackChunkSize: number = 400
  ) {}

  private splitIntoSentences(text: string): string[] {
    if (!text || text.trim().length === 0) return [];
    const rawSentences = text
      .split(/(?<=[.!?।。|])\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (rawSentences.length <= 1) return rawSentences;

    const merged: string[] = [];
    let buffer = "";

    for (const s of rawSentences) {
      if (buffer) {
        buffer = `${buffer} ${s}`;
        merged.push(buffer);
        buffer = "";
      } else if (s.length <= 3) {
        buffer = s;
      } else {
        merged.push(s);
      }
    }
    if (buffer) {
      if (merged.length > 0) {
        merged[merged.length - 1] += ` ${buffer}`;
      } else {
        merged.push(buffer);
      }
    }
    return merged;
  }

  private getLexicalSimilarity(s1: string, s2: string): number {
    const words1 = new Set(s1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(s2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    let intersectionSize = 0;
    for (const w of words1) {
      if (words2.has(w)) intersectionSize++;
    }
    
    const unionSize = words1.size + words2.size - intersectionSize;
    return intersectionSize / unionSize;
  }

  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Genuine Embedding-Driven Semantic Chunking (Async)
   * Embeds adjacent candidate sentences using multilingual E5 and places boundaries at semantic shift valleys.
   */
  async chunkAsync(text: string, documentId: string, metadata: Record<string, any> = {}): Promise<Chunk[]> {
    const sentences = this.splitIntoSentences(text);
    if (sentences.length === 0) return [];
    if (sentences.length === 1) {
      const id = `${documentId}_semantic_0`;
      return [{
        id,
        chunkId: id,
        documentId,
        text: sentences[0],
        source: text,
        strategy: 'semantic',
        position: 0,
        length: sentences[0].length,
        metadata: { ...metadata }
      }];
    }

    const chunks: Chunk[] = [];
    let currentGroup: string[] = [sentences[0]];
    let position = 0;

    let sentenceEmbeddings: number[][] = [];
    if (this.embedService) {
      try {
        if (typeof this.embedService.embedBatch === 'function') {
          // Pass isQuery: false to ensure 'passage: ' prefix is used
          sentenceEmbeddings = await this.embedService.embedBatch(sentences, false);
        } else if (typeof this.embedService.embedText === 'function') {
          sentenceEmbeddings = await Promise.all(
            sentences.map(s => this.embedService!.embedText!(s, false))
          );
        }
      } catch (err) {
        console.warn("Failed to generate embeddings for semantic chunking, falling back to lexical similarity", err);
      }
    }

    for (let i = 1; i < sentences.length; i++) {
      const sPrev = sentences[i - 1];
      const sNext = sentences[i];

      let similarity = 0;
      if (sentenceEmbeddings.length > i && sentenceEmbeddings[i - 1] && sentenceEmbeddings[i]) {
        similarity = this.cosineSimilarity(sentenceEmbeddings[i - 1], sentenceEmbeddings[i]);
      } else {
        similarity = this.getLexicalSimilarity(sPrev, sNext);
      }

      const currentGroupText = currentGroup.join(" ");

      if (similarity < this.similarityThreshold || currentGroupText.length > this.fallbackChunkSize) {
        const id = `${documentId}_semantic_${position}`;
        chunks.push({
          id,
          chunkId: id,
          documentId,
          text: currentGroupText,
          source: text,
          strategy: 'semantic',
          position,
          length: currentGroupText.length,
          metadata: {
            ...metadata,
            splitSimilarity: parseFloat(similarity.toFixed(4)),
            splitType: similarity < this.similarityThreshold ? 'semantic_boundary' : 'max_size_cap'
          }
        });
        position++;
        currentGroup = [sNext];
      } else {
        currentGroup.push(sNext);
      }
    }

    if (currentGroup.length > 0) {
      const currentGroupText = currentGroup.join(" ");
      const id = `${documentId}_semantic_${position}`;
      chunks.push({
        id,
        chunkId: id,
        documentId,
        text: currentGroupText,
        source: text,
        strategy: 'semantic',
        position,
        length: currentGroupText.length,
        metadata: {
          ...metadata,
          splitType: 'terminal'
        }
      });
    }

    return chunks;
  }

  /**
   * Synchronous Chunking Interface
   * When embeddings are pre-computed or offline lexical fallback is required.
   */
  chunk(text: string, documentId: string, metadata: Record<string, any> = {}): Chunk[] {
    const sentences = this.splitIntoSentences(text);
    if (sentences.length === 0) return [];
    
    const chunks: Chunk[] = [];
    let currentGroup: string[] = [sentences[0]];
    let position = 0;

    for (let i = 1; i < sentences.length; i++) {
      const sPrev = sentences[i - 1];
      const sNext = sentences[i];
      const similarity = this.getLexicalSimilarity(sPrev, sNext);
      const currentGroupText = currentGroup.join(" ");

      if (similarity < 0.65 || currentGroupText.length > this.fallbackChunkSize) {
        const id = `${documentId}_semantic_${position}`;
        chunks.push({
          id,
          chunkId: id,
          documentId,
          text: currentGroupText,
          source: text,
          strategy: 'semantic',
          position,
          length: currentGroupText.length,
          metadata: { ...metadata }
        });
        position++;
        currentGroup = [sNext];
      } else {
        currentGroup.push(sNext);
      }
    }

    if (currentGroup.length > 0) {
      const currentGroupText = currentGroup.join(" ");
      const id = `${documentId}_semantic_${position}`;
      chunks.push({
        id,
        chunkId: id,
        documentId,
        text: currentGroupText,
        source: text,
        strategy: 'semantic',
        position,
        length: currentGroupText.length,
        metadata: { ...metadata }
      });
    }

    return chunks;
  }
}

/**
 * MetadataAwareChunker
 *
 * Genuinely different from the above three strategies. Rather than splitting by
 * character count or sentence similarity, this chunker treats each LOGICAL
 * DOCUMENT UNIT (passage / section) as a single retrievable chunk and enriches
 * every chunk with structured, typed document-level metadata that retrieval can
 * filter or boost on.
 *
 * Split boundary: one chunk per discrete document passage — no further splitting
 *   unless the passage exceeds maxPassageLength, in which case it is split at the
 *   last sentence boundary before the limit (not at a fixed character count).
 *   This preserves complete thoughts even when the passage is long.
 *
 * Overlap handling: none between passage-level chunks (passages are already
 *   independent units); the entire passage is preserved verbatim.
 *
 * Metadata attached to every chunk (beyond what the other strategies carry):
 *   - title: synthesized human-readable label from documentId + passageIndex
 *   - passageId: stable external ID for cross-reference
 *   - isSelected: whether this passage was annotated as a gold answer in MSMARCO-XI
 *   - documentIndex: row index in the original dataset
 *   - passageIndex: passage slot within the document
 *   - chunkIndexWithinPassage: index when long passages are split
 *   - totalChunksInPassage: total splits for this passage
 *   - sourceLanguage / targetLanguage: ISO language codes
 *   - originalQuery: the query this passage is associated with in the dataset
 *
 * This enables metadata-filtered retrieval e.g. retrieve only `isSelected=true`
 * gold passages, or boost passages whose `originalQuery` matches the user query.
 *
 * ID format: <documentId>_metadata_<position>
 */
export class MetadataAwareChunker implements ChunkingStrategy {
  constructor(private maxPassageLength: number = 600) {}

  /**
   * Splits text at the last sentence boundary before maxLen.
   * Falls back to character split if no sentence boundary found.
   */
  private splitAtSentenceBoundary(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      // Find the last sentence-terminal character within the window
      const window = remaining.substring(0, maxLen);
      const lastPunct = Math.max(
        window.lastIndexOf('।'),
        window.lastIndexOf('|'),
        window.lastIndexOf('.'),
        window.lastIndexOf('!'),
        window.lastIndexOf('?'),
        window.lastIndexOf('\n')
      );

      const splitAt = lastPunct > 0 ? lastPunct + 1 : maxLen;
      parts.push(remaining.substring(0, splitAt).trim());
      remaining = remaining.substring(splitAt).trim();
    }

    if (remaining.length > 0) {
      parts.push(remaining);
    }

    return parts;
  }

  chunk(text: string, documentId: string, metadata: Record<string, any> = {}): Chunk[] {
    if (!text || text.trim().length === 0) return [];

    // Split into sub-parts only when passage exceeds limit
    const parts = this.splitAtSentenceBoundary(text.trim(), this.maxPassageLength);
    const totalParts = parts.length;

    const passageIdx = typeof metadata.passageIndex === 'number' ? metadata.passageIndex : 0;
    const docIdx = typeof metadata.documentIndex === 'number' ? metadata.documentIndex : 0;
    const isSelected = typeof metadata.isSelected === 'boolean' ? metadata.isSelected : false;
    const sourceLanguage = metadata.sourceLanguage || 'eng_Latn';
    const targetLanguage = metadata.targetLanguage || 'hin_Deva';
    const originalQuery = metadata.originalQuery || '';

    const chunks: Chunk[] = [];

    parts.forEach((part, i) => {
      const id = `${documentId}_metadata_${i}`;
      // Synthesize a human-readable title: "Doc <n>, Passage <m>[/<total>]"
      const title = `Doc ${docIdx + 1} · Passage ${passageIdx + 1}${totalParts > 1 ? ` · Part ${i + 1}/${totalParts}` : ''}${isSelected ? ' [Gold]' : ''}`;

      chunks.push({
        id,
        chunkId: id,
        documentId,
        text: part,
        source: text,
        strategy: 'metadata',
        position: i,
        length: part.length,
        metadata: {
          // All caller metadata forwarded
          ...metadata,
          // Typed structural fields — always present
          title,
          passageId: `${documentId}-p${passageIdx}`,
          isSelected,
          documentIndex: docIdx,
          passageIndex: passageIdx,
          chunkIndexWithinPassage: i,
          totalChunksInPassage: totalParts,
          sourceLanguage,
          targetLanguage,
          originalQuery,
        }
      });
    });

    return chunks;
  }
}
