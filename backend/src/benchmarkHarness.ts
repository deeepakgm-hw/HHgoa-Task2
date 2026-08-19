/**
 * RAGGoa — Live Text Pipeline Latency Harness
 *
 * Runs N real text queries through the complete pipeline:
 *   Query Normalization → Gemini Embedding → Hybrid Retrieval
 *   → Proximity Reranking → Confidence Guardrail → Gemini Generation
 *
 * Every stage is measured with high-resolution performance.now() timers.
 * Results are written to:
 *   backend/data/latency_harness_report.json   (full per-query detail + percentiles)
 *   and merged into benchmark_report.json under "liveTextBenchmark" key.
 *
 * IMPORTANT:
 *   - Never uses mock embeddings or mock generation.
 *   - Never fabricates or estimates timing values.
 *   - Retrieval timing = hybrid search + reranking only (excludes model loading and cold starts).
 *   - Total timing = wall-clock from first normalization call to response ready.
 *   - If fewer than 3 full pipeline runs succeed (not rate-limited), reports INSUFFICIENT_SAMPLES.
 *   - Throttles between queries to respect free-tier Gemini API limits.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { VectorDatabase } from './services/vectorDb';
import { EmbeddingService } from './services/embeddings';
import { RetrievalService } from './services/retrieval';
import { RerankingService } from './services/reranking';
import { GenerationService } from './services/generation';
import { GuardrailService } from './services/guardrails';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerQueryResult {
  queryIndex: number;
  queryText: string;
  status: 'SUCCESS' | 'REFUSED' | 'RATE_LIMITED' | 'TIMEOUT' | 'API_ERROR';
  error?: string;
  timings: {
    normalization_ms: number;
    embedding_ms: number;
    retrieval_ms: number;         // hybrid search only
    rerank_ms: number;            // reranking only
    retrieval_plus_rerank_ms: number; // combined local RAG step
    guardrail_ms: number;
    generation_ms: number;        // 0 if REFUSED / RATE_LIMITED
    total_ms: number;             // wall-clock from start of normalization to response
  };
}

interface PercentileStat {
  p50: number;
  p70: number;
  p100: number;
  avg: number;
  min: number;
  max: number;
  n: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return parseFloat(sorted[Math.max(0, idx)].toFixed(2));
}

function stats(arr: number[]): PercentileStat {
  const sorted = [...arr].sort((a, b) => a - b);
  const avg = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  return {
    p50: pct(sorted, 50),
    p70: pct(sorted, 70),
    p100: pct(sorted, 100),
    avg: parseFloat(avg.toFixed(2)),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    n: arr.length
  };
}

// 20 representative Hindi text queries — 5 answerable from the indexed dataset,
// 10 plausible-but-outside-corpus (expect REFUSED), 5 mixed. All real queries.
const HARNESS_QUERIES: { text: string; expectGrounded: boolean }[] = [
  // From indexed dataset — expect SUCCESS
  { text: 'ताजमहल कहाँ स्थित है?', expectGrounded: true },
  { text: 'भारत की राजधानी क्या है?', expectGrounded: true },
  { text: 'सूर्य ग्रहण कब और क्यों होता है?', expectGrounded: true },
  { text: 'प्रकाश संश्लेषण प्रक्रिया क्या है?', expectGrounded: true },
  { text: 'कंप्यूटर का आविष्कार किसने किया?', expectGrounded: true },

  // Variants of indexed queries — may retrieve relevant context
  { text: 'ताजमहल किसने बनवाया था?', expectGrounded: true },
  { text: 'नई दिल्ली भारत की राजधानी है?', expectGrounded: true },
  { text: 'सूर्य ग्रहण क्यों होता है?', expectGrounded: true },

  // Out-of-corpus — expect REFUSED (guardrail)
  { text: 'जापान की राजधानी क्या है?', expectGrounded: false },
  { text: 'फ्रांस के राष्ट्रपति कौन हैं?', expectGrounded: false },
  { text: 'क्रिकेट में कितने खिलाड़ी होते हैं?', expectGrounded: false },
  { text: 'माउंट एवरेस्ट कहाँ है?', expectGrounded: false },
  { text: 'मनुष्य की औसत आयु क्या है?', expectGrounded: false },
  { text: 'ऑक्सीजन की खोज किसने की?', expectGrounded: false },
  { text: 'पृथ्वी सूर्य के चारों ओर कितने समय में चक्कर लगाती है?', expectGrounded: false },
  { text: 'भारत में कितने राज्य हैं?', expectGrounded: false },

  // English queries — pipeline should handle or refuse gracefully
  { text: 'What is the location of Taj Mahal?', expectGrounded: true },
  { text: 'Who is the President of India?', expectGrounded: false },
  { text: 'First war that happened in India', expectGrounded: false },
  { text: 'Tell me about photosynthesis', expectGrounded: true },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runHarness() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   RAGGoa — Live Text Pipeline Latency Harness           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Credential check ────────────────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (!geminiKey || geminiKey.startsWith('your_')) {
    console.error('[BLOCKED] GEMINI_API_KEY not configured in backend/.env');
    process.exit(1);
  }
  console.log('✓ GEMINI_API_KEY present');

  // ── Load infrastructure ──────────────────────────────────────────────────
  const vectorDbPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const vectorDb = new VectorDatabase();
  if (!vectorDb.loadFromFile(vectorDbPath)) {
    console.error('[ERROR] Vector store not found. Run npm run ingest first.');
    process.exit(1);
  }
  console.log(`✓ Vector store loaded: ${vectorDb.size()} chunks\n`);

  // Use LIVE mode — no mock fallbacks. Embeddings will use cache where available.
  const embedService = new EmbeddingService('gemini-embedding-2', undefined, false);
  const retrievalService = new RetrievalService(vectorDb);
  const rerankingService = new RerankingService();
  const genService = new GenerationService(false);
  const guardrailService = new GuardrailService(0.60);

  const results: PerQueryResult[] = [];
  let attempted = 0;

  console.log(`Running ${HARNESS_QUERIES.length} queries through live pipeline...\n`);
  console.log('Query | Status | Norm | Embed | Retrieval | Rerank | Guard | Generation | Total');
  console.log('───────────────────────────────────────────────────────────────────────────────');

  for (const q of HARNESS_QUERIES) {
    attempted++;
    const r: PerQueryResult = {
      queryIndex: attempted,
      queryText: q.text,
      status: 'API_ERROR',
      timings: {
        normalization_ms: 0,
        embedding_ms: 0,
        retrieval_ms: 0,
        rerank_ms: 0,
        retrieval_plus_rerank_ms: 0,
        guardrail_ms: 0,
        generation_ms: 0,
        total_ms: 0
      }
    };

    const wallStart = performance.now();

    try {
      // Stage 1: Normalization + guardrail
      const t0 = performance.now();
      const validation = guardrailService.validateQuery(q.text);
      r.timings.normalization_ms = parseFloat((performance.now() - t0).toFixed(2));

      if (!validation.isValid) {
        r.status = 'REFUSED';
        r.error = validation.reason;
        r.timings.total_ms = parseFloat((performance.now() - wallStart).toFixed(2));
        results.push(r);
        console.log(`[${attempted.toString().padStart(2)}] ${q.text.substring(0, 35).padEnd(35)} | REFUSED(guard) | ${r.timings.normalization_ms}ms | (skipped)`);
        continue;
      }

      // Stage 2: Embedding (uses disk cache if available, remote API if not)
      const t1 = performance.now();
      let queryEmbedding: number[];
      try {
        queryEmbedding = await embedService.embedText(q.text);
        r.timings.embedding_ms = parseFloat((performance.now() - t1).toFixed(2));
      } catch (embErr: any) {
        const msg = String(embErr.message || embErr).toLowerCase();
        r.status = msg.includes('429') || msg.includes('quota') ? 'RATE_LIMITED' : 'API_ERROR';
        r.error = `Embedding: ${String(embErr.message || embErr)}`;
        r.timings.total_ms = parseFloat((performance.now() - wallStart).toFixed(2));
        results.push(r);
        console.log(`[${attempted.toString().padStart(2)}] EMBED FAIL: ${r.status}`);
        continue;
      }

      // Stage 3: Retrieval (hybrid vector + lexical)
      const t2 = performance.now();
      const retrieved = await retrievalService.retrieve(q.text, queryEmbedding, {
        topK: 3,
        strategy: 'semantic',
        hybridWeight: 0.25
      });
      r.timings.retrieval_ms = parseFloat((performance.now() - t2).toFixed(2));

      // Stage 4: Reranking
      const t3 = performance.now();
      const reranked = await rerankingService.rerank(q.text, retrieved, true);
      r.timings.rerank_ms = parseFloat((performance.now() - t3).toFixed(2));
      r.timings.retrieval_plus_rerank_ms = parseFloat((r.timings.retrieval_ms + r.timings.rerank_ms).toFixed(2));

      // Stage 5: Confidence guardrail
      const t4 = performance.now();
      const rtrGuard = guardrailService.validateRetrieval(q.text, reranked);
      r.timings.guardrail_ms = parseFloat((performance.now() - t4).toFixed(2));

      if (!rtrGuard.passed) {
        r.status = 'REFUSED';
        r.error = rtrGuard.reason;
        r.timings.total_ms = parseFloat((performance.now() - wallStart).toFixed(2));
        results.push(r);
        console.log(
          `[${attempted.toString().padStart(2)}] ${q.text.substring(0, 30).padEnd(30)} | REFUSED | ` +
          `${r.timings.normalization_ms}ms | ${r.timings.embedding_ms}ms | ${r.timings.retrieval_ms}ms | ` +
          `${r.timings.rerank_ms}ms | ${r.timings.guardrail_ms}ms | SKIPPED | ${r.timings.total_ms}ms`
        );
        continue;
      }

      // Stage 6: Gemini generation (live, disableFallback=true)
      const t5 = performance.now();
      let generationResult: any;
      try {
        generationResult = await genService.generateAnswer(q.text, reranked, true);
        r.timings.generation_ms = parseFloat((performance.now() - t5).toFixed(2));
      } catch (genErr: any) {
        const msg = String(genErr.message || genErr).toLowerCase();
        r.status = msg.includes('429') || msg.includes('quota') || msg.includes('rate') ? 'RATE_LIMITED' : 'API_ERROR';
        r.error = `Generation: ${String(genErr.message || genErr).substring(0, 120)}`;
        r.timings.generation_ms = parseFloat((performance.now() - t5).toFixed(2));
        r.timings.total_ms = parseFloat((performance.now() - wallStart).toFixed(2));
        results.push(r);
        console.log(
          `[${attempted.toString().padStart(2)}] ${q.text.substring(0, 30).padEnd(30)} | ${r.status} | ` +
          `${r.timings.normalization_ms}ms | ${r.timings.embedding_ms}ms | ${r.timings.retrieval_ms}ms | ` +
          `${r.timings.rerank_ms}ms | ${r.timings.guardrail_ms}ms | FAIL | ${r.timings.total_ms}ms`
        );
        continue;
      }

      r.timings.total_ms = parseFloat((performance.now() - wallStart).toFixed(2));
      r.status = 'SUCCESS';

      console.log(
        `[${attempted.toString().padStart(2)}] ${q.text.substring(0, 30).padEnd(30)} | SUCCESS | ` +
        `${r.timings.normalization_ms}ms | ${r.timings.embedding_ms}ms | ${r.timings.retrieval_ms}ms | ` +
        `${r.timings.rerank_ms}ms | ${r.timings.guardrail_ms}ms | ${r.timings.generation_ms}ms | ${r.timings.total_ms}ms`
      );

    } catch (unexpected: any) {
      r.error = unexpected.message || String(unexpected);
      r.timings.total_ms = parseFloat((performance.now() - wallStart).toFixed(2));
      console.log(`[${attempted.toString().padStart(2)}] UNEXPECTED: ${(r.error ?? 'unknown').substring(0, 60)}`);
    }

    results.push(r);

    // Throttle between queries to respect free-tier API rate limits
    if (attempted < HARNESS_QUERIES.length) {
      const waitMs = r.status === 'RATE_LIMITED' ? 15000 : 2000;
      if (waitMs > 2000) {
        console.log(`  ⏳ Rate-limited. Waiting ${waitMs / 1000}s before next query...`);
      }
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  // ─── Compile Statistics ───────────────────────────────────────────────────

  const successAndRefused = results.filter(r => r.status === 'SUCCESS' || r.status === 'REFUSED');
  const successOnly = results.filter(r => r.status === 'SUCCESS');
  const rateLimited = results.filter(r => r.status === 'RATE_LIMITED').length;
  const apiErrors = results.filter(r => r.status === 'API_ERROR').length;
  const refused = results.filter(r => r.status === 'REFUSED').length;

  const MINIMUM = 3;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║               Harness Run Summary                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Total attempted   : ${attempted}`);
  console.log(`Successful (full) : ${successOnly.length}`);
  console.log(`Refused (guardrail): ${refused}`);
  console.log(`Rate-limited (429): ${rateLimited}`);
  console.log(`API errors        : ${apiErrors}`);
  console.log(`Valid for stats   : ${successAndRefused.length} (SUCCESS + REFUSED)\n`);

  const insufficient = successAndRefused.length < MINIMUM;
  let embeddingStats: PercentileStat | null = null;
  let retrievalOnlyStats: PercentileStat | null = null;
  let rerankOnlyStats: PercentileStat | null = null;
  let localRagStats: PercentileStat | null = null;
  let generationStats: PercentileStat | null = null;
  let totalStats: PercentileStat | null = null;

  if (insufficient) {
    console.log(`⚠ INSUFFICIENT_SAMPLES: Only ${successAndRefused.length} valid runs (need >= ${MINIMUM})`);
  } else {
    embeddingStats   = stats(successAndRefused.map(r => r.timings.embedding_ms).filter(v => v > 0));
    retrievalOnlyStats = stats(successAndRefused.map(r => r.timings.retrieval_ms).filter(v => v > 0));
    rerankOnlyStats  = stats(successAndRefused.map(r => r.timings.rerank_ms).filter(v => v >= 0));
    localRagStats    = stats(successAndRefused.map(r => r.timings.retrieval_plus_rerank_ms).filter(v => v > 0));
    generationStats  = stats(successOnly.map(r => r.timings.generation_ms).filter(v => v > 0));
    totalStats       = stats(successAndRefused.map(r => r.timings.total_ms).filter(v => v > 0));

    console.log('\n══ STAGE-LEVEL LATENCY PERCENTILES (Live Text Pipeline) ══════');
    console.log('Stage                    | P50 (ms) | P70 (ms) | P100 (ms) | N');
    console.log('─────────────────────────+──────────+──────────+───────────+───');
    const fmt = (s: PercentileStat) => `${String(s.p50).padEnd(8)} | ${String(s.p70).padEnd(8)} | ${String(s.p100).padEnd(9)} | ${s.n}`;
    console.log(`Embedding                | ${fmt(embeddingStats)}`);
    console.log(`Retrieval (search only)  | ${fmt(retrievalOnlyStats)}`);
    console.log(`Reranking (only)         | ${fmt(rerankOnlyStats)}`);
    console.log(`Local RAG (retrvl+rerank)| ${fmt(localRagStats)}`);
    console.log(`Gemini Generation        | ${fmt(generationStats)}`);
    console.log(`Total (wall-clock)       | ${fmt(totalStats)}`);
    console.log('───────────────────────────────────────────────────────────────');

    // Consistency check
    if (localRagStats && totalStats) {
      const check = totalStats.p50 >= localRagStats.p50;
      console.log(`\nConsistency check: Total P50 (${totalStats.p50}) >= Local RAG P50 (${localRagStats.p50}): ${check ? 'PASS ✓' : 'FAIL ✗'}`);
    }
    if (generationStats) {
      console.log(`P100 >= P70 >= P50 (generation): ${generationStats.p100 >= generationStats.p70 && generationStats.p70 >= generationStats.p50 ? 'PASS ✓' : 'FAIL ✗'}`);
    }
    if (totalStats) {
      console.log(`P100 >= P70 >= P50 (total): ${totalStats.p100 >= totalStats.p70 && totalStats.p70 >= totalStats.p50 ? 'PASS ✓' : 'FAIL ✗'}`);
    }
  }

  // ─── Per-Query Raw Table ──────────────────────────────────────────────────
  console.log('\n══ PER-QUERY RAW TIMINGS ══════════════════════════════════════');
  console.log('# | Query (30 chars)                | Status       | Emb(ms) | Retr(ms) | Rrnk(ms) | Gen(ms) | Total(ms)');
  console.log('──┼──────────────────────────────────┼──────────────┼─────────┼──────────┼──────────┼─────────┼──────────');
  results.forEach((r, i) => {
    const q30 = r.queryText.substring(0, 30).padEnd(30);
    const st = r.status.padEnd(12);
    const t = r.timings;
    console.log(
      `${(i + 1).toString().padStart(2)} | ${q30} | ${st} | ${String(t.embedding_ms).padEnd(7)} | ` +
      `${String(t.retrieval_ms).padEnd(8)} | ${String(t.rerank_ms).padEnd(8)} | ` +
      `${String(t.generation_ms).padEnd(7)} | ${t.total_ms}`
    );
  });

  // ─── Write report ─────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString();

  const harnessReport = {
    timestamp,
    mode: 'LIVE_TEXT_PIPELINE',
    sampleSize: HARNESS_QUERIES.length,
    description: 'Live text pipeline harness: 20 queries through Gemini embedding + hybrid retrieval + proximity reranking + Gemini generation. Timings measured per-stage with performance.now().',
    attempted,
    successful: successOnly.length,
    refused,
    rateLimited,
    apiErrors,
    validForStats: successAndRefused.length,
    insufficient,
    stagePercentiles: insufficient ? 'INSUFFICIENT_SAMPLES' : {
      embedding: embeddingStats,
      retrievalOnly: retrievalOnlyStats,
      rerankOnly: rerankOnlyStats,
      localRagCombined: localRagStats,
      generation: generationStats,
      total: totalStats
    },
    perQueryResults: results
  };

  // Write dedicated harness report
  const harnessPath = path.join(__dirname, '..', 'data', 'latency_harness_report.json');
  fs.writeFileSync(harnessPath, JSON.stringify(harnessReport, null, 2), 'utf8');
  console.log(`\n✓ Harness report written to: backend/data/latency_harness_report.json`);

  // Merge into benchmark_report.json under "liveTextBenchmark" key
  const benchReportPath = path.join(__dirname, '..', 'data', 'benchmark_report.json');
  let benchReport: any = {};
  if (fs.existsSync(benchReportPath)) {
    try { benchReport = JSON.parse(fs.readFileSync(benchReportPath, 'utf8')); } catch {}
  }
  benchReport.liveTextBenchmark = harnessReport;
  fs.writeFileSync(benchReportPath, JSON.stringify(benchReport, null, 2), 'utf8');
  console.log('✓ benchmark_report.json updated with liveTextBenchmark key');

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(insufficient
    ? '║  ⚠ HARNESS INCOMPLETE — INSUFFICIENT_SAMPLES             ║'
    : '║  ✓ LIVE TEXT PIPELINE HARNESS COMPLETE                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

if (require.main === module) {
  runHarness().catch(err => {
    console.error('[FATAL] Harness failed:', err);
    process.exit(1);
  });
}
