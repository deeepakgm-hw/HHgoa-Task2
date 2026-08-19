import * as path from 'path';
import * as fs from 'fs';
import { VectorDatabase } from '../src/services/vectorDb';
import { Chunk } from '../src/services/chunking';

describe('Vector Database Store', () => {
  let db: VectorDatabase;
  const mockTempFilePath = path.join(__dirname, 'mock_store.json');

  const chunk1: Chunk = {
    id: "doc-1_fixed_0",
    chunkId: "doc-1_fixed_0",
    documentId: "doc-1",
    text: "India capital is New Delhi.",
    source: "India capital is New Delhi.",
    strategy: "fixed",
    position: 0,
    length: 27,
    metadata: {}
  };

  const chunk2: Chunk = {
    id: "doc-1_sentence_0",
    chunkId: "doc-1_sentence_0",
    documentId: "doc-1",
    text: "Paris is the capital of France.",
    source: "Paris is the capital of France.",
    strategy: "sentence",
    position: 0,
    length: 31,
    metadata: {}
  };

  beforeEach(() => {
    db = new VectorDatabase();
  });

  afterEach(() => {
    if (fs.existsSync(mockTempFilePath)) {
      fs.unlinkSync(mockTempFilePath);
    }
  });

  it('should correctly insert chunks and embeddings', () => {
    db.addChunks([chunk1], [[1.0, 0.0, 0.0]]);
    expect(db.size()).toBe(1);
    expect(db.getAllChunks()[0].id).toBe(chunk1.id);
  });

  it('should throw dimension mismatch error if array lengths differ', () => {
    expect(() => {
      db.addChunks([chunk1, chunk2], [[1.0, 0.0, 0.0]]);
    }).toThrow();
  });

  it('should accurately calculate similarity dot-product and rank results', () => {
    db.addChunks(
      [chunk1, chunk2],
      [
        [1.0, 0.0, 0.0], // chunk1 embedding
        [0.0, 1.0, 0.0]  // chunk2 embedding
      ]
    );

    // Query close to chunk1
    const query = [0.9, 0.1, 0.0];
    const results = db.search(query, 2);

    expect(results.length).toBe(2);
    expect(results[0].chunk.id).toBe(chunk1.id);
    expect(results[0].score).toBeCloseTo(0.9, 5);
  });

  it('should support metadata filtering by strategy', () => {
    db.addChunks(
      [chunk1, chunk2],
      [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0]
      ]
    );

    const query = [0.5, 0.5, 0.0];
    const filteredResults = db.search(query, 5, 'sentence');

    expect(filteredResults.length).toBe(1);
    expect(filteredResults[0].chunk.strategy).toBe('sentence');
  });

  it('should serialize and deserialize database content cleanly', () => {
    db.addChunks([chunk1], [[0.8, 0.6, 0.0]]);
    db.saveToFile(mockTempFilePath);

    expect(fs.existsSync(mockTempFilePath)).toBe(true);

    const newDb = new VectorDatabase();
    const success = newDb.loadFromFile(mockTempFilePath);

    expect(success).toBe(true);
    expect(newDb.size()).toBe(1);
    expect(newDb.getAllChunks()[0].text).toBe(chunk1.text);
  });
});
