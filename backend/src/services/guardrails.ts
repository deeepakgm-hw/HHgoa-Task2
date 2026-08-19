import { SearchResult } from './vectorDb';
import { DetailedSearchResult, RetrievalService } from './retrieval';

/**
 * Content-type classification for a query string.
 * Returns the detected category and a human-readable reason.
 */
export interface ContentScreenResult {
  safe: boolean;
  category: 'safe' | 'harmful' | 'gibberish';
  reason?: string;
}

export interface RetrievalValidationResult {
  passed: boolean;
  reason?: string;
  topScore?: number;
  thresholdUsed?: number;
  matchedTerms?: string[];
}

export interface AnswerValidationResult {
  passed: boolean;
  isGrounded: boolean;
  fallbackText?: string;
  reason?: string;
}

/**
 * Common functional stopwords across supported Indic languages
 */
const INDIC_STOP_WORDS = new Set([
  // Hindi (Devanagari)
  'है', 'हैं', 'का', 'की', 'के', 'में', 'पर', 'से', 'को', 'और', 'या', 'तो', 'भी', 'ने', 'यह', 'वह', 'क्या', 'कहाँ', 'क्यों', 'कैसे', 'किस', 'था', 'थी', 'थे',
  // Kannada
  'ಮತ್ತು', 'ಅಥವಾ', 'ಎಂದು', 'ಇದು', 'ಅದು', 'ಯಾವ', 'ಏನು', 'ಎಲ್ಲಿ', 'ಹೇಗೆ', 'ಯಾಕೆ', 'ನಲ್ಲಿ', 'ಗೆ', 'ಅನ್ನು', 'ಇದೆ',
  // Tamil
  'மற்றும்', 'அல்லது', 'என்று', 'இது', 'அது', 'என்ன', 'எங்கே', 'ஏன்', 'எப்படி', 'இல்', 'க்கு', 'ஐ', 'உள்ளது',
  // Telugu
  'మరియు', 'లేదా', 'అని', 'ఇది', 'అది', 'ఏమిటి', 'ఎక్కడ', 'ఎందుకు', 'ఎలా', 'లో', 'కి', 'ను', 'ఉంది'
]);

/**
 * GuardrailService
 *
 * Multi-stage gate enforcing factual grounding, relevance thresholds, and safety:
 *
 *  Stage 1 — validateQuery:
 *    Rejects empty / too-short queries, gibberish strings, and screens for harmful / dangerous instructions.
 *
 *  Stage 2 — validateRetrieval:
 *    Checks if top candidate exceeds the calibrated relevance threshold (>= 0.45)
 *    AND contains essential query content/entity terms.
 *
 *  Stage 3 — validateAnswer:
 *    Verifies that the generated answer is strictly grounded in the retrieved evidence text.
 */
export class GuardrailService {
  private static readonly HARMFUL_PATTERNS: RegExp[] = [
    /\b(make|build|create|construct|synthesize|manufacture)\b.{0,40}\b(bomb|explosive|weapon|poison|virus|malware|ransomware)\b/i,
    /\b(how to|steps to|instructions? for)\b.{0,30}\b(kill|harm|hurt|attack|shoot|stab)\b.{0,20}\b(person|people|human|someone|myself)\b/i,
    /\b(suicide|self.harm)\b.{0,20}\b(method|how|way|steps)\b/i,
    /\b(hack|crack|exploit)\b.{0,20}\b(password|account|system|server|database)\b/i,
  ];

  public static readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.45;

  constructor(private minScoreThreshold: number = GuardrailService.DEFAULT_CONFIDENCE_THRESHOLD) {}

