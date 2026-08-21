import * as dotenv from 'dotenv';
dotenv.config();

import * as path from 'path';
import * as fs from 'fs';
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { VectorDatabase } from './services/vectorDb';
import { EmbeddingService } from './services/embeddings';
import { RetrievalService } from './services/retrieval';
import { RerankingService } from './services/reranking';
import { GenerationService } from './services/generation';
import { GuardrailService } from './services/guardrails';
import { SttService } from './services/stt';
import { TtsService } from './services/tts';
import { RagPipeline, TechnicalDebugInfo } from './services/ragPipeline';
import { Logger } from './utils/logger';

const app = express();

// Whitelist CORS origins configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    const isAllowed = allowedOrigins.indexOf(origin) !== -1 || isLocal;
    if (!isAllowed && process.env.NODE_ENV === 'production') {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());

// Simple IP-based Rate Limiter to protect public endpoints
const requestCounts = new Map<string, { count: number, resetTime: number }>();
const rateLimiter = (req: express.Request, res: express.Response, next: any) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limit = parseInt(process.env.MAX_REQUESTS_PER_WINDOW || '30'); // 30 requests per minute
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'); // 1 minute window

  const now = Date.now();
  const clientData = requestCounts.get(ip);

  if (!clientData || now > clientData.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  clientData.count++;
  if (clientData.count > limit) {
    return res.status(429).json({
      error: "Too many requests. Please wait a minute before querying again."
    });
  }

  next();
};

app.use('/api/', rateLimiter);

// Set up memory storage with size and MIME validation for multipart uploads (voice clips)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB audio cap
  },
  fileFilter: (req, file, callback) => {
    const allowedMimeTypes = [
      'audio/wav', 'audio/webm', 'audio/mpeg', 'audio/x-wav', 
      'audio/ogg', 'audio/flac', 'audio/mp3', 'application/octet-stream'
    ];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = ['.wav', '.webm', '.mp3', '.flac', '.ogg'];

    if (allowedMimeTypes.includes(file.mimetype.toLowerCase()) || allowedExtensions.includes(ext)) {
      return callback(null, true);
    }
    callback(new Error(`Invalid audio file format (mimetype: ${file.mimetype}, ext: ${ext}). Only WAV, WEBM, MP3, FLAC, and OGG are accepted.`));
  }
});

// Initialize database
const vectorDb = new VectorDatabase();
const vectorDbPath = path.join(__dirname, '..', 'data', 'vector_store.json');

// We will load the database asynchronously before starting the server

