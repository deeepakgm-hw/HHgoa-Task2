import { useState } from 'react';

interface StageSpec {
  step: string;
  name: string;
  category: 'CLIENT' | 'REMOTE API' | 'LOCAL IN-MEMORY' | 'GUARD' | 'DELIVERY';
  technology: string;
  latency: string;
  description: string;
  details: string[];
  color: string;
}

export default function ArchitectureView() {
  const [selectedStageIndex, setSelectedStageIndex] = useState(4); // Default to Hybrid Retrieval

  const stages: StageSpec[] = [
    {
      step: '01',
      name: 'Voice Audio Capture',
      category: 'CLIENT',
      technology: 'HTML5 MediaRecorder & Web Audio API',
      latency: 'Continuous stream (16kHz / 48kHz)',
      description: 'Captures spoken queries in Hindi, Kannada, Tamil, Telugu, and English via MediaRecorder in audio/webm or audio/wav chunks with real-time FFT waveform tracking.',
      details: [
        'Dynamic 20s recording maximum with manual user finish',
        'Real-time Web Audio API FFT volume extraction driving 3D Orb',
        'Direct multi-format buffer streaming without client transcoding'
      ],
      color: '#38bdf8'
    },
    {
      step: '02',
      name: 'Speech-to-Text Transcription',
      category: 'REMOTE API',
      technology: 'Sarvam AI Saaras v3 Model',
      latency: '~1.8s P50',
      description: 'Translates spoken Indic audio into verified Unicode transcript text across 5 Indian languages with native handling of regional accents and code-mixed inputs.',
      details: [
        'Dedicated Indic model saaras:v3',
        'Automatic language detection and script mapping',
        'Seamless fallback to text input if audio is bypassed'
      ],
      color: '#06b6d4'
    },
    {
      step: '03',
      name: 'Query Normalization & Gate',
      category: 'GUARD',
      technology: 'Unicode Sanitizer & 3-Char Barrier',
      latency: '< 0.2ms',
      description: 'Sanitizes Unicode diacritics, normalizes Devanagari/Kannada/Tamil/Telugu character sequences, strips malformed control tokens, and screens for harmful weapon/exploit instructions.',
      details: [
        'Stage 1 Harmful Content Screening regex engine',
        'Minimum substantive length guardrail (rejects < 3 chars)',
        'Zero-allocation in-memory string pipeline'
      ],
      color: '#a855f7'
    },
    {
      step: '04',
      name: 'Dense Vector Embedding',
      category: 'LOCAL IN-MEMORY',
      technology: 'gemini-embedding-2 (3072 dims) + SHA-256 Cache',
      latency: '~280ms (uncached) / <0.1ms (cached)',
      description: 'Generates unit-normalized 3072-dimensional embedding representations for semantic matching with persistent disk caching.',
      details: [
        '3072-dimensional vector space',
        'L2 unit normalization for exact dot-product cosine similarity',
        'SHA-256 query cache eliminating redundant network requests'
      ],
      color: '#6366f1'
    },
    {
      step: '05',
      name: 'Multilingual Hybrid Retrieval',
      category: 'LOCAL IN-MEMORY',
      technology: 'Dense Cosine + Multilingual BM25 Lexical',
      latency: '~8.4ms P50 (3,381 Chunks)',
      description: 'Executes fused hybrid search across 3,381 MSMARCO-XI chunks. Combines dense vector cosine similarity (0.75 weight) with multilingual BM25 exact keyword matching (0.25 weight).',
      details: [
        'Indexed corpus: 3,381 chunks across 5 languages (EN, HI, KN, TA, TE)',
        '4 chunking strategies: FixedSize, SentenceAware, Semantic, MetadataAware',
        'Strict language partitioning eliminating cross-language pollution'
      ],
      color: '#10b981'
    },
    {
      step: '06',
      name: 'Proximity & Phrase Reranking',
      category: 'LOCAL IN-MEMORY',
      technology: 'N-gram Distance & Exact Substring Scorer',
      latency: '~1.8ms P50',
      description: 'Re-scores candidate passages based on query bigram proximity, exact phrase presence, and title term overlaps to surface the highest-precision evidence into Top-1.',
      details: [
        'Proximity bonus for consecutive matched terms',
        'Gold passage metadata awareness',
        'Score re-normalization preserving calibrated threshold'
      ],
      color: '#34d399'
    },
    {
      step: '07',
      name: 'Confidence & Grounding Guardrails',
      category: 'GUARD',
      technology: 'Calibrated Gate (0.35) + Entity Coverage Audit',
      latency: '< 0.4ms',
      description: 'Audits retrieved evidence against the 0.35 relevance threshold and verifies that core query entity terms exist in passages. If relevance is insufficient, Gemini generation is bypassed to prevent hallucination.',
      details: [
        'Calibrated 0.35 confidence threshold',
        'Stage 2 Entity Coverage Check: requires matched content words for multi-word queries',
        'Refusal triggered safely with zero fabricated citations'
      ],
      color: '#f59e0b'
    },
    {
      step: '08',
      name: 'Grounded LLM Generation',
      category: 'REMOTE API',
      technology: 'Gemini 2.5 Flash (Strict Zero-External-Knowledge)',
      latency: '~3.1s P50',
      description: 'Synthesizes a direct, concise response in the query language using ONLY facts written in the retrieved MSMARCO-XI passages. Prompt strictly forbids external knowledge.',
      details: [
        'System prompt enforces zero outside assumptions',
        'Exact citation tag insertion ([Source 1], [Source 2])',
        'Automatic rate-limit and timeout resilience with offline grounded fallback'
      ],
      color: '#f97316'
    },
    {
      step: '09',
      name: 'Evidence Delivery & Telemetry Trace',
      category: 'DELIVERY',
      technology: 'Stage 3 Post-Gen Validator & Full Provenance',
      latency: '< 0.1ms',
      description: 'Verifies that substantive tokens in the generated answer overlap with source passage text (>20% overlap requirement), assigns verified citations, and delivers full provenance telemetry.',
      details: [
        'Stage 3 Post-Generation Grounding Validator',
        'Complete provenance trace: Dataset, Split, DocId, PassageId, Strategy',
        'E2E latency telemetry breakdown (Voice STT, Norm, Embed, Retrieve, Rerank, Gen)'
      ],
      color: '#ec4899'
    }
  ];

  const activeStage = stages[selectedStageIndex];

  return (
    <div className="architecture-view-container" aria-label="RAG Architecture Blueprint">
      {/* ── Cinematic Masthead ── */}
      <section className="arch-hero-masthead">
        <div className="arch-eyebrow">
          <span className="arch-dot" />
          <span>SCIENTIFIC INSTRUMENT BUS</span>
        </div>

        <h1 className="arch-main-title">
          The Decoupled Evidence Engine<br />
          <span className="arch-title-accent">9 verifiable stages from voice to grounded truth.</span>
        </h1>

        <p className="arch-main-desc">
          Click any stage on the bus to inspect its underlying technology, mathematical formulation, and latency telemetry.
        </p>
      </section>

      {/* ── Horizontal Pipeline Bus Tracker ── */}
      <section className="arch-bus-stage-tracker" aria-label="Interactive Pipeline Bus">
        <div className="arch-bus-scroll-track">
          {stages.map((st, idx) => {
            const isSelected = selectedStageIndex === idx;
            return (
              <button
                key={st.step}
                type="button"
                className={`arch-bus-node ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedStageIndex(idx)}
                style={{
                  borderColor: isSelected ? st.color : 'rgba(255,255,255,0.06)'
                }}
              >
                <div className="node-step-header">
                  <span className="node-num" style={{ color: isSelected ? st.color : 'rgba(255,255,255,0.4)' }}>
                    {st.step}
                  </span>
                  <span className="node-badge" style={{ borderColor: isSelected ? st.color : undefined }}>
                    {st.category}
                  </span>
                </div>
                <div className="node-title">{st.name}</div>
                <div className="node-tech">{st.technology.split('(')[0]}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Active Stage Deep-Dive Instrument Card ── */}
      {activeStage && (
        <section className="arch-stage-detail-panel" style={{ borderLeftColor: activeStage.color }}>
          <div className="detail-panel-header">
            <div className="detail-title-group">
              <div className="detail-step-badge" style={{ background: `${activeStage.color}18`, color: activeStage.color, borderColor: activeStage.color }}>
                STAGE {activeStage.step} • {activeStage.category}
              </div>
              <h2 className="detail-stage-name">{activeStage.name}</h2>
              <div className="detail-tech-line">{activeStage.technology}</div>
            </div>

            <div className="detail-latency-badge">
              <span className="latency-label">STAGE LATENCY</span>
              <span className="latency-val" style={{ color: activeStage.color }}>
                {activeStage.latency}
              </span>
            </div>
          </div>

          <p className="detail-description">{activeStage.description}</p>

          <div className="detail-specs-box">
            <div className="specs-box-title">TECHNICAL SPECIFICATIONS &amp; INVARIANTS:</div>
            <ul className="specs-list">
              {activeStage.details.map((d, i) => (
                <li key={i} className="spec-item">
                  <span className="spec-bullet" style={{ background: activeStage.color }} />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
