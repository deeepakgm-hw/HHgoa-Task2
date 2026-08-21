import { SttService, EmptyTranscriptError } from './stt';
import { EmbeddingService } from './embeddings';
import { RetrievalService, DetailedSearchResult } from './retrieval';
import { RerankingService } from './reranking';
import { GenerationService } from './generation';
import { GuardrailService } from './guardrails';
import { TelemetryTracker, LatencyReport } from './telemetry';
import { withTimeout, withRetries } from '../utils/harness';
import { Logger } from '../utils/logger';

export interface QueryPipelineInput {
  query: string;
  strategy?: 'fixed' | 'sentence' | 'semantic' | 'metadata';
  rerank?: boolean;
  confidenceThreshold?: number;
  languageCode?: string; // 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'all'
}

export interface VoiceQueryPipelineInput extends Omit<QueryPipelineInput, 'query'> {
  audioBuffer: Buffer;
  filename: string;
  languageCode?: string; // 'hi-IN' | 'kn-IN' | 'ta-IN' | 'te-IN' | 'en-IN'
}

export interface TechnicalDebugInfo {
  query: string;
  normalizedQuery: string;
  detectedLanguage: string;
  executionPath?: 'GROUNDED_RAG' | 'GEMINI_FALLBACK' | 'REFUSAL';
  topVectorCandidates: { id: string; score: number; textSnippet: string }[];
  topLexicalCandidates: { id: string; score: number; matchedTerms: string[]; textSnippet: string }[];
  hybridCandidates: { id: string; hybridScore: number; vectorScore: number; lexicalScore: number }[];
  rerankedCandidates: { id: string; rerankScore: number }[];
  relevanceThreshold: number;
  retrievalGate: { passed: boolean; reason?: string; topScore: number };
  groundingGate: { passed: boolean; isGrounded: boolean; reason?: string };
  generationContextSent?: string;
  citations: string[];
}

export interface QueryPipelineOutput {
  requestId: string;
  query: string;
  transcript: string;
  language: string;
  status: 'success' | 'gemini_fallback' | 'insufficient_context' | 'error';
  mode: 'LIVE' | 'MOCK' | 'GROUNDED_SUCCESS' | 'GEMINI_FALLBACK' | 'REFUSED';
  source?: 'msmarco_grounded' | 'gemini_general' | 'guardrail_refusal';
  isGrounded?: boolean;
  answer: string;
  disclosure?: string;
  citations: string[];
  sources: {
    id: string;
    text: string;
    score: number;
    vectorScore?: number;
    lexicalScore?: number;
    strategy: string;
    language?: string;
    datasetName?: string;
    split?: string;
    docId?: string;
    passageId?: string;
    isSelected?: boolean;
  }[];
  telemetry: LatencyReport;
  reason?: string;
  debug?: TechnicalDebugInfo;
}

export class RagPipeline {
  private static responseCache: Map<string, { output: QueryPipelineOutput; timestamp: number }> = new Map();
  private static readonly CACHE_MAX_SIZE = 1000;
  private static readonly CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  constructor(
    private sttService: SttService,
    private embedService: EmbeddingService,
    private retrievalService: RetrievalService,
    private rerankingService: RerankingService,
    private genService: GenerationService,
    private guardrailService: GuardrailService
  ) {}

  /**
   * Automatically detects language script if not provided.
   */
  private detectScript(text: string): string {
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
    return 'en';
  }

