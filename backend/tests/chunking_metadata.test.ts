import { MetadataAwareChunker, FixedSizeChunker, SentenceAwareChunker, SemanticChunker } from '../src/services/chunking';

describe('MetadataAwareChunker', () => {
  const documentId = 'test-doc-0-p0';
  const baseMetadata = {
    documentIndex: 0,
    passageIndex: 0,
    isSelected: true,
    sourceLanguage: 'eng_Latn',
    targetLanguage: 'hin_Deva',
    originalQuery: 'ताजमहल कहाँ स्थित है?'
  };

  it('should produce strategy=metadata on all chunks', () => {
    const chunker = new MetadataAwareChunker(600);
    const text = 'ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के तट पर स्थित है।';
    const chunks = chunker.chunk(text, documentId, baseMetadata);
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(c => expect(c.strategy).toBe('metadata'));
  });

  it('should attach typed structured metadata fields to every chunk', () => {
    const chunker = new MetadataAwareChunker(600);
    const text = 'यह एक परीक्षण वाक्य है। यह दूसरा वाक्य है।';
    const chunks = chunker.chunk(text, documentId, baseMetadata);

    expect(chunks.length).toBeGreaterThan(0);
    const chunk = chunks[0];
    // Typed structural fields must be present
    expect(typeof chunk.metadata.title).toBe('string');
    expect(chunk.metadata.title!).toBeDefined();
    expect(chunk.metadata.title!.length).toBeGreaterThan(0);
    expect(typeof chunk.metadata.passageId).toBe('string');
    expect(typeof chunk.metadata.isSelected).toBe('boolean');
    expect(chunk.metadata.isSelected).toBe(true);
    expect(typeof chunk.metadata.documentIndex).toBe('number');
    expect(typeof chunk.metadata.passageIndex).toBe('number');
    expect(typeof chunk.metadata.chunkIndexWithinPassage).toBe('number');
    expect(typeof chunk.metadata.totalChunksInPassage).toBe('number');
    expect(typeof chunk.metadata.sourceLanguage).toBe('string');
    expect(typeof chunk.metadata.targetLanguage).toBe('string');
    expect(typeof chunk.metadata.originalQuery).toBe('string');
  });

  it('should mark gold passages [Gold] in the title when isSelected=true', () => {
    const chunker = new MetadataAwareChunker(600);
    const text = 'ताजमहल आगरा में है।';
    const chunks = chunker.chunk(text, documentId, { ...baseMetadata, isSelected: true });
    expect(chunks[0].metadata.title).toContain('[Gold]');
  });

  it('should NOT mark non-selected passages [Gold]', () => {
    const chunker = new MetadataAwareChunker(600);
    const text = 'यह एक सामान्य अनुच्छेद है।';
    const chunks = chunker.chunk(text, documentId, { ...baseMetadata, isSelected: false });
    expect(chunks[0].metadata.title).not.toContain('[Gold]');
  });

  it('splits at sentence boundary (not fixed char count) when passage exceeds maxPassageLength', () => {
    // Build a long text with known sentence boundaries
    const sentence = 'यह एक लंबा वाक्य है जो अधिकतम आकार से अधिक है।'; // ~50 chars
    const text = sentence.repeat(15); // ~750 chars, will exceed 600
    const chunker = new MetadataAwareChunker(600);
    const chunks = chunker.chunk(text, documentId, baseMetadata);

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk except possibly the last should end at a sentence terminal
    // (i.e. NOT mid-word)
    chunks.forEach((chunk, i) => {
      if (i < chunks.length - 1) {
        const lastChar = chunk.text[chunk.text.length - 1];
        expect(['।', '|', '.', '!', '?']).toContain(lastChar);
      }
    });

    // Verify multi-part metadata is set
    expect(chunks[0].metadata.totalChunksInPassage).toBe(chunks.length);
    expect(chunks[0].metadata.chunkIndexWithinPassage).toBe(0);
    expect(chunks[1].metadata.chunkIndexWithinPassage).toBe(1);
  });

  it('produces a single chunk for short passages (no unnecessary splitting)', () => {
    const chunker = new MetadataAwareChunker(600);
    const text = 'यह एक छोटा वाक्य है।';
    const chunks = chunker.chunk(text, documentId, baseMetadata);
    expect(chunks.length).toBe(1);
    expect(chunks[0].metadata.totalChunksInPassage).toBe(1);
    expect(chunks[0].metadata.chunkIndexWithinPassage).toBe(0);
  });

  it('returns empty array for empty text', () => {
    const chunker = new MetadataAwareChunker(600);
    expect(chunker.chunk('', documentId, baseMetadata)).toEqual([]);
    expect(chunker.chunk('   ', documentId, baseMetadata)).toEqual([]);
  });

  it('produces genuinely different split boundaries from FixedSizeChunker on same input', () => {
    const longText = [
      'ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के दक्षिणी तट पर स्थित एक हाथीदांत-सफेद संगमरमर का मकबरा है।',
      'इसे मुगल सम्राट शाहजहाँ ने 1631 में अपनी पसंदीदा पत्नी मुमताज महल की याद में बनवाना शुरू किया था।',
      'यह मकबरा 1653 में पूरा हुआ था।'
    ].join(' ');

    const fixedChunker = new FixedSizeChunker(100, 20);
    const metadataChunker = new MetadataAwareChunker(600);

    const fixedChunks = fixedChunker.chunk(longText, documentId, baseMetadata);
    const metadataChunks = metadataChunker.chunk(longText, documentId, baseMetadata);

    // Fixed chunker splits mid-word at char count boundaries
    // Metadata chunker keeps the entire passage as one chunk (< 600 chars)
    expect(fixedChunks.length).toBeGreaterThan(metadataChunks.length);
    expect(metadataChunks.length).toBe(1); // fits in one passage

    // Fixed chunks have no title metadata, metadata chunks do
    expect(fixedChunks[0].metadata.title).toBeUndefined();
    expect(metadataChunks[0].metadata.title).toBeDefined();
    expect(typeof metadataChunks[0].metadata.isSelected).toBe('boolean');
  });
});

