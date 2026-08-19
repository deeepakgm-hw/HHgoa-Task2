import { VectorDatabase, SearchResult } from './vectorDb';
import { Chunk } from './chunking';

export interface DetailedSearchResult extends SearchResult {
  vectorScore: number;
  lexicalScore: number;
  hybridScore: number;
  rerankScore: number;
  matchedTerms: string[];
}

export class RetrievalService {
  constructor(private vectorDb: VectorDatabase) {}

  /**
   * Multilingual stop words across English, Hindi, Kannada, Tamil, Telugu.
   */
  public static readonly STOP_WORDS = new Set([
    // English
    'what', 'is', 'a', 'an', 'the', 'in', 'of', 'to', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'why', 'how', 'where', 'when', 'who', 'which', 'whom', 'whose', 'this', 'that', 'these', 'those',
    'it', 'its', 'as', 'into', 'all', 'any', 'both', 'each', 'more', 'most', 'other', 'some', 'such',
    // Hindi
    'क्या', 'है', 'हैं', 'का', 'की', 'के', 'में', 'से', 'को', 'पर', 'और', 'या', 'तो', 'था', 'थी', 'थे',
    'यह', 'वह', 'इस', 'उस', 'एक', 'जो', 'नहीं', 'भी', 'होता', 'होती', 'होते',
    // Kannada
    'ಎಂದರೇನು', 'ಯಾವುದು', 'ಎಲ್ಲಿ', 'ಏಕೆ', 'ಹೇಗೆ', 'ಮತ್ತು', 'ಇದೆ', 'ಇರುವ', 'ಒಂದು', 'ಅಥವಾ', 'ಆದರೆ', 'ಇಲ್ಲ',
    // Tamil
    'என்பது', 'என்ன', 'எங்கே', 'ஏன்', 'எப்படி', 'மற்றும்', 'உள்ளது', 'உள்ள', 'ஒரு', 'அல்லது', 'ஆனால்', 'இல்லை',
    // Telugu
    'అంటే', 'ఏమిటి', 'ఎక్కడ', 'ఎందుకు', 'ఎలా', 'మరియు', 'ఉంది', 'ఉన్న', 'ఒక', 'లేదా', 'కానీ', 'లేదు'
  ]);

  /**
   * Tokenizes text into word-boundary tokens, preserving Indic characters and alphanumeric terms.
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    const cleaned = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()।|?"'“”\[\]{}<>\\/]/g, ' ');
    return cleaned
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 1);
  }

  /**
   * Extracts content words from query (excluding stopwords).
   */
  public extractContentTerms(query: string): string[] {
    const tokens = this.tokenize(query);
    const content = tokens.filter(t => !RetrievalService.STOP_WORDS.has(t));
    return content.length > 0 ? content : tokens;
  }

  /**
   * Calculates BM25-style lexical relevance score with exact whole-word matching.
   */
  public getLexicalScore(query: string, text: string): { score: number; matchedTerms: string[] } {
    const queryTerms = this.extractContentTerms(query);
    if (queryTerms.length === 0) return { score: 0, matchedTerms: [] };

    const docTokens = this.tokenize(text);
    const docTokenCounts = new Map<string, number>();
    for (const token of docTokens) {
      docTokenCounts.set(token, (docTokenCounts.get(token) || 0) + 1);
    }

    const matchedTerms: string[] = [];
    let termMatches = 0;
    const docLen = docTokens.length;
    const avgDocLen = 50;
    const k1 = 1.2;
    const b = 0.75;

    for (const term of queryTerms) {
      const tf = docTokenCounts.get(term) || 0;
      if (tf > 0) {
        matchedTerms.push(term);
        const num = tf * (k1 + 1);
        const denom = tf + k1 * (1 - b + b * (docLen / avgDocLen));
        termMatches += num / denom;
      }
    }

    const coverageRatio = matchedTerms.length / queryTerms.length;
    const normalizedScore = Math.min(1.0, (termMatches / queryTerms.length) * 0.5 + coverageRatio * 0.5);

    return {
      score: normalizedScore,
      matchedTerms
    };
  }