// Instantiate services
const embedService = new EmbeddingService();
const retrievalService = new RetrievalService(vectorDb);
const rerankingService = new RerankingService();
const genService = new GenerationService();
const guardrailService = new GuardrailService(parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.08'));
const sttService = new SttService();
const ttsService = new TtsService();

// Instantiate decoupled RAG pipeline
const ragPipeline = new RagPipeline(
  sttService,
  embedService,
  retrievalService,
  rerankingService,
  genService,
  guardrailService
);

/**
 * Health check endpoint showing system readiness.
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    dataset: {
      name: 'ai4bharat/MSMARCO-XI',
      source: 'Hugging Face Dataset Server',
      mode: 'remote-source-local-index',
      languages: [
        'English',
        'Hindi',
        'Kannada',
        'Tamil',
        'Telugu'
      ],
      split: 'validation',
      indexedPassages: 500,
      indexedChunks: vectorDb.size()
    },
    database: {
      loaded: vectorDb.size() > 0,
      size: vectorDb.size(),
      languages: vectorDb.getLanguageCounts()
    },
    supportedLanguages: ['en', 'hi', 'kn', 'ta', 'te'],
    services: {
      rag: vectorDb.size() > 0 ? "active" : "inactive",
      vectorStore: `in-memory (chunks: ${vectorDb.size()})`,
      stt: 'sarvam-saaras-v3',
      generation: process.env.GEMINI_GENERATION_MODEL || 'gemini-flash-latest',
      isLive: Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('your_'))
    },
    runtimeHfDependency: false,
    fullDatasetDownloaded: false,
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint to retrieve precomputed benchmark statistics.
 */
app.get('/api/benchmark', (req: Request, res: Response) => {
  const reportPath = path.join(__dirname, '..', 'data', 'benchmark_report.json');
  if (fs.existsSync(reportPath)) {
    try {
      const data = fs.readFileSync(reportPath, 'utf8');
      return res.status(200).json(JSON.parse(data));
    } catch (err) {
      return res.status(500).json({ error: "Failed to read benchmark report file" });
    }
  }
  res.status(404).json({ error: "Benchmark report not found. Run npm run benchmark first." });
});

/**
 * Text Query Route
 */
app.post('/api/query', async (req: Request, res: Response) => {
  const requestId = `req_t_${Date.now()}`;
  const { query, strategy, rerank, confidenceThreshold, languageCode } = req.body;

  try {
    const output = await ragPipeline.executeTextQuery(requestId, {
      query,
      strategy,
      rerank,
      confidenceThreshold,
      languageCode
    });

    if (output.status === 'error') {
      const reasonStr = output.reason || '';
      if (
        reasonStr.includes('429') || 
        reasonStr.includes('RATE_LIMITED') || 
        reasonStr.includes('RESOURCE_EXHAUSTED') || 
        reasonStr.includes('quota')
      ) {
        return res.status(429).json({
          status: 'RATE_LIMITED',
          message: "The generation service is temporarily rate limited. Please try again shortly.",
          error: "The generation service is temporarily rate limited. Please try again shortly."
        });
      }
      if (reasonStr.includes('TIMEOUT') || reasonStr.includes('timed out')) {
        return res.status(504).json({
          status: 'TIMEOUT',
          message: "Generation timed out. Please try again.",
          error: "Generation timed out. Please try again."
        });
      }
      return res.status(400).json({
        status: 'error',
        error: output.reason || output.answer,
        message: output.reason || output.answer
      });
    }

    res.status(200).json(output);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const msg = error.message || "Internal server error";
    if (statusCode === 429 || msg.includes('429') || msg.includes('RATE_LIMITED') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        status: 'RATE_LIMITED',
        message: "The generation service is temporarily rate limited. Please try again shortly.",
        error: msg
      });
    }
    res.status(statusCode).json({
      requestId,
      error: msg
    });
  }
});

/**
 * Streaming Text Query Route (SSE)
 */