  /**
   * Screens text for harmful content patterns or nonsensical gibberish.
   */
  screenContent(text: string): ContentScreenResult {
    const trimmed = text.trim();

    // 1. Harmful Content Screen
    for (const pattern of GuardrailService.HARMFUL_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          category: 'harmful',
          reason: 'Query contains a request for harmful or dangerous information that cannot be answered.'
        };
      }
    }

    // 2. Gibberish / Keyboard Smash Screen
    // Single repeated character >= 4 times (e.g. "aaaaa", "zzzzz")
    if (/(.)\1{3,}/.test(trimmed)) {
      return {
        safe: false,
        category: 'gibberish',
        reason: 'Query contains nonsensical or repetitive gibberish input.'
      };
    }

    // Latin strings >= 5 chars with zero vowels (e.g. "asdfghjkl", "qwrtpsdfg")
    if (/^[a-zA-Z\s]+$/.test(trimmed) && trimmed.length >= 5) {
      const words = trimmed.toLowerCase().split(/\s+/);
      const hasVowellessLongWord = words.some(w => w.length >= 5 && !/[aeiouy]/.test(w));
      if (hasVowellessLongWord) {
        return {
          safe: false,
          category: 'gibberish',
          reason: 'Query contains nonsensical or unrecognized words.'
        };
      }
    }

    return { safe: true, category: 'safe' };
  }

  /**
   * Stage 1: Validates query text for length, completeness, harmful content, and gibberish.
   */
  validateQuery(query: string): { isValid: boolean; reason?: string } {
    if (!query || query.trim().length === 0) {
      return { isValid: false, reason: "Empty query or transcript." };
    }
    if (query.trim().length < 3) {
      return { isValid: false, reason: "Query is too short to process." };
    }

    const screen = this.screenContent(query);
    if (!screen.safe) {
      return { isValid: false, reason: screen.reason };
    }

    return { isValid: true };
  }

  /**
   * Stage 2: Assesses if retrieved documents are sufficiently relevant to answer the query.
   * Enforces both numeric threshold and entity/keyword coverage.
   */
  validateRetrieval(query: string, results: SearchResult[]): RetrievalValidationResult {
    if (!results || results.length === 0) {
      return {
        passed: false,
        reason: "No matching documents found in index.",
        topScore: 0,
        thresholdUsed: this.minScoreThreshold
      };
    }

    const top = results[0] as DetailedSearchResult;
    const topScore = top.score ?? 0;

    // 1. Minimum calibrated score threshold check
    if (topScore < this.minScoreThreshold) {
      return {
        passed: false,
        reason: `Relevance score (${topScore.toFixed(3)}) falls below grounding confidence threshold (${this.minScoreThreshold.toFixed(2)}).`,
        topScore,
        thresholdUsed: this.minScoreThreshold,
        matchedTerms: top.matchedTerms || []
      };
    }

    // 2. Multilingual Substantive Entity Coverage Check:
    const queryTokens = query.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()।|?"'“”]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    const contentWords = queryTokens.filter(w => !RetrievalService.STOP_WORDS.has(w) && !INDIC_STOP_WORDS.has(w));

    if (contentWords.length >= 2) {
      const topText = top.chunk.text.toLowerCase();
      const directMatches = contentWords.filter(cw => cw.length >= 3 && topText.includes(cw));
      const matchRatio = directMatches.length / contentWords.length;

      if ((directMatches.length < 2 || matchRatio < 0.4) && (top.vectorScore || topScore) < 0.60) {
        return {
          passed: false,
          reason: `Retrieved passages lack sufficient query entity coverage [matched: ${directMatches.join(', ') || 'none'} of ${contentWords.slice(0, 3).join(', ')}].`,
          topScore,
          thresholdUsed: this.minScoreThreshold,
          matchedTerms: directMatches
        };
      }
    }

    return {
      passed: true,
      topScore,
      thresholdUsed: this.minScoreThreshold,
      matchedTerms: top.matchedTerms || []
    };
  }

  /**
   * Stage 3: Groundedness verification on generated answer.
   * Ensures the answer is derived strictly from the supplied evidence passages.
   */
  validateAnswer(
    answerText: string,
    query?: string,
    retrievedContexts: SearchResult[] = []
  ): AnswerValidationResult {
    const refusalPhrase = "I couldn't find enough information";
    
    if (
      !answerText || 
      answerText.includes(refusalPhrase) ||
      answerText.includes("I don't have enough context")
    ) {
      return {
        passed: true,
        isGrounded: false,
        fallbackText: answerText || "Context relevance below confidence threshold"
      };
    }

    if (retrievedContexts.length === 0) {
      return {
        passed: false,
        isGrounded: false,
        fallbackText: refusalPhrase + " in the available sources to answer that reliably.",
        reason: "Zero context passages were retrieved."
      };
    }

    const lowerAnswer = answerText.toLowerCase();
    const allContextText = retrievedContexts
      .map(r => r.chunk.text.toLowerCase())
      .join(' ');

    const answerWords = lowerAnswer
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()।|?"'“”]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !RetrievalService.STOP_WORDS.has(w) && !INDIC_STOP_WORDS.has(w));

    if (answerWords.length === 0) {
      return { passed: true, isGrounded: true };
    }

    const matchingWords = answerWords.filter(w => allContextText.includes(w));
    const overlapRatio = matchingWords.length / answerWords.length;

    // Must have at least 20% substantive content word overlap with retrieved text
    if (overlapRatio < 0.20) {
      return {
        passed: false,
        isGrounded: false,
        fallbackText: "I couldn't find enough verified evidence in the dataset to answer that reliably.",
        reason: `Answer token overlap (${(overlapRatio * 100).toFixed(1)}%) is below grounding requirement (20%).`
      };
    }

    return {
      passed: true,
      isGrounded: true
    };
  }
}
