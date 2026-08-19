import * as fs from 'fs';
import * as path from 'path';
import { EmbeddingService } from '../src/services/embeddings';

describe('Embedding Service Caching & Batching', () => {
  const tempCachePath = path.join(__dirname, 'temp_embed_cache.json');
  let service: EmbeddingService;

  beforeEach(() => {
    // Clear temp cache file if left over
    if (fs.existsSync(tempCachePath)) {
      fs.unlinkSync(tempCachePath);
    }
    service = new EmbeddingService('gemini-embedding-2', tempCachePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempCachePath)) {
      fs.unlinkSync(tempCachePath);
    }
  });

  it('should generate unit-normalized mock embeddings of 3072 dimensions', async () => {
    const text = "भारत की राजधानी क्या है?";
    const vector = await service.embedText(text);

    expect(vector.length).toBe(3072);
    // Norm of unit vector is ~1
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    expect(norm).toBeCloseTo(1, 4);
  });

  it('should write new embeddings to the disk cache', async () => {
    const text = "ताजमहल आगरा में है।";
    expect(fs.existsSync(tempCachePath)).toBe(false);

    await service.embedText(text);
    expect(fs.existsSync(tempCachePath)).toBe(true);

    const cacheData = JSON.parse(fs.readFileSync(tempCachePath, 'utf8'));
    const hashes = Object.keys(cacheData);
    expect(hashes.length).toBe(1);
    expect(cacheData[hashes[0]].length).toBe(3072);
  });

  it('should read embeddings from cache instead of generating new ones', async () => {
    const text = "caching-test-phrase";
    const firstVector = await service.embedText(text);

    // Modify cache file manually to verify it reads from cached entries
    const cacheData = JSON.parse(fs.readFileSync(tempCachePath, 'utf8'));
    const hashKey = Object.keys(cacheData)[0];
    const modifiedVector = new Array(3072).fill(0.99);
    cacheData[hashKey] = modifiedVector;
    fs.writeFileSync(tempCachePath, JSON.stringify(cacheData), 'utf8');

    // Create a new service instance to reload from cache file
    const secondService = new EmbeddingService('gemini-embedding-2', tempCachePath);
    const secondVector = await secondService.embedText(text);

    expect(secondVector).toEqual(modifiedVector);
    expect(secondVector).not.toEqual(firstVector);
  });

  it('should batch embed texts, maintaining original order and cache alignment', async () => {
    const texts = ["वाक्य एक", "वाक्य दो", "वाक्य तीन"];
    const results = await service.embedBatch(texts);

    expect(results.length).toBe(3);
    expect(results[0].length).toBe(3072);
    expect(results[1].length).toBe(3072);
    expect(results[2].length).toBe(3072);

    // Verify cache file has all three hashes
    const cacheData = JSON.parse(fs.readFileSync(tempCachePath, 'utf8'));
    expect(Object.keys(cacheData).length).toBe(3);
  });
});