app.post('/api/query-stream', async (req: Request, res: Response) => {
  const { query, strategy } = req.body;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const queryEmbedding = await embedService.embedText(query);
    const retrieved = await retrievalService.retrieve(query, queryEmbedding, {
      topK: 3,
      strategy: strategy || 'semantic'
    });
    
    const retrievalValidation = guardrailService.validateRetrieval(query, retrieved);
    if (!retrievalValidation.passed) {
      res.write(`data: ${JSON.stringify({ error: "Insufficient context relevance" })}\n\n`);
      res.end();
      return;
    }

    const reranked = await rerankingService.rerank(query, retrieved, true);

    const startTime = performance.now();
    let isFirstToken = true;
    let ttft = 0;

    for await (const chunk of genService.generateAnswerStream(query, reranked)) {
      if (isFirstToken) {
        ttft = parseFloat((performance.now() - startTime).toFixed(2));
        isFirstToken = false;
        res.write(`data: ${JSON.stringify({ ttft })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    const totalMs = parseFloat((performance.now() - startTime).toFixed(2));
    res.write(`data: ${JSON.stringify({ done: true, totalMs })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ error: error.message || "Streaming failed" })}\n\n`);
    res.end();
  }
});

app.post('/api/voice-query', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      Logger.error(`Audio upload failed: ${err.message}`, 'SYSTEM');
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const requestId = `req_v_${Date.now()}`;
  
  if (!req.file) {
    Logger.error(`Audio file missing in voice-query request`, requestId);
    return res.status(400).json({ error: "Missing audio upload file" });
  }

  try {
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname || 'query.webm';
    const strategy = (req.body.strategy as any) || 'semantic';
    const rerank = req.body.rerank !== 'false';
    const languageCode = req.body.languageCode || 'hi-IN';
    const confidenceThreshold = req.body.confidenceThreshold 
      ? parseFloat(req.body.confidenceThreshold) 
      : parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.08');

    const output = await ragPipeline.executeVoiceQuery(requestId, {
      audioBuffer,
      filename,
      strategy,
      rerank,
      languageCode,
      confidenceThreshold
    });

    if (output.status === 'error') {
      const reasonStr = output.reason || '';
      if (
        reasonStr.includes('429') || 
        reasonStr.includes('RATE_LIMITED') || 
        reasonStr.includes('RESOURCE_EXHAUSTED') || 
        reasonStr.includes('quota')
      ) {
        return res.status(429).json({
          status: 'RATE_LIMITED',
          message: "The generation service is temporarily rate limited. Please try again shortly.",
          error: "The generation service is temporarily rate limited. Please try again shortly."
        });
      }
      if (reasonStr.includes('TIMEOUT') || reasonStr.includes('timed out')) {
        return res.status(504).json({
          status: 'TIMEOUT',
          message: "Voice processing timed out. Please try again.",
          error: "Voice processing timed out. Please try again."
        });
      }
    }

    res.status(200).json(output);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const msg = error.message || "Internal server error";
    if (statusCode === 429 || msg.includes('429') || msg.includes('RATE_LIMITED') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        status: 'RATE_LIMITED',
        message: "The generation service is temporarily rate limited. Please try again shortly.",
        error: msg
      });
    }
    res.status(statusCode).json({
      requestId,
      error: msg
    });
  }
});

/**
 * Text-to-Speech Route (Sarvam AI Bulbul Multilingual TTS)
 */
app.post('/api/tts', async (req: Request, res: Response) => {
  const { text, languageCode } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: "Text is required for TTS synthesis." });
  }

  try {
    const audioBase64 = await ttsService.synthesize(text, languageCode || 'hi-IN');
    res.status(200).json({
      status: 'success',
      audio: audioBase64,
      language: languageCode,
      mimeType: 'audio/wav'
    });
  } catch (err: any) {
    console.error(`[TTS Service Error]:`, err.message || err);
    res.status(500).json({
      status: 'error',
      error: err.message || "TTS synthesis failed"
    });
  }
});

// Multi-path resolution to serve compiled React UI across Docker and local environments
const candidateDistPaths = [
  path.join(__dirname, '..', '..', 'frontend', 'dist'),
  path.join(__dirname, '..', 'frontend', 'dist'),
  path.join(process.cwd(), '..', 'frontend', 'dist'),
  path.join(process.cwd(), 'frontend', 'dist'),
  '/app/frontend/dist',
  '/app/backend/frontend/dist'
];

const resolvedDistPath = candidateDistPaths.find(p => fs.existsSync(path.join(p, 'index.html')));

if (resolvedDistPath) {
  app.use(express.static(resolvedDistPath));
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(resolvedDistPath, 'index.html'));
    }
  });
  console.log(`✓ Serving React static frontend from: ${resolvedDistPath}`);
} else {
  console.warn(`[WARN] frontend/dist/index.html not found. Checked candidate paths:`, candidateDistPaths);
  app.get('/', (req: Request, res: Response) => {
    res.send(`<h2>RAGWave API is Running</h2><p>Check API health at <a href="/api/health">/api/health</a></p>`);
  });
}

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`\n=========================================`);
    console.log(`RAGWave server running on http://${HOST}:${PORT}`);
    console.log(`=========================================\n`);
  });

  // Load vector store asynchronously in the background so port binding is instant
  (async () => {
    try {
      console.log("Loading vector store from disk, please wait...");
      const isDbIndexed = await vectorDb.loadFromFileAsync(vectorDbPath);
      if (isDbIndexed) {
        Logger.info(`Successfully loaded vector database index with ${vectorDb.size()} chunks.`);
      } else {
        Logger.warn(`Vector store not found at ${vectorDbPath}. Server starting with empty index!`);
      }
    } catch (err: any) {
      console.error("Error loading vector store:", err.message || err);
    }
  })();
} else {
  vectorDb.loadFromFileAsync(vectorDbPath).catch(console.error);
}

export { app, ragPipeline };
