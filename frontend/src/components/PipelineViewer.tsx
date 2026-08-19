import { useState } from 'react';
import { LatencyReport } from '../types';

interface PipelineViewerProps {
  telemetry: LatencyReport;
}

export default function PipelineViewer({ telemetry }: PipelineViewerProps) {
  const [expanded, setExpanded] = useState(false);

  const isSttExecuted = telemetry.stt !== null && telemetry.stt !== undefined;
  const isSttMocked = isSttExecuted && telemetry.stt === 0;
  const isGenerationSkipped = telemetry.generation === 0 || telemetry.generation === null;

  // Format latency in clean units
  const formatMs = (ms: number) => {
    if (ms < 1) return '<1 ms';
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(1)} ms`;
  };

  const totalFormatted = (telemetry.total >= 1000) 
    ? `${(telemetry.total / 1000).toFixed(2)}s` 
    : `${telemetry.total.toFixed(0)} ms`;

  const stages = [
    {
      num: "01",
      name: "Voice",
      engine: "Sarvam Saaras v3",
      shortDuration: isSttExecuted ? (isSttMocked ? "MOCK" : formatMs(telemetry.stt!)) : "Direct",
      fullDuration: isSttExecuted ? (isSttMocked ? "MOCK" : `${telemetry.stt!.toFixed(1)} ms`) : "Skipped (Direct Text)",
      executed: isSttExecuted,
      detail: isSttExecuted ? "Acoustic transcription of Indic speech waveform" : "Direct Text Query"
    },
    {
      num: "02",
      name: "Understand",
      engine: "Query Normalization",
      shortDuration: formatMs(telemetry.normalization),
      fullDuration: `${telemetry.normalization.toFixed(1)} ms`,
      executed: true,
      detail: "Devanagari Unicode normalization and input boundary verification"
    },
    {
      num: "03",
      name: "Retrieve",
      engine: "Hybrid Search",
      shortDuration: formatMs(telemetry.retrieval),
      fullDuration: `${telemetry.retrieval.toFixed(1)} ms`,
      executed: true,
      detail: "Dense vector cosine similarity combined with lexical keyword matching"
    },
    {
      num: "04",
      name: "Rerank",
      engine: "Bigram Proximity",
      shortDuration: formatMs(telemetry.rerank),
      fullDuration: `${telemetry.rerank.toFixed(1)} ms`,
      executed: true,
      detail: "Passage re-scoring prioritizing contiguous query n-grams"
    },
    {
      num: "05",
      name: "Verify",
      engine: "Confidence Gate",
      shortDuration: "<1 ms",
      fullDuration: "< 0.5 ms",
      executed: true,
      detail: "Confidence score threshold verification (grounding barrier)"
    },
    {
      num: "06",
      name: "Answer",
      engine: "Gemini Flash",
      shortDuration: isGenerationSkipped ? "SKIPPED" : formatMs(telemetry.generation),
      fullDuration: isGenerationSkipped ? "Skipped (Insufficient Evidence)" : `${telemetry.generation.toFixed(1)} ms`,
      executed: !isGenerationSkipped,
      detail: isGenerationSkipped ? "LLM generation bypassed because retrieval confidence fell below threshold" : "Context-grounded natural language synthesis"
    }
  ];

  return (
    <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }} aria-label="RAG Pipeline Execution Trace">
      
      {/* Header & Toggle */}
      <button 
        onClick={() => setExpanded(!expanded)}
        style={{ 
          background: 'transparent', 
          border: 'none', 
          width: '100%', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer',
          padding: '0.25rem 0',
          color: 'var(--text-secondary)'
        }}
        aria-expanded={expanded}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-pure)' }}>How RAGGoa answered</span>
          <span className="badge-pill" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}>
            {totalFormatted} total
          </span>
        </div>
        <span style={{ color: 'var(--emerald-light)', fontSize: '0.8rem', fontWeight: 500 }}>
          {expanded ? 'Hide technical details ↑' : 'View technical details →'}
        </span>
      </button>

      {/* Compact Minimal AI Activity Trace Ribbon (Always Clean & Visible) */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap', 
        gap: '0.4rem', 
        marginTop: '0.75rem',
        padding: '0.6rem 0.85rem',
        background: 'rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.74rem',
        fontFamily: 'var(--font-mono)'
      }}>
        {stages.map((st, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{st.name}</span>
            <span style={{ 
              color: st.executed ? (st.shortDuration === 'MOCK' ? 'var(--goa-gold)' : 'var(--emerald-light)') : 'var(--text-disabled)',
              fontWeight: 600
            }}>
              {st.shortDuration}
            </span>
            {idx < stages.length - 1 && (
              <span style={{ color: 'var(--border-medium)', margin: '0 0.2rem' }}>→</span>
            )}
          </div>
        ))}
      </div>

      {/* Expanded Deep Technical Details */}
      {expanded && (
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', animation: 'fadeIn 0.2s ease' }}>
          {stages.map((st, idx) => (
            <div 
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                background: 'rgba(10, 13, 20, 0.75)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: 'var(--emerald-primary)', fontWeight: 'bold' }}>✓</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-pure)' }}>
                    {st.num} · {st.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.74rem' }}>({st.engine})</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{st.detail}</div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.78rem', color: st.fullDuration.includes('MOCK') ? 'var(--goa-gold-light)' : 'var(--emerald-light)' }}>
                {st.fullDuration}
              </span>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
