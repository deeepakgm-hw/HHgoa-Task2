import { performance } from 'perf_hooks';

export interface LatencyReport {
  stt: number | null;
  normalization: number;
  embedding: number;
  retrieval: number;
  rerank: number;
  generation: number;
  total: number;
}

export interface RequestTrace {
  requestId: string;
  status: 'SUCCESS' | 'REFUSED' | 'RATE_LIMITED' | 'TIMEOUT' | 'API_ERROR' | 'VALIDATION_ERROR';
  sttMs: number | null;
  embeddingMs: number;
  retrievalMs: number;
  rerankingMs: number;
  guardrailMs: number;
  generationMs: number;
  totalMs: number;
  error?: string;
}

export class TelemetryTracker {
  private timings: Partial<Record<keyof Omit<LatencyReport, 'total'>, number>> = {};
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Starts tracking a specific pipeline phase. Returns a callback to stop tracking.
   * 
   * @param stage Name of the pipeline stage
   */
  startStage(stage: keyof Omit<LatencyReport, 'total'>): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.timings[stage] = parseFloat(duration.toFixed(2));
    };
  }

  /**
   * Tracks an asynchronous block of code.
   * 
   * @param stage Stage identifier
   * @param fn The asynchronous function to execute
   */
  async track<T>(stage: keyof Omit<LatencyReport, 'total'>, fn: () => Promise<T>): Promise<T> {
    const stop = this.startStage(stage);
    try {
      return await fn();
    } finally {
      stop();
    }
  }

  /**
   * Returns a report containing exact latency numbers.
   * If a stage (like STT) was not executed, its value will be null rather than 0.
   */
  getReport(): LatencyReport {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;

    const stt = this.timings.stt !== undefined ? this.timings.stt : null;
    const normalization = this.timings.normalization || 0;
    const embedding = this.timings.embedding || 0;
    const retrieval = this.timings.retrieval || 0;
    const rerank = this.timings.rerank || 0;
    const generation = this.timings.generation || 0;

    // Enforce total_ms >= sum of sequential stages where applicable
    const sumSequential = (stt ?? 0) + normalization + embedding + retrieval + rerank + generation;
    const total = parseFloat(Math.max(totalDuration, sumSequential).toFixed(2));
    
    return {
      stt,
      normalization,
      embedding,
      retrieval,
      rerank,
      generation,
      total
    };
  }
}