  /**
   * Main RAG logic runner for text queries.
   */
  async executeTextQuery(
    requestId: string,
    input: QueryPipelineInput
  ): Promise<QueryPipelineOutput> {
    const tracker = new TelemetryTracker();
    const query = input.query || "";
    const strategy = input.strategy || 'semantic';
    const rerankEnabled = input.rerank !== false;
    const threshold = input.confidenceThreshold !== undefined 
      ? input.confidenceThreshold 
      : (process.env.CONFIDENCE_THRESHOLD ? parseFloat(process.env.CONFIDENCE_THRESHOLD) : GuardrailService.DEFAULT_CONFIDENCE_THRESHOLD);
    const detectedLang = this.detectScript(query);
    const language = input.languageCode ? input.languageCode.split('-')[0].toLowerCase() : detectedLang;

    // Sub-millisecond In-Memory Response Cache Check (Instant Answer)
    const cacheKey = `${query.trim().toLowerCase()}::${language}::${strategy}`;
    const cached = RagPipeline.responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < RagPipeline.CACHE_TTL_MS)) {
      console.log(`[INSTANT_CACHE_HIT] [${requestId}] Returning instant response for "${query}" in 0ms`);
      return {
        ...cached.output,
        requestId,
        telemetry: {
          stt: 0,
          normalization: 0,
          embedding: 0,
          retrieval: 0,
          rerank: 0,
          generation: 0,
          total: 1
        }
      };
    }

    console.log(`[QUERY_START] [${requestId}] Text query: "${query}" (lang=${language}, strategy=${strategy}, rerank=${rerankEnabled}, threshold=${threshold})`);
    Logger.info(`Executing pipeline for text query: "${query}"`, requestId, { language, strategy, rerankEnabled, threshold });

    try {
      // 1. Stage 1: Normalization & Input Validation / Gibberish / Safety Screen
      const normStop = tracker.startStage('normalization');
      const valGuard = new GuardrailService(threshold);
      const validation = valGuard.validateQuery(query);
      normStop();

      if (!validation.isValid) {
        throw { statusCode: 400, message: validation.reason || "Query validation failed" };
      }

      // 2. Query Embedding
      const queryEmbedding = await tracker.track('embedding', () =>
        withTimeout(
          withRetries(() => this.embedService.embedText(query)),
          10000,
          "Embedding generation timed out"
        )
      );

      // 3. Multilingual Retrieval (with strict language partition)
      const retrieved = await tracker.track('retrieval', () =>
        withTimeout(
          this.retrievalService.retrieve(query, queryEmbedding, {
            topK: 3,
            strategy,
            language: language === 'all' ? undefined : language,
            hybridWeight: 0.25
          }),
          5000,
          "Vector search timed out"
        )
      );

      console.log(`[RETRIEVAL_COMPLETE] [${requestId}] Retrieved ${retrieved.length} chunks for lang=${language}. Top score: ${retrieved[0]?.score?.toFixed(3) || 'none'}`);

      // 4. Reranking
      const reranked = (await tracker.track('rerank', () =>
        Promise.resolve(this.retrievalService.rerank(query, retrieved, rerankEnabled))
      )) as DetailedSearchResult[];

      // 5. Guardrail: Validate Confidence on Reranked Evidence
      const retrievalValidation = valGuard.validateRetrieval(query, reranked);

      // Build technical debug info
      const debugInfo: TechnicalDebugInfo = {
        query,
        normalizedQuery: query.trim().toLowerCase(),
        detectedLanguage: language,
        executionPath: retrievalValidation.passed ? 'GROUNDED_RAG' : 'GEMINI_FALLBACK',
        topVectorCandidates: reranked.map(r => ({ id: r.chunk.id, score: r.vectorScore, textSnippet: r.chunk.text.substring(0, 80) })),
        topLexicalCandidates: reranked.map(r => ({ id: r.chunk.id, score: r.lexicalScore, matchedTerms: r.matchedTerms || [], textSnippet: r.chunk.text.substring(0, 80) })),
        hybridCandidates: reranked.map(r => ({ id: r.chunk.id, hybridScore: r.hybridScore, vectorScore: r.vectorScore, lexicalScore: r.lexicalScore })),
        rerankedCandidates: reranked.map(r => ({ id: r.chunk.id, rerankScore: r.rerankScore })),
        relevanceThreshold: threshold,
        retrievalGate: {
          passed: retrievalValidation.passed,
          reason: retrievalValidation.reason,
          topScore: retrievalValidation.topScore ?? 0
        },
        groundingGate: { passed: false, isGrounded: false },
        citations: []
      };

      // ── PHASE 3 FALLBACK: OUT-OF-CORPUS DISCLOSED GEMINI GENERAL KNOWLEDGE ──
      if (!retrievalValidation.passed) {
        console.log(`[GROUNDING_GATE_BELOW_THRESHOLD] [${requestId}] Reason: ${retrievalValidation.reason}`);
        console.log(`[GEMINI_FALLBACK_ENGAGED] [${requestId}] Invoking disclosed general-knowledge fallback (model=${process.env.GEMINI_GENERATION_MODEL || 'gemini-3.6-flash'})...`);
        
        let fallbackResult;
        try {
          fallbackResult = await tracker.track('generation', () =>
            withTimeout(
              withRetries(() => this.genService.generateGeneralKnowledgeAnswer(query, language)),
              25000,
              "Gemini general-knowledge fallback timed out after 25s"
            )
          );
        } catch (fbErr: any) {
          console.error(`[GEMINI_FALLBACK_ERROR] [${requestId}]`, fbErr.message || fbErr);
          return {
            requestId,
            query,
            transcript: query,
            language,
            status: 'insufficient_context',
            mode: 'REFUSED',
            source: 'gemini_general',
            isGrounded: false,
            answer: "Couldn't generate an answer right now — please try again.",
            disclosure: 'Answered from general knowledge (Gemini) — not verified against the MSMARCO-XI dataset.',
            citations: [],
            sources: [],
            telemetry: tracker.getReport(),
            reason: fbErr.message || "Failed to reach general knowledge model.",
            debug: debugInfo
          };
        }

        const report = tracker.getReport();
        console.log(`[RESPONSE_SENT] [${requestId}] Status: gemini_fallback | Disclosed General Knowledge Answer`);

        return {
          requestId,
          query,
          transcript: query,
          language,
          status: 'gemini_fallback',
          mode: 'GEMINI_FALLBACK',
          source: 'gemini_general',
          isGrounded: false,
          answer: fallbackResult.answer,
          disclosure: 'Answered from general knowledge (Gemini) — not verified against the MSMARCO-XI dataset.',
          citations: [],
          sources: [],
          telemetry: report,
          debug: debugInfo
        };
      }

      // ── IN-CORPUS GROUNDED GENERATION ──
      console.log(`[GENERATION_START] [${requestId}] Invoking Gemini grounded generation (target language: ${language})...`);
      let generationResult;
      try {
        generationResult = await tracker.track('generation', () =>
          withTimeout(
            withRetries(() => this.genService.generateAnswer(query, reranked, false, language, threshold)),
            15000,
            "GENERATION_TIMEOUT: Gemini generation timed out after 15000ms"
          )
        );
        console.log(`[GENERATION_COMPLETE] [${requestId}] Grounded generation finished (mode=${generationResult.isMock ? 'MOCK' : 'LIVE'})`);
      } catch (genErr: any) {
        console.warn(`[GENERATION_FALLBACK] [${requestId}] Remote generation error (${genErr.message || genErr}). Synthesizing grounded answer directly from retrieved evidence.`);
        generationResult = this.genService.generateMockAnswer(query, reranked, threshold);
      }

      // 7. Guardrail: Final Groundedness Verification
      const finalValidation = valGuard.validateAnswer(generationResult.answer, query, reranked);
      debugInfo.groundingGate = {
        passed: finalValidation.passed,
        isGrounded: finalValidation.isGrounded,
        reason: finalValidation.reason
      };

      if (!finalValidation.passed || !generationResult.isGrounded) {
        console.log(`[GROUNDING_VERIFICATION_FAILED] [${requestId}] Reason: ${finalValidation.reason || 'Ungrounded model answer'}. Falling back to general knowledge.`);
        try {
          const fallbackResult = await this.genService.generateGeneralKnowledgeAnswer(query, language);
          return {
            requestId,
            query,
            transcript: query,
            language,
            status: 'gemini_fallback',
            mode: 'GEMINI_FALLBACK',
            source: 'gemini_general',
            isGrounded: false,
            answer: fallbackResult.answer,
            disclosure: 'Answered from general knowledge (Gemini) — not verified against the MSMARCO-XI dataset.',
            citations: [],
            sources: [],
            telemetry: tracker.getReport(),
            debug: debugInfo
          };
        } catch (fbErr: any) {
          console.error(`[FALLBACK_GENERATION_FAILED] [${requestId}]`, fbErr.message || fbErr);
          return {
            requestId,
            query,
            transcript: query,
            language,
            status: 'insufficient_context',
            mode: 'REFUSED',
            source: 'gemini_general',
            isGrounded: false,
            answer: "Couldn't generate an answer right now — please try again.",
            disclosure: 'Answered from general knowledge (Gemini) — not verified against the MSMARCO-XI dataset.',
            citations: [],
            sources: [],
            telemetry: tracker.getReport(),
            reason: fbErr.message,
            debug: debugInfo
          };
        }
      }

      // 8. Citation validation
      const validCitations = (generationResult.citations || []).filter((cId: string) => 
        reranked.some(r => r.chunk.id === cId)
      );

      const sourcesOut = reranked.map(r => ({
        id: r.chunk.id,
        text: r.chunk.text,
        score: r.score,
        vectorScore: r.vectorScore,
        lexicalScore: r.lexicalScore,
        strategy: r.chunk.strategy,
        language: r.chunk.metadata?.language,
        datasetName: r.chunk.metadata?.datasetName,
        split: r.chunk.metadata?.split,
        docId: r.chunk.metadata?.docId,
        passageId: r.chunk.metadata?.passageId,
        isSelected: r.chunk.metadata?.isSelected
      }));

      const report = tracker.getReport();
      console.log(`[RESPONSE_SENT] [${requestId}] Status: success | Grounded: true | Citations: ${validCitations.length}`);

      const finalOutput: QueryPipelineOutput = {
        requestId,
        query,
        transcript: query,
        language,
        status: 'success',
        mode: 'GROUNDED_SUCCESS',
        source: 'msmarco_grounded',
        isGrounded: true,
        answer: generationResult.answer,
        citations: validCitations.length > 0 ? validCitations : (sourcesOut[0]?.id ? [sourcesOut[0].id] : []),
        sources: sourcesOut,
        telemetry: report,
        debug: debugInfo
      };

      if (RagPipeline.responseCache.size >= RagPipeline.CACHE_MAX_SIZE) {
        const oldestKey = RagPipeline.responseCache.keys().next().value;
        if (oldestKey) RagPipeline.responseCache.delete(oldestKey);
      }
      RagPipeline.responseCache.set(cacheKey, { output: finalOutput, timestamp: Date.now() });

      return finalOutput;

    } catch (err: any) {
      Logger.error(`Pipeline execution failed: ${err.message || err}`, requestId);
      throw err;
    }
  }

  /**
   * Main RAG logic runner for voice queries.
   */
  async executeVoiceQuery(
    requestId: string,
    input: VoiceQueryPipelineInput
  ): Promise<QueryPipelineOutput> {
    const tracker = new TelemetryTracker();
    const strategy = input.strategy || 'semantic';
    const rerankEnabled = input.rerank !== false;
    const threshold = input.confidenceThreshold !== undefined
      ? input.confidenceThreshold
      : (process.env.CONFIDENCE_THRESHOLD ? parseFloat(process.env.CONFIDENCE_THRESHOLD) : GuardrailService.DEFAULT_CONFIDENCE_THRESHOLD);
    const audioLang = input.languageCode || 'hi-IN';

    console.log(`[VOICE_START] [${requestId}] Audio: ${input.filename} (${input.audioBuffer.length} bytes, lang=${audioLang})`);

    // 1. Speech-to-Text Transcription
    let transcript = "";
    try {
      transcript = await tracker.track('stt', () =>
        withTimeout(
          withRetries(() => this.sttService.transcribe(input.audioBuffer, input.filename, audioLang)),
          25000,
          "Sarvam STT transcription timed out after 25s"
        )
      );
    } catch (sttErr: any) {
      if (sttErr instanceof EmptyTranscriptError) {
        throw { statusCode: 400, message: "Empty audio recording or speech could not be recognized." };
      }
      throw { statusCode: 502, message: `STT service error: ${sttErr.message || sttErr}` };
    }

    if (!transcript || transcript.trim().length === 0) {
      throw { statusCode: 400, message: "Empty audio recording or speech could not be recognized." };
    }

    console.log(`[TRANSCRIPTION_COMPLETE] [${requestId}] Transcript: "${transcript}"`);

    // 2. Delegate to text pipeline logic with STT telemetry attached
    const textOutput = await this.executeTextQuery(requestId, {
      query: transcript,
      strategy,
      rerank: rerankEnabled,
      confidenceThreshold: threshold,
      languageCode: audioLang
    });

    return {
      ...textOutput,
      transcript,
      telemetry: {
        ...textOutput.telemetry,
        stt: tracker.getReport().stt,
        total: (tracker.getReport().stt || 0) + (textOutput.telemetry.total || 0)
      }
    };
  }

  private createRefusalResponse(
    requestId: string,
    query: string,
    transcript: string,
    language: string,
    reason: string,
    telemetry: LatencyReport,
    debug?: TechnicalDebugInfo
  ): QueryPipelineOutput {
    return {
      requestId,
      query,
      transcript,
      language,
      status: 'insufficient_context',
      mode: 'REFUSED',
      source: 'guardrail_refusal',
      isGrounded: false,
      answer: reason,
      citations: [],
      sources: [],
      telemetry,
      reason,
      debug
    };
  }
}
