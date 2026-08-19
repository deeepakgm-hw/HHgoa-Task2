import { useState } from 'react';

interface StageDetails {
  title: string;
  subtitle: string;
  badge: string;
  desc: string;
  specs: string[];
}

const architectureStages: Record<string, StageDetails> = {
  microphone: {
    title: "1. Microphone Input",
    subtitle: "Browser Audio Capture",
    badge: "CLIENT-SIDE",
    desc: "Captures user speech via HTML5 MediaRecorder in lightweight WebM/WAV audio streams with real-time waveform visualization.",
    specs: ["16kHz/48kHz Audio Stream", "15s Dynamic Capture Cap", "Real-time FFT Waveform"]
  },
  stt: {
    title: "2. Sarvam Speech-To-Text",
    subtitle: "Saaras v3 Indic Model",
    badge: "REMOTE API",
    desc: "Transcribes spoken Indic speech into Devanagari text with native support for code-mixed Hinglish and regional dialects.",
    specs: ["Model: saaras:v3", "Language: hi-IN (Devanagari)", "Avg Latency: ~1.8s"]
  },
  normalize: {
    title: "3. Query Normalization",
    subtitle: "Input Sanitation & Gate",
    badge: "LOCAL",
    desc: "Sanitizes punctuation, normalizes Devanagari Unicode sequences, and enforces length guardrails to prevent empty token consumption.",
    specs: ["Devanagari Normalization", "Min 3-char Guardrail", "Latency: < 1ms"]
  },
  embedding: {
    title: "4. Text Embedding",
    subtitle: "multilingual-e5-small (ONNX)",
    badge: "LOCAL IN-PROCESS",
    desc: "Encodes normalized text into a 384-dimensional dense semantic vector space using a local multilingual transformer model on CPU with zero external API calls or rate limits.",
    specs: ["Model: Xenova/multilingual-e5-small", "Dimensions: 384 (Float32)", "In-Process ONNX Inference"]
  },
  search: {
    title: "5. Hybrid Search Fused",
    subtitle: "Dense Vector + Lexical Index",
    badge: "LOCAL IN-MEMORY",
    desc: "Combines dense cosine similarity retrieval with lexical keyword overlap to maximize recall across diverse query phrasing.",
    specs: ["Dense Cosine Dot-Product", "Lexical Token Overlap", "Configurable Hybrid Alpha"]
  },
  rerank: {
    title: "6. Proximity Reranking",
    subtitle: "Bigram Distance Re-scoring",
    badge: "LOCAL",
    desc: "Boosts passages containing exact phrase sequences and contiguous n-grams from the user's inquiry, improving Top-1 relevance.",
    specs: ["Bigram Distance Scoring", "Exact Substring Boost", "Latency: < 0.1ms"]
  },
  guardrails: {
    title: "7. Confidence Guardrails",
    subtitle: "Score Boundary & Grounding Verifier",
    badge: "LOCAL GATEWAY",
    desc: "Audits retrieval confidence against a calibrated relevance threshold (0.60). Automatically triggers structured refusal and bypasses LLM generation if context is insufficient.",
    specs: ["Threshold: 0.60", "Anti-Hallucination Barrier", "Automated Safe Refusal"]
  },
  gemini: {
    title: "8. Gemini Generation",
    subtitle: "Gemini Flash Model",
    badge: "REMOTE LLM",
    desc: "Synthesizes concise, authoritative answers strictly constrained by the retrieved context passages, rejecting out-of-domain speculation.",
    specs: ["Model: gemini-flash-latest", "Strict Context Grounding", "Temperature: 0.2"]
  },
  answer: {
    title: "9. Grounded Answer & Citations",
    subtitle: "Fact-Checked Delivery",
    badge: "DELIVERY",
    desc: "Delivers the grounded answer alongside verifiable passage citations mapped directly to source document IDs from MSMARCO-XI.",
    specs: ["Verifiable Source Chips", "Zero Fabricated Citations", "Complete Telemetry Trace"]
  }
};

export default function ArchitectureDiagram() {
  const [activeStage, setActiveStage] = useState<string>('search');
  const stageKeys = Object.keys(architectureStages);

  return (
    <div className="ledger-entry-card" style={{ padding: '2rem' }} aria-label="RAG Architecture Blueprint">
      
      {/* Masthead */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <span className="badge-pill brass">SYSTEM BUS</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
              AUDIO → TRANSCRIPTION → EMBEDDING → HYBRID SEARCH → RERANK → GROUNDED SYNTHESIS
            </span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Precision Pipeline Flow Bus
          </h2>
        </div>
        <span className="badge-pill teal" style={{ fontFamily: 'var(--font-mono)' }}>
          Hacker House Goa 2026
        </span>
      </div>

      <p style={{ color: 'var(--ink-secondary)', fontSize: '0.92rem', maxWidth: '720px', lineHeight: '1.6', marginBottom: '2rem' }}>
        A decoupled, high-performance RAG pipeline engineered for low-latency Indic speech recognition, sub-3ms local hybrid retrieval across MSMARCO-XI, and strictly grounded Gemini generation.
      </p>

      {/* ── Single Continuous Horizontal Pipeline Bus ── */}
      <div className="instrument-bus-container">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Interconnected Stage Bus (Click stage to inspect telemetry parameters)
        </div>

        <div className="bus-continuous-line">
          {stageKeys.map((key, index) => {
            const info = architectureStages[key];
            const isSelected = activeStage === key;
            return (
              <div 
                key={key}
                className="bus-stage-block"
                onClick={() => setActiveStage(key)}
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--grounded)' : 'var(--structural-faint)',
                  background: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                  boxShadow: isSelected ? '0 0 16px var(--grounded-glow)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: isSelected ? 'var(--grounded)' : 'var(--ink-muted)' }}>
                    0{index + 1}
                  </span>
                  <span className={`badge-pill ${isSelected ? 'brass' : 'structural'}`} style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>
                    {info.badge}
                  </span>
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: isSelected ? 'var(--ink)' : 'var(--ink-secondary)', marginBottom: '0.2rem' }}>
                  {info.title.replace(/^\d+\.\s*/, '')}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{info.subtitle}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Node Technical Specs Breakdown */}
      {activeStage && architectureStages[activeStage] && (
        <div style={{ 
          marginTop: '2rem',
          background: 'var(--bg-input)', 
          border: '1px solid var(--structural)', 
          borderRadius: 'var(--radius-xs)', 
          padding: '1.5rem 1.75rem' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.85rem' }}>
            <div>
              <span className="badge-pill brass" style={{ marginBottom: '0.35rem' }}>
                STAGE SPECIFICATIONS · {architectureStages[activeStage].badge}
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink)' }}>
                {architectureStages[activeStage].title}
              </h3>
            </div>
          </div>

          <p style={{ color: 'var(--ink-secondary)', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '1.25rem' }}>
            {architectureStages[activeStage].desc}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {architectureStages[activeStage].specs.map((spec, i) => (
              <div key={i} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--structural-faint)',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: 'var(--grounded)'
              }}>
                ✓ {spec}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
