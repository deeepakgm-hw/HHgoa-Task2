import { Chunk } from '../src/services/chunking';

interface MockSearchCandidate {
  chunkId: string;
  score: number;
}

// Function mirroring the recall calculation logic
function calculateRecallAtK(
  queries: { query: string; expectedRelevantChunkIds: string[] }[],
  mockRetrievals: Record<string, MockSearchCandidate[]>,
  k: number
): number {
  let hits = 0;
  let evaluableQueries = 0;

  for (const q of queries) {
    const targets = q.expectedRelevantChunkIds;
    if (targets.length === 0) continue; // skip queries without ground-truth relevance
    evaluableQueries++;

    const retrieved = mockRetrievals[q.query] || [];
    const topK = retrieved.slice(0, k).map(c => c.chunkId);

    // Hit if any retrieved matches target
    const isHit = topK.some(id => targets.includes(id));
    if (isHit) {
      hits++;
    }
  }

  return evaluableQueries > 0 ? hits / evaluableQueries : 0;
}

describe('Recall @ K Mathematics Verification', () => {
  const queries = [
    { query: "Q1", expectedRelevantChunkIds: ["c-1", "c-2"] },
    { query: "Q2", expectedRelevantChunkIds: ["c-3"] },
    { query: "Q3", expectedRelevantChunkIds: ["c-4"] }, // Has relevance
    { query: "Q4", expectedRelevantChunkIds: [] } // No relevance, should be ignored
  ];

  const mockRetrievals: Record<string, MockSearchCandidate[]> = {
    "Q1": [
      { chunkId: "c-5", score: 0.9 },
      { chunkId: "c-1", score: 0.8 }, // c-1 matches Q1 (recalled at K=2)
      { chunkId: "c-2", score: 0.7 }
    ],
    "Q2": [
      { chunkId: "c-3", score: 0.95 }, // c-3 matches Q2 (recalled at K=1)
      { chunkId: "c-6", score: 0.85 }
    ],
    "Q3": [
      { chunkId: "c-7", score: 0.9 },
      { chunkId: "c-8", score: 0.8 } // Misses c-4 entirely
    ]
  };

  it('should calculate Recall@1 correctly', () => {
    // Evaluable: Q1 (misses c-1/c-2 at K=1), Q2 (hits c-3 at K=1), Q3 (misses c-4) -> 1 hit out of 3 queries
    const recall = calculateRecallAtK(queries, mockRetrievals, 1);
    expect(recall).toBeCloseTo(1 / 3, 5); // 33.3%
  });

  it('should calculate Recall@2 correctly', () => {
    // Evaluable: Q1 (hits c-1 at K=2), Q2 (hits c-3 at K=2), Q3 (misses) -> 2 hits out of 3 queries
    const recall = calculateRecallAtK(queries, mockRetrievals, 2);
    expect(recall).toBeCloseTo(2 / 3, 5); // 66.7%
  });

  it('should calculate Recall@3 correctly', () => {
    // Same as K=2 -> 2 hits out of 3 queries
    const recall = calculateRecallAtK(queries, mockRetrievals, 3);
    expect(recall).toBeCloseTo(2 / 3, 5);
  });

  it('should handle K larger than the returned candidates list', () => {
    const recall = calculateRecallAtK(queries, mockRetrievals, 100);
    // Q1 hits, Q2 hits, Q3 misses -> 2 hits out of 3 queries
    expect(recall).toBeCloseTo(2 / 3, 5);
  });
});
