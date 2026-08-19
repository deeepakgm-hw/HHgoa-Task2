import { useState } from 'react';
import { QueryResult } from '../types';
import EvidenceInspector from './EvidenceInspector';
import PipelineTelemetry from './PipelineTelemetry';

interface AnswerPanelProps {
  query: string;
  result: QueryResult;
  detectedLanguage?: string;
  onAskAnother: () => void;
  onRefineQuestion: (text: string) => void;
}

export default function AnswerPanel({
  query,
  result,
  detectedLanguage,
  onAskAnother,
  onRefineQuestion
}: AnswerPanelProps) {
  const [copied, setCopied] = useState(false);

  const isGrounded = result.status === 'GROUNDED_SUCCESS' && (result.sources?.length ?? 0) > 0;
  const isInsufficient = result.status === 'INSUFFICIENT_CTX';
  const isRateLimited = result.status === 'RATE_LIMITED';
  const isError = result.status === 'SERVER_ERROR' || result.status === 'VALIDATION_ERROR';

  function handleCopy() {
    if (result.answer) {
      navigator.clipboard.writeText(result.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Clean raw answer text to remove internal brackets or system headers
  const displayAnswer = (result.answer || '')
    .replace(/^Based on (?:sources?|retrieved context|the provided context)?\s*\[[^\]]+\]:?\s*/i, '')
    .replace(/\[msmarco-[^\]]+\]/gi, '')
    .replace(/\[Source\s*(\d+)\]/gi, ' [Source $1]')
    .trim();

  return (
    <section className="answer-panel-floating" aria-label="Grounded Answer Result">
      {/* Top Meta Bar */}
      <div className="answer-header-meta">
        <div className="answer-query-block">
          <span className="query-eyebrow">YOU ASKED</span>
          <h2 className="query-display-text">"{query}"</h2>
        </div>

        <div className="answer-status-pill-group">
          {detectedLanguage && (
            <span className="lang-tag-pill">{detectedLanguage}</span>
          )}

          {isGrounded && (
            <div className="grounding-status-pill grounded">
              <span className="status-dot green" />
              <span>Grounded in {result.sources.length} {result.sources.length === 1 ? 'source' : 'sources'}</span>
            </div>
          )}

          {isInsufficient && (
            <div className="grounding-status-pill refused">
              <span className="status-dot red" />
              <span>Insufficient Evidence</span>
            </div>
          )}

          {isRateLimited && (
            <div className="grounding-status-pill rate-limited">
              <span className="status-dot amber" />
              <span>Rate Limited (Safe Fallback)</span>
            </div>
          )}

          {isError && (
            <div className="grounding-status-pill error">
              <span className="status-dot red" />
              <span>Pipeline Guardrail</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Answer Surface */}
      <div className={`answer-card-surface ${isGrounded ? 'grounded-surface' : isInsufficient ? 'insufficient-surface' : ''}`}>
        {/* Brand Stamp */}
        <div className="answer-card-brand-bar">
          <div className="brand-stamp">
            <span className="brand-dot" />
            <span>RAGGoa Verified Output</span>
          </div>
          {result.timestamp && (
            <span className="answer-timestamp">{result.timestamp}</span>
          )}
        </div>

        {/* Primary Answer Prose */}
        <div className="answer-body-prose">
          {isGrounded && (
            <p className="grounded-answer-text">
              {displayAnswer}
            </p>
          )}

          {isInsufficient && (
            <div className="insufficient-evidence-box">
              <p className="insufficient-main-msg">
                There's not enough evidence in the indexed MSMARCO-XI corpus to answer that reliably.
              </p>
              <p className="insufficient-sub-msg">
                RAGGoa enforces zero-hallucination guardrails: the model refuses to guess when retrieved passages do not contain verified facts.
              </p>
              <div className="insufficient-action-bar">
                <button
                  type="button"
                  className="btn-refine-question"
                  onClick={() => onRefineQuestion(query)}
                >
                  Refine Question
                </button>
              </div>
            </div>
          )}

          {isRateLimited && (
            <div className="rate-limited-box">
              <p className="rate-limited-msg">
                {result.reason || "The generation service is temporarily rate limited. Please try again shortly."}
              </p>
            </div>
          )}

          {isError && (
            <div className="error-box">
              <p className="error-msg">
                {result.reason || "Query did not pass input validation guardrails."}
              </p>
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="answer-action-controls">
          <button
            type="button"
            className="action-pill-btn secondary"
            onClick={onAskAnother}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            Ask Another Question
          </button>

          {isGrounded && (
            <button
              type="button"
              className="action-pill-btn secondary"
              onClick={handleCopy}
              title="Copy answer text"
            >
              {copied ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ color: '#10b981' }}>Copied</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Answer</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Technical Drawers */}
      {result.sources && result.sources.length > 0 && (
        <EvidenceInspector
          sources={result.sources}
          citations={result.citations}
          detectedLanguage={detectedLanguage}
        />
      )}

      {result.telemetry && (
        <PipelineTelemetry
          telemetry={result.telemetry}
          isVoice={Boolean(result.transcript)}
        />
      )}
    </section>
  );
}