  /**
   * Performs high-speed hybrid retrieval combining HNSW vector similarity and lexical BM25 matching.
   */
  async retrieve(
    queryText: string,
    queryEmbedding: number[],
    options: {
      topK?: number;
      strategy?: 'fixed' | 'sentence' | 'semantic' | 'metadata';
      language?: string;
      hybridWeight?: number;
    } = {}
  ): Promise<DetailedSearchResult[]> {
    const { topK = 3, strategy, language, hybridWeight = 0.35 } = options;

    // 1. Fetch top nearest neighbors from HNSW vector index (<1ms)
    const vectorCandidates = this.vectorDb.search(queryEmbedding, Math.max(60, topK * 10), strategy, language);
    
    // Map candidates by chunk ID
    const candidateMap = new Map<string, { chunk: Chunk; vectorScore: number; lexicalScore: number; matchedTerms: string[] }>();
    
    for (const v of vectorCandidates) {
      const lexResult = this.getLexicalScore(queryText, v.chunk.text);
      candidateMap.set(v.chunk.id, {
        chunk: v.chunk,
        vectorScore: v.score,
        lexicalScore: lexResult.score,
        matchedTerms: lexResult.matchedTerms
      });
    }

    // 2. Add lexical keyword matches from language partition
    const queryTokens = queryText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()।|?"'“”]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !RetrievalService.STOP_WORDS.has(w));
    if (queryTokens.length > 0) {
      const langChunks = language ? this.vectorDb.getChunksByLanguage(language) : this.vectorDb.getAllChunks();
      let lexicalMatchCount = 0;
      
      for (const chunk of langChunks) {
        if (strategy && chunk.strategy !== strategy) continue;
        if (candidateMap.has(chunk.id)) continue;
        
        const chunkTextLower = chunk.text.toLowerCase();
        let hit = false;
        for (const token of queryTokens) {
          if (chunkTextLower.includes(token)) {
            hit = true;
            break;
          }
        }
        
        if (hit) {
          const lexResult = this.getLexicalScore(queryText, chunk.text);
          if (lexResult.score > 0.15) {
            candidateMap.set(chunk.id, {
              chunk,
              vectorScore: 0.1, // baseline vector score for unindexed lexical hits
              lexicalScore: lexResult.score,
              matchedTerms: lexResult.matchedTerms
            });
            lexicalMatchCount++;
            if (lexicalMatchCount >= 40) break;
          }
        }
      }
    }

    // 3. Compute balanced hybrid fusion scores
    const scoredResults: DetailedSearchResult[] = Array.from(candidateMap.values()).map(item => {
      const standardHybrid = (1 - hybridWeight) * item.vectorScore + hybridWeight * item.lexicalScore;
      const hybridScore = item.lexicalScore >= 0.40 
        ? Math.max(standardHybrid, item.lexicalScore * 0.65 + item.vectorScore * 0.35) 
        : standardHybrid;

      return {
        chunk: item.chunk,
        score: hybridScore,
        vectorScore: item.vectorScore,
        lexicalScore: item.lexicalScore,
        hybridScore,
        rerankScore: hybridScore,
        matchedTerms: item.matchedTerms
      };
    });

    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.slice(0, topK);
  }

  /**
   * Reranks candidates using exact phrase / proximity matching boosts.
   */
  rerank(queryText: string, candidates: DetailedSearchResult[], enableRerank: boolean = true): DetailedSearchResult[] {
    if (!enableRerank || candidates.length === 0) {
      return candidates;
    }

    const queryLower = queryText.toLowerCase().trim();
    const queryTerms = this.extractContentTerms(queryText);

    return candidates.map(cand => {
      let boost = 0;
      const textLower = cand.chunk.text.toLowerCase();

      // Substring match boost
      if (textLower.includes(queryLower)) {
        boost += 0.25;
      }

      // Multi-term co-occurrence boost
      if (queryTerms.length >= 2 && cand.matchedTerms.length === queryTerms.length) {
        boost += 0.20;
      } else if (cand.matchedTerms.length >= 1) {
        boost += 0.10 * (cand.matchedTerms.length / Math.max(1, queryTerms.length));
      }

      if (cand.chunk.metadata?.isSelected) {
        boost += 0.05;
      }

      const rerankScore = Math.min(1.0, cand.hybridScore + boost);

      return {
        ...cand,
        score: rerankScore,
        rerankScore
      };
    }).sort((a, b) => b.score - a.score);
  }
}
