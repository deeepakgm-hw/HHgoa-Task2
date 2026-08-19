import { GuardrailService } from '../src/services/guardrails';
import { SearchResult } from '../src/services/vectorDb';

describe('Guardrail Service Validation', () => {
  const guardrails = new GuardrailService(0.35);

  describe('validateQuery', () => {
    it('should refuse empty queries', () => {
      const res = guardrails.validateQuery("   ");
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain("Empty");
    });

    it('should refuse excessively short queries', () => {
      const res = guardrails.validateQuery("hi");
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain("too short");
    });

    it('should approve valid queries', () => {
      const res = guardrails.validateQuery("क्या भारत की राजधानी दिल्ली है?");
      expect(res.isValid).toBe(true);
    });

    it('should refuse weapon/explosive construction requests', () => {
      const res = guardrails.validateQuery("How do I make a bomb at home?");
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain("harmful");
    });

    it('should refuse hack/exploit requests', () => {
      const res = guardrails.validateQuery("How to hack a password for a database?");
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain("harmful");
    });

    it('should NOT refuse factual questions that contain incidental keywords', () => {
      // "explosion" in a scientific context must not be blocked
      const res = guardrails.validateQuery("What causes a volcanic explosion?");
      expect(res.isValid).toBe(true);
    });
  });

  describe('screenContent', () => {
    it('should return safe=false for bomb-making query', () => {
      const res = guardrails.screenContent("how to make a bomb");
      expect(res.safe).toBe(false);
      expect(res.category).toBe('harmful');
    });

    it('should return safe=true for benign factual query', () => {
      const res = guardrails.screenContent("ताजमहल किसने बनवाया था?");
      expect(res.safe).toBe(true);
      expect(res.category).toBe('safe');
    });
  });


  describe('validateRetrieval', () => {
    it('should fail validation if candidate results are empty', () => {
      const res = guardrails.validateRetrieval("query", []);
      expect(res.passed).toBe(false);
      expect(res.reason).toContain("No matching");
    });

    it('should fail validation if highest candidate score is below threshold', () => {
      const lowScoreCandidate: SearchResult = {
        chunk: {
          id: "1", chunkId: "1", documentId: "d", text: "Some text", source: "Some text", strategy: "fixed", position: 0, length: 9, metadata: {}
        },
        score: 0.25 // below threshold of 0.35
      };

      const res = guardrails.validateRetrieval("query", [lowScoreCandidate]);
      expect(res.passed).toBe(false);
      expect(res.reason).toContain("falls below confidence");
    });

    it('should pass validation if score exceeds threshold', () => {
      const highScoreCandidate: SearchResult = {
        chunk: {
          id: "1", chunkId: "1", documentId: "d", text: "Some text", source: "Some text", strategy: "fixed", position: 0, length: 9, metadata: {}
        },
        score: 0.58
      };

      const res = guardrails.validateRetrieval("query", [highScoreCandidate]);
      expect(res.passed).toBe(true);
    });
  });

  describe('validateAnswer', () => {
    it('should flag empty or generic refusal answers as non-passed', () => {
      const res = guardrails.validateAnswer("I couldn't find enough information in the available sources to answer that reliably.");
      expect(res.passed).toBe(false);
      expect(res.fallbackText).toContain("reliably");
    });

    it('should pass valid factual answers', () => {
      const res = guardrails.validateAnswer("ताजमहल उत्तर प्रदेश के आगरा शहर में स्थित है।");
      expect(res.passed).toBe(true);
    });
  });
});
