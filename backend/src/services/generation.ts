import { GoogleGenAI } from '@google/genai';
import { SearchResult } from './vectorDb';
import { DetailedSearchResult, RetrievalService } from './retrieval';
import { withTimeout } from '../utils/harness';
import * as dotenv from 'dotenv';

dotenv.config();

export interface GroundedAnswer {
  answer: string;
  isGrounded: boolean;
  citations: string[];
  isMock: boolean;
  modelUsed?: string;
  language?: string;
  refusalReason?: string;
}

export class GenerationService {
  private ai: any = null;
  private useMock: boolean = false;
  private modelName: string;
  private readonly fallbackModelChain: string[] = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash'
  ];

  private static requestCount: number = 0;
  private static readonly ESTIMATED_QUOTA_WARN_THRESHOLD = 70; // 70 requests warning threshold

  constructor(forceMock: boolean = false) {
    this.modelName = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite';
    const apiKey = process.env.GEMINI_API_KEY;
    const datasetMode = process.env.DATASET_MODE || 'real';

    if (forceMock || datasetMode === 'mock' || !apiKey || apiKey.startsWith('your_')) {
      if (forceMock) {
        console.log("GenerationService: Mock mode FORCED by constructor.");
      } else {
        console.warn("GEMINI_API_KEY is not set or placeholder is used. Running GenerationService in MOCK mode.");
      }
      this.useMock = true;
    } else {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.error("Failed to initialize GoogleGenAI client for generation:", err);
        this.useMock = true;
      }
    }
  }

  /**
   * Detects the language script of the query text.
   */
  public detectLanguage(text: string): string {
    if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'; // Kannada
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
    return 'en'; // Default Latin / English
  }

  /**
   * Evaluates if context is sufficient and creates a grounded answer for testing/offline use.
   * Strictly verifies that the context contains information answering the query before citing.
   */
  public generateMockAnswer(query: string, contexts: SearchResult[], minScoreThreshold: number = 0.35): GroundedAnswer {
    const refusalText = "I couldn't find enough information in the available sources to answer that reliably.";
    
    if (contexts.length === 0) {
      return {
        answer: refusalText,
        isGrounded: false,
        citations: [],
        isMock: true,
        modelUsed: 'offline-grounded-synthesizer'
      };
    }

    const topCandidate = contexts[0] as DetailedSearchResult;
    const topScore = topCandidate.score ?? 0;

    // Strict offline relevance threshold check (uses caller's threshold, not hardcoded 0.35)
    if (topScore < minScoreThreshold) {
      return {
        answer: refusalText,
        isGrounded: false,
        citations: [],
        isMock: true,
        modelUsed: 'offline-grounded-synthesizer',
        refusalReason: `Evidence relevance score (${topScore.toFixed(3)}) is insufficient.`
      };
    }

    // Check entity/keyword overlap
    const queryTokens = query.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()।|?"'“”]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    const contentWords = queryTokens.filter(w => !RetrievalService.STOP_WORDS.has(w));

    if (contentWords.length >= 2) {
      const topText = topCandidate.chunk.text.toLowerCase();
      const directMatches = contentWords.filter(cw => topText.includes(cw));
      if (directMatches.length === 0 && (topCandidate.vectorScore || topScore) < 0.50) {
        return {
          answer: refusalText,
          isGrounded: false,
          citations: [],
          isMock: true,
          modelUsed: 'offline-grounded-synthesizer',
          refusalReason: `Top retrieved passage lacks essential query entity terms.`
        };
      }
    }

    // Return the source passage text directly
    return {
      answer: topCandidate.chunk.text,
      isGrounded: true,
      citations: [topCandidate.chunk.id],
      isMock: true,
      modelUsed: 'offline-grounded-synthesizer'
    };
  }

  /**
   * Generates a grounded response using Gemini models with retrieved context.
   */
  async generateAnswer(
    query: string,
    contexts: SearchResult[],
    disableFallback: boolean = false,
    targetLanguage?: string,
    minScoreThreshold: number = 0.35
  ): Promise<GroundedAnswer> {
    const refusalText = "I couldn't find enough information in the available sources to answer that reliably.";

    if (this.useMock || !this.ai) {
      return this.generateMockAnswer(query, contexts, minScoreThreshold);
    }

    if (contexts.length === 0) {
      return {
        answer: refusalText,
        isGrounded: false,
        citations: [],
        isMock: false,
        modelUsed: this.modelName
      };
    }

    const lang = targetLanguage || this.detectLanguage(query);
    const langInstructions: Record<string, string> = {
      'hi': 'Please answer clearly in Hindi (हिन्दी).',
      'kn': 'Please answer clearly in Kannada (ಕನ್ನಡ).',
      'ta': 'Please answer clearly in Tamil (தமிழ்).',
      'te': 'Please answer clearly in Telugu (తెలుగు).',
      'en': 'Please answer clearly in English.'
    };

    const targetLangPrompt = langInstructions[lang] || langInstructions['en'];

    // Format concise context passages with source tags
    const contextText = contexts.map((c, i) => {
      const srcId = c.chunk.id || `doc-${i}`;
      const snippet = c.chunk.text.length > 400 ? c.chunk.text.substring(0, 390) + '...' : c.chunk.text;
      return `[Source ${i + 1}] (ID: ${srcId})\n${snippet}`;
    }).join('\n\n');

    const prompt = `You are a precision factual question-answering assistant.
Answer the user's question using ONLY the factual evidence provided in the context below.

CONTEXT EVIDENCE:
${contextText}

QUESTION:
${query}

STRICT GROUNDING INSTRUCTIONS:
1. Base your answer EXCLUSIVELY on facts explicitly stated in the context passages above.
2. If the context does not contain sufficient factual evidence to answer the question accurately, say EXACTLY:
"${refusalText}"
3. Do NOT extrapolate, speculate, or introduce external knowledge.
4. Formulate a direct, concise answer in 1-2 sentences.
5. Explicitly reference the source tag (e.g. [Source 1]) when stating facts.
6. ${targetLangPrompt}`;

    const modelsToTry = [this.modelName, ...this.fallbackModelChain.filter(m => m !== this.modelName)];

    for (const currentModel of modelsToTry) {
      try {
        const response = await this.ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            temperature: 0.0,
            maxOutputTokens: 120
          }
        });

        const rawText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const answerText = rawText.trim();

        if (!answerText) continue;

        if (
          answerText.includes(refusalText) ||
          answerText.includes("I don't have enough context") ||
          answerText.includes("does not contain sufficient")
        ) {
          return {
            answer: refusalText,
            isGrounded: false,
            citations: [],
            isMock: false,
            modelUsed: currentModel,
            language: lang
          };
        }

        // Identify which specific chunks are cited
        const validCitations: string[] = [];
        for (let i = 0; i < contexts.length; i++) {
          const c = contexts[i];
          const sourceTag = `Source ${i + 1}`;
          const idTag = c.chunk.id;
          
          if (answerText.includes(sourceTag) || answerText.includes(idTag)) {
            validCitations.push(c.chunk.id);
          }
        }

        if (validCitations.length === 0 && contexts.length > 0) {
          const topChunk = contexts[0].chunk;
          const answerWords = answerText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3 && !RetrievalService.STOP_WORDS.has(w));
          const chunkTextLower = topChunk.text.toLowerCase();
          const hasOverlap = answerWords.some((w: string) => chunkTextLower.includes(w));
          
          if (hasOverlap) {
            validCitations.push(topChunk.id);
          }
        }

        const cleanAnswer = answerText
          .replace(/\[Source\s*\d+\]/gi, '')
          .replace(/\[msmarco-[^\]]+\]/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        return {
          answer: cleanAnswer || refusalText,
          isGrounded: validCitations.length > 0,
          citations: Array.from(new Set(validCitations)),
          isMock: false,
          modelUsed: currentModel,
          language: lang
        };

      } catch (error: any) {
        console.warn(`[Gemini generateAnswer error on ${currentModel}]:`, error.message || error);
      }
    }

    if (disableFallback) {
      throw new Error("All Gemini generation model candidates failed to produce an answer.");
    }
    
    console.warn("All Gemini Generation models failed. Falling back to retrieved evidence text directly.");
    return this.generateMockAnswer(query, contexts);
  }

  /**
   * Generates a general-knowledge answer via Gemini when a query is out-of-corpus (Phase 3 fallback).
   * Strictly disclaimed as general knowledge and never claims MSMARCO-XI grounding.
   */
  public async generateGeneralKnowledgeAnswer(
    query: string,
    language?: string
  ): Promise<{ answer: string; modelUsed: string; isMock: boolean }> {
    const lang = language || this.detectLanguage(query);
    const langInstructions: Record<string, string> = {
      'hi': 'Please answer clearly in Hindi (हिन्दी).',
      'kn': 'Please answer clearly in Kannada (ಕನ್ನಡ).',
      'ta': 'Please answer clearly in Tamil (தமிழ்).',
      'te': 'Please answer clearly in Telugu (తెలుగు).',
      'en': 'Please answer clearly in English.'
    };

    const targetLangPrompt = langInstructions[lang] || langInstructions['en'];

    if (!this.ai) {
      throw new Error("Gemini API client not initialized. Cannot perform general-knowledge generation.");
    }

    const systemInstruction = `You are a knowledgeable and helpful factual assistant. 
Answer the user's question directly, accurately, factually, and concisely in 1 clear sentence.
${targetLangPrompt}`;

    const modelsToTry = [this.modelName, ...this.fallbackModelChain.filter(m => m !== this.modelName)];
    let lastError: any = null;

    GenerationService.requestCount++;
    if (GenerationService.requestCount >= GenerationService.ESTIMATED_QUOTA_WARN_THRESHOLD) {
      console.warn(`[QUOTA_MONITOR] Generation request count (${GenerationService.requestCount}) has reached 70% of estimated quota threshold.`);
    }

    for (const currentModel of modelsToTry) {
      const attemptStart = Date.now();
      try {
        const response = await withTimeout(
          this.ai.models.generateContent({
            model: currentModel,
            contents: query,
            config: {
              systemInstruction,
              temperature: 0.0,
              maxOutputTokens: 80
            }
          }),
          8000,
          `Model ${currentModel} exceeded 8s timeout`
        );

        const respObj = response as any;
        const rawText = respObj?.text || respObj?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const answerText = rawText.trim();

        if (answerText) {
          console.log(`[Gemini Fallback Success] Model: ${currentModel} responded in ${Date.now() - attemptStart}ms.`);
          return {
            answer: answerText,
            modelUsed: currentModel,
            isMock: false
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini fallback attempt on ${currentModel} failed in ${Date.now() - attemptStart}ms]:`, err.message || err);
      }
    }

    console.error(`[Gemini API Error] All models failed generateGeneralKnowledgeAnswer:`, lastError?.message || lastError);
    throw lastError || new Error("Failed to generate general-knowledge answer across all candidate models.");
  }

  /**
   * Generates a streaming grounded answer using retrieved passages.
   */
  async *generateAnswerStream(
    query: string,
    contexts: SearchResult[],
    languageHint?: string
  ): AsyncGenerator<string, void, unknown> {
    if (this.useMock) {
      const mockResult = this.generateMockAnswer(query, contexts);
      const words = mockResult.answer.split(' ');
      for (const word of words) {
        yield word + ' ';
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      return;
    }

    const result = await this.generateAnswer(query, contexts, false, languageHint);
    const words = result.answer.split(' ');
    for (const word of words) {
      yield word + ' ';
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
}
