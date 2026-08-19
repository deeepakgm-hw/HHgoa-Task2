export interface LatencyReport {
  stt: number | null;
  normalization: number;
  embedding: number;
  retrieval: number;
  rerank: number;
  generation: number;
  total: number;
  [key: string]: any;
}

export type TelemetryData = LatencyReport;

export interface SourceDocument {
  id: string;
  passageId?: string | number;
  title?: string;
  text: string;
  passage?: string;
  score: number;
  strategy: 'fixed' | 'sentence' | 'semantic' | 'metadata';
  isSelected?: boolean;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export type ResponseStatus =
  | 'GROUNDED_SUCCESS'
  | 'GEMINI_FALLBACK'
  | 'INSUFFICIENT_CTX'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

export interface QueryResult {
  status: ResponseStatus;
  answer: string;
  disclosure?: string;
  source?: string;
  citations: string[];
  sources: SourceDocument[];
  telemetry: LatencyReport | null;
  transcript?: string;
  reason?: string;
  httpStatus?: number;
  timestamp?: string;
}

export interface PercentileStat {
  p50: number;
  p70?: number;
  p100?: number;
  n?: number;
}

export interface BenchmarkReport {
  timestamp: string;
  benchmarkMode: string;
  datasetProvenance?: {
    fullDatasetSource?: string;
    chunkCount?: number;
    queryCount?: number;
    passageCount?: number;
  };
  stagePercentiles: {
    embedding?: PercentileStat;
    retrieval?: PercentileStat;
    reranking?: PercentileStat;
    total?: PercentileStat;
    [key: string]: any;
  };
  liveTextBenchmark?: {
    insufficient?: boolean;
    sampleSize?: number;
    successful?: number;
    refused?: number;
    rateLimited?: number;
    timestamp?: string;
    stagePercentiles?: {
      embedding?: PercentileStat;
      retrievalOnly?: PercentileStat;
      rerankOnly?: PercentileStat;
      localRagCombined?: PercentileStat;
      generation?: PercentileStat;
      total?: PercentileStat;
      [key: string]: any;
    };
  };
  voiceBenchmark?: {
    insufficientData?: boolean;
    stagePercentiles?: {
      stt?: PercentileStat;
      total?: PercentileStat;
      [key: string]: any;
    };
    verifiedPreGenPercentiles?: {
      stt?: PercentileStat;
      [key: string]: any;
    };
  };
  retrievalQuality?: Record<string, Record<number, number>>;
}