describe('Strategy differentiation proof', () => {
  const text = 'ताजमहल आगरा में है। यह एक मकबरा है। शाहजहाँ ने इसे बनवाया था। यह 1653 में बना था।';
  const docId = 'doc-proof';

  it('FixedSizeChunker: splits at fixed character count with overlap regardless of sentence boundaries', () => {
    const chunker = new FixedSizeChunker(40, 10);
    const chunks = chunker.chunk(text, docId);
    // Position 1 chunk should start 30 chars into the text (40-10 overlap)
    const expectedStart = text.substring(30, 70).trim();
    expect(chunks[1].text).toBe(expectedStart);
    expect(chunks[0].strategy).toBe('fixed');
  });

  it('SentenceAwareChunker: groups complete sentences; boundaries align with punctuation', () => {
    const chunker = new SentenceAwareChunker(50);
    const chunks = chunker.chunk(text, docId);
    // Every chunk should end with sentence-terminal punctuation
    chunks.forEach(chunk => {
      const last = chunk.text[chunk.text.length - 1];
      expect(['।', '.', '!', '?', '|']).toContain(last);
    });
    expect(chunks[0].strategy).toBe('sentence');
  });

  it('SemanticChunker: groups by lexical similarity; may merge or split differently from sentence chunker', () => {
    const chunker = new SemanticChunker(0.3, undefined, 200); // low threshold = fewer merges
    const chunks = chunker.chunk(text, docId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].strategy).toBe('semantic');
  });

  it('MetadataAwareChunker: attaches title/passageId/isSelected absent from all other strategies', () => {
    const meta = { documentIndex: 0, passageIndex: 0, isSelected: true };
    const chunker = new MetadataAwareChunker(600);
    const chunks = chunker.chunk(text, docId, meta);
    expect(chunks[0].strategy).toBe('metadata');
    // Fields that exist ONLY in metadata strategy
    expect(chunks[0].metadata.title).toBeDefined();
    expect(chunks[0].metadata.passageId).toBeDefined();
    expect(typeof chunks[0].metadata.isSelected).toBe('boolean');
    expect(typeof chunks[0].metadata.totalChunksInPassage).toBe('number');

    // Verify these fields are absent from fixed-chunker output
    const fixedChunks = new FixedSizeChunker(200, 30).chunk(text, docId, meta);
    expect(fixedChunks[0].metadata.title).toBeUndefined();
    expect(fixedChunks[0].metadata.passageId).toBeUndefined();
    expect(fixedChunks[0].metadata.totalChunksInPassage).toBeUndefined();
  });
});
