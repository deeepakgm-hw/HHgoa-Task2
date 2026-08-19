import { GuardrailService } from '../src/services/guardrails';
import { SearchResult } from '../src/services/vectorDb';

describe('Guardrails Evaluation Suite (Queries A to G)', () => {
  const threshold = 0.35;
  const guardrails = new GuardrailService(threshold);

  const mockChunk = {
    id: "chunk-1",
    chunkId: "chunk-1",
    documentId: "doc-1",
    text: "यमुना नदी के किनारे आगरा शहर में ताजमहल स्थित है। इसे शाहजहाँ ने बनवाया था।",
    source: "यमुना नदी के किनारे आगरा शहर में ताजमहल स्थित है। इसे शाहजहाँ ने बनवाया था।",
    strategy: "semantic" as const,
    position: 0,
    length: 74,
    metadata: {}
  };

  // A. Answerable query
  it('Query A: Answerable query should pass validation and allow search', () => {
    const query = "ताजमहल कहाँ है?";
    const queryVal = guardrails.validateQuery(query);
    expect(queryVal.isValid).toBe(true);

    const retrievalResults: SearchResult[] = [
      { chunk: mockChunk, score: 0.65 } // Passes 0.35 threshold
    ];
    const retVal = guardrails.validateRetrieval(query, retrievalResults);
    expect(retVal.passed).toBe(true);
  });

  // B. Clearly unrelated query
  it('Query B: Clearly unrelated query should fail retrieval relevance check', () => {
    const query = "अमेरिका का राष्ट्रपति कौन है?";
    const queryVal = guardrails.validateQuery(query);
    expect(queryVal.isValid).toBe(true);

    const retrievalResults: SearchResult[] = [
      { chunk: mockChunk, score: 0.12 } // Fails 0.35 threshold
    ];
    const retVal = guardrails.validateRetrieval(query, retrievalResults);
    expect(retVal.passed).toBe(false);
    expect(retVal.reason).toContain("falls below confidence threshold");
  });

  // C. Ambiguous query
  it('Query C: Ambiguous query should fail retrieval check if similarity is low', () => {
    const query = "यह कहाँ है?";
    const queryVal = guardrails.validateQuery(query);
    expect(queryVal.isValid).toBe(true);

    const retrievalResults: SearchResult[] = [
      { chunk: mockChunk, score: 0.28 } // Fails 0.35 threshold
    ];
    const retVal = guardrails.validateRetrieval(query, retrievalResults);
    expect(retVal.passed).toBe(false);
  });

  // D. Empty query
  it('Query D: Empty query should fail query length validation', () => {
    const query = "   ";
    const queryVal = guardrails.validateQuery(query);
    expect(queryVal.isValid).toBe(false);
    expect(queryVal.reason).toContain("Empty");
  });

  // E. Very short query
  it('Query E: Very short query should fail query validation', () => {
    const query = "ab";
    const queryVal = guardrails.validateQuery(query);
    expect(queryVal.isValid).toBe(false);
    expect(queryVal.reason).toContain("too short");
  });

  // F. Query with weak retrieval
  it('Query F: Query with weak retrieval should trigger refusal fallback', () => {
    const query = "ताजमहल का रंग क्या है?";
    const queryVal = guardrails.validateQuery(query);
    expect(queryVal.isValid).toBe(true);

    const retrievalResults: SearchResult[] = [
      { chunk: mockChunk, score: 0.31 } // Fails 0.35 threshold
    ];
    const retVal = guardrails.validateRetrieval(query, retrievalResults);
    expect(retVal.passed).toBe(false);
  });

  // G. Query where top result is misleading
  it('Query G: Misleading or invalid generated answer should be caught by validation', () => {
    const answer = "I couldn't find enough information in the available sources to answer that reliably.";
    const answerVal = guardrails.validateAnswer(answer);
    expect(answerVal.passed).toBe(false);
    expect(answerVal.fallbackText).toContain("reliably");
  });
});
