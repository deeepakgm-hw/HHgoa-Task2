import { FixedSizeChunker, SentenceAwareChunker, SemanticChunker } from '../src/services/chunking';

describe('Chunking Strategies', () => {
  const sampleText = "यह पहला वाक्य है। यह दूसरा वाक्य है! क्या यह तीसरा वाक्य है?";
  const documentId = "doc-123";

  describe('FixedSizeChunker', () => {
    it('should split text into chunks of exact size with overlaps', () => {
      const chunker = new FixedSizeChunker(20, 5);
      const chunks = chunker.chunk(sampleText, documentId);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('fixed');
      expect(chunks[0].documentId).toBe(documentId);
      expect(chunks[0].text.length).toBeLessThanOrEqual(20);
      expect(chunks[0].id).toBe(`${documentId}_fixed_0`);
    });

    it('should return empty list for empty text input', () => {
      const chunker = new FixedSizeChunker(50, 10);
      expect(chunker.chunk("", documentId)).toEqual([]);
    });
  });

  describe('SentenceAwareChunker', () => {
    it('should group complete sentences within max size', () => {
      const chunker = new SentenceAwareChunker(40);
      const chunks = chunker.chunk(sampleText, documentId);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('sentence');
      // "यह पहला वाक्य है।" is 17 chars, "यह दूसरा वाक्य है!" is 18 chars. Combined is 36 chars.
      // Third sentence would push it over 40.
      expect(chunks[0].text).toContain("यह पहला वाक्य है।");
      expect(chunks[0].text).toContain("यह दूसरा वाक्य है!");
      expect(chunks[0].text).not.toContain("तीसरा वाक्य");
    });
  });

  describe('SemanticChunker', () => {
    it('should split based on Jaccard lexical similarity fallback when no embedder provided', () => {
      const chunker = new SemanticChunker(0.5); // high threshold forces split
      const chunks = chunker.chunk(sampleText, documentId);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].strategy).toBe('semantic');
    });

    it('should use embedding service for cosine similarity splits', async () => {
      const mockEmbedService = {
        embedText: jest.fn().mockImplementation((text: string) => {
          // Return contrasting vectors for sentences 1/2 vs sentence 3
          if (text.includes("पहला") || text.includes("दूसरा")) {
            return Promise.resolve([1, 0, 0]);
          }
          return Promise.resolve([0, 1, 0]);
        })
      };

      const chunker = new SemanticChunker(0.7, mockEmbedService, 400);
      const chunks = await chunker.chunkAsync(sampleText, documentId);

      expect(mockEmbedService.embedText).toHaveBeenCalled();
      // Should split between the second and third sentence due to zero cosine similarity
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
