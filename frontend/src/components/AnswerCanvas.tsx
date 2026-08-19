import { useState } from 'react';
import { QueryResult, SourceDocument } from '../types';

interface AnswerCanvasProps {
  query: string;
  result: QueryResult;
  detectedLanguage?: string;
  onAskNewQuery: () => void;
}

export default function AnswerCanvas({
  query,
  result,
  detectedLanguage,
  onAskNewQuery
}: AnswerCanvasProps) {
  const [copied, setCopied] = useState(false);

  const isGrounded = result.status === 'GROUNDED_SUCCESS' && (result.sources?.length ?? 0) > 0;
  const isInsufficient = result.status === 'INSUFFICIENT_CTX';
  const isRateLimited = result.status === 'RATE_LIMITED';

  const sources: SourceDocument[] = result.sources || [];
  const citations = result.citations || [];

  // Script detection for native font class
  const getIndicFontClass = (text: string) => {
    if (/[\u0900-\u097F]/.test(text)) return 'indic-text-hi';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'indic-text-kn';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'indic-text-ta';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'indic-text-te';
    return '';
  };

  const answerFontClass = getIndicFontClass(result.answer || query);

  const cleanAnswer = (result.answer || '')
    .replace(/^Based on (?:sources?|retrieved context|the provided context)?\s*\[[^\]]+\]:?\s*/i, '')
    .replace(/\[msmarco-[^\]]+\]/gi, '')
    .trim();

  const handleCopy = () => {
    if (result.answer) {
      navigator.clipboard.writeText(result.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="answer-ledger-canvas" aria-label="Evidence Verification Ledger">
      
      {/* ── Top Inquiry Header ── */}
      <div className="ledger-inquiry-header">
        <div className="inquiry-meta-group">
          <div className="inquiry-pre-label">RECORDED INQUIRY:</div>
          <h2 className={`inquiry-spoken-text ${answerFontClass}`}>"{query}"</h2>
        </div>

        <button
          type="button"
          className="btn-new-inquiry"
          onClick={onAskNewQuery}
        >
          ← New Inquiry
        </button>
      </div>

      {/* ── Answer Grid: Primary Synthesis + Retrieved Evidence Ledger ── */}
      <div className="ledger-answer-grid">
        
        {/* Left Column: Primary Answer or Explicit Refusal */}
        <div className="ledger-primary-card">
          <div className="card-status-header">
            {isGrounded && (
              <div className="status-badge-brass">
                <span>✓ CONFIRMED GROUNDED EVIDENCE</span>
              </div>
            )}

            {isInsufficient && (
              <div className="status-badge-rust">
                <span>✗ REFUSAL: INSUFFICIENT EVIDENCE</span>
              </div>
            )}

            {isRateLimited && (
              <div className="status-badge-brass" style={{ color: 'var(--grounded)' }}>
                <span>⚠ SAFE OFFLINE FALLBACK (RATE LIMITED)</span>
              </div>
            )}

            {detectedLanguage && (
              <span className="detected-lang-pill" title="Detected Language Script">
                {detectedLanguage}
              </span>
            )}
          </div>

          {/* Grounded Success Prose */}
          {isGrounded && (
            <>
              <p className={`primary-answer-prose ${answerFontClass}`}>
                {cleanAnswer}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--structural-faint)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--grounded)' }}>
                  Grounded across {sources.length} MSMARCO-XI {sources.length === 1 ? 'passage' : 'passages'}
                </span>

                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--structural)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </>
          )}

          {/* Refusal / Insufficient Context View (Features in Rust Color) */}
          {isInsufficient && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="refusal-explanation-prose">
                I couldn't find enough verified evidence in the MSMARCO-XI index to answer that reliably.
              </div>
              <p className="refusal-sub-detail">
                RAGGoa enforces strict zero-hallucination correctness: the relevance score for retrieved candidate passages was below the calibrated confidence gate (0.35). Gemini generation was safely bypassed.
              </p>
            </div>
          )}

          {/* Rate Limited Fallback */}
          {isRateLimited && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '1.2rem', color: 'var(--grounded)' }}>
                Remote Generation Temporarily Unavailable
              </div>
              <p className="refusal-sub-detail">
                {result.reason || "Operating with local vector grounding fallback."}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Retrieved Source Documents Ledger */}
        <div className="ledger-evidence-column">
          <div className="evidence-column-title">
            AUDITED SOURCE PASSAGES ({sources.length}):
          </div>

          {sources.length === 0 ? (
            <div className="evidence-record-box" style={{ borderColor: 'var(--refused-border)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--refused)' }}>
                Zero candidate passages met the 0.35 relevance threshold.
              </div>
            </div>
          ) : (
            sources.map((src, i) => {
              const isCited = citations.includes(src.id) || citations.includes(String(src.passageId));
              return (
                <div key={src.id || i} className="evidence-record-box">
                  <div className="record-head">
                    <span className="record-idx">
                      PASSAGE 0{i + 1} {isCited ? '• [CITED]' : ''}
                    </span>
                    <span className="record-score">
                      SCORE: {(src.score ?? 0).toFixed(3)}
                    </span>
                  </div>

                  <div className={`record-text-passage ${getIndicFontClass(src.text || src.passage || '')}`}>
                    {(src.text || src.passage || '')}
                  </div>

                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--structural)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Doc: #{src.passageId || src.id}</span>
                    <span>Lang: {src.metadata?.language || src.language || 'en'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ── Expandable Telemetry Row ── */}
      {result.telemetry && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--structural)', borderRadius: 'var(--radius-md)', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          <span>
            Measured Pipeline Latency: <strong>{((result.telemetry.total ?? 0) > 1000 ? `${((result.telemetry.total ?? 0) / 1000).toFixed(2)}s` : `${Math.round(result.telemetry.total ?? 0)}ms`)}</strong>
          </span>
          <span style={{ color: 'var(--grounded)' }}>
            In-Memory Retrieval (Search + Rerank): <strong>{(Number(result.telemetry.retrieval ?? 0) + Number(result.telemetry.rerank ?? 0)).toFixed(2)}ms</strong>
          </span>
        </div>
      )}

    </section>
  );
}
