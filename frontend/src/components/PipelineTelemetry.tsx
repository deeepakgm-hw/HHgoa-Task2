import { useState } from 'react';
import { LatencyReport } from '../types';

interface PipelineTelemetryProps {
  telemetry: LatencyReport | null;
  isVoice?: boolean;
}

export default function PipelineTelemetry({ telemetry, isVoice = false }: PipelineTelemetryProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!telemetry) return null;

  const stages = [
    ...(isVoice || telemetry.stt !== null ? [{
      id: 'stt',
      name: 'Voice Transcription',
      service: 'Sarvam Saaras v3',
      duration: telemetry.stt !== null ? `${Number(telemetry.stt).toFixed(1)} ms` : 'Bypassed (Text)',
      isLive: telemetry.stt !== null,
      color: '#38bdf8'
    }] : []),
    {
      id: 'norm',
      name: 'Query Normalization',
      service: 'Unicode Sanitizer & Gate',
      duration: `${Number(telemetry.normalization ?? 0.1).toFixed(2)} ms`,
      isLive: true,
      color: '#a855f7'
    },
    {
      id: 'embedding',
      name: 'Query Embedding',
      service: 'gemini-embedding-2 (Cached)',
      duration: `${Number(telemetry.embedding ?? 0).toFixed(1)} ms`,
      isLive: true,
      color: '#6366f1'
    },
    {
      id: 'retrieval',
      name: 'Hybrid Retrieval',
      service: 'Dense Vector + BM25 Lexical',
      duration: `${Number(telemetry.retrieval ?? 0).toFixed(2)} ms`,
      isLive: true,
      color: '#10b981'
    },
    {
      id: 'rerank',
      name: 'Proximity Reranking',
      service: 'N-gram Distance Scorer',
      duration: `${Number(telemetry.rerank ?? 0).toFixed(2)} ms`,
      isLive: true,
      color: '#06b6d4'
    },
    {
      id: 'generation',
      name: 'Grounded Generation',
      service: 'Gemini 2.5 Flash',
      duration: `${Number(telemetry.generation ?? 0).toFixed(1)} ms`,
      isLive: true,
      color: '#f59e0b'
    }
  ];

  const totalMs = telemetry.total ?? 0;

  return (
    <div className="pipeline-telemetry-container">
      {/* Collapsible Bar */}
      <button
        type="button"
        className="telemetry-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="telemetry-toggle-left">
          <span className="telemetry-pulse-dot" />
          <span className="telemetry-toggle-title">
            Execution Telemetry ({totalMs > 1000 ? `${(totalMs / 1000).toFixed(2)}s` : `${Math.round(totalMs)}ms`} total)
          </span>
        </div>
        <div className="telemetry-toggle-right">
          <span className="telemetry-view-label">{isOpen ? 'Hide breakdown' : 'How RAGGoa answered →'}</span>
          <svg
            className={`inspector-chevron ${isOpen ? 'open' : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded Stages Waterfall */}
      {isOpen && (
        <div className="telemetry-body-drawer">
          <div className="telemetry-stages-waterfall">
            {stages.map((st, i) => (
              <div key={st.id} className="telemetry-stage-row">
                <div className="stage-meta-col">
                  <span className="stage-step-num">0{i + 1}</span>
                  <div>
                    <div className="stage-name">{st.name}</div>
                    <div className="stage-service">{st.service}</div>
                  </div>
                </div>

                <div className="stage-timing-col">
                  <span className="stage-duration-tag" style={{ color: st.color }}>
                    {st.duration}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="telemetry-footer-summary">
            <span>Local In-Memory Latency (Retrieval+Rerank):</span>
            <strong style={{ color: '#10b981' }}>
              {(Number(telemetry.retrieval ?? 0) + Number(telemetry.rerank ?? 0)).toFixed(2)} ms
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}
