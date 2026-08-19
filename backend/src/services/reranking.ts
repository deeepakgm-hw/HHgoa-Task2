import { SearchResult } from './vectorDb';

export class RerankingService {
  constructor() {}

  /**
   * Re-evaluates retrieval candidates based on query-word proximity and exact phrase matches.
   * Runs in sub-milliseconds to stay within strict latency budgets.
   * 
   * @param queryText User's normalized question
   * @param candidates Retrieved search results
   * @param enabled Whether to perform reranking or return original list
   */
  async rerank(
    queryText: string,
    candidates: SearchResult[],
    enabled: boolean = true
  ): Promise<SearchResult[]> {
    if (!enabled || candidates.length === 0) {
      return candidates;
    }

    const queryLower = queryText.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const reranked = candidates.map(candidate => {
      const chunkTextLower = candidate.chunk.text.toLowerCase();
      let scoreBoost = 0;

      // 1. Phrase match boost (exact match of normalized query)
      if (chunkTextLower.includes(queryLower)) {
        scoreBoost += 0.15;
      }

      // 2. Bigram proximity boost
      if (queryWords.length > 1) {
        for (let i = 0; i < queryWords.length - 1; i++) {
          const bigram = `${queryWords[i]} ${queryWords[i + 1]}`;
          if (chunkTextLower.includes(bigram)) {
            scoreBoost += 0.08;
          }
        }
      }

      // 3. Density/coverage boost: reward matching more unique words in the same passage
      let matchedUniqueWords = 0;
      for (const word of queryWords) {
        if (chunkTextLower.includes(word)) {
          matchedUniqueWords++;
        }
      }
      if (queryWords.length > 0) {
        const coverageRatio = matchedUniqueWords / queryWords.length;
        scoreBoost += coverageRatio * 0.05;
      }

      return {
        chunk: candidate.chunk,
        score: candidate.score + scoreBoost
      };
    });

    // Re-sort candidates based on the new hybrid score
    return reranked.sort((a, b) => b.score - a.score);
  }
}
