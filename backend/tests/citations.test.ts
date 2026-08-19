import { Chunk } from '../src/services/chunking';
import { SearchResult } from '../src/services/vectorDb';

function sanitizeCitations(answerText: string, retrievedContexts: SearchResult[]): string[] {
  const rawCitations: string[] = [];
  const chunkIds = retrievedContexts.map(c => c.chunk.id);

  for (const id of chunkIds) {
    if (answerText.includes(id)) {
      rawCitations.push(id);
    }
  }

  // Deduplicate
  return Array.from(new Set(rawCitations));
}

describe('Citation Mapping and Sanitation', () => {
  const context: SearchResult[] = [
    {
      chunk: {
        id: "chunk-1", chunkId: "chunk-1", documentId: "doc-1", text: "Taj Mahal is in Agra.", source: "Taj Mahal is in Agra.", strategy: "fixed", position: 0, length: 21, metadata: {}
      },
      score: 0.8
    },
    {
      chunk: {
        id: "chunk-2", chunkId: "chunk-2", documentId: "doc-2", text: "New Delhi is the capital.", source: "New Delhi is the capital.", strategy: "fixed", position: 0, length: 25, metadata: {}
      },
      score: 0.7
    }
  ];

  it('should preserve valid citations found in retrieved contexts', () => {
    const answer = "The Taj Mahal is located in Agra [chunk-1].";
    const citations = sanitizeCitations(answer, context);

    expect(citations).toContain("chunk-1");
    expect(citations.length).toBe(1);
  });

  it('should filter out nonexistent citations fabricated by the model', () => {
    const answer = "Taj Mahal is in Agra [chunk-1] and France is in Europe [chunk-xyz].";
    const citations = sanitizeCitations(answer, context);

    expect(citations).toContain("chunk-1");
    expect(citations).not.toContain("chunk-xyz");
    expect(citations.length).toBe(1);
  });

  it('should deduplicate multiple references to the same citation', () => {
    const answer = "Taj Mahal is in Agra [chunk-1]. In Agra stands the Taj Mahal [chunk-1].";
    const citations = sanitizeCitations(answer, context);

    expect(citations).toContain("chunk-1");
    expect(citations.length).toBe(1);
  });

  it('should return empty list if answer references no valid citations', () => {
    const answer = "This statement contains no sources at all.";
    const citations = sanitizeCitations(answer, context);

    expect(citations.length).toBe(0);
  });
});
