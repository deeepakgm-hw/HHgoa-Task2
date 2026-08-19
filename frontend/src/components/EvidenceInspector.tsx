import { useState } from 'react';
import { SourceDocument } from '../types';

interface EvidenceInspectorProps {
  sources: SourceDocument[];
  citations?: string[];
  detectedLanguage?: string;
}

export default function EvidenceInspector({
  sources,
  citations = [],
  detectedLanguage
}: EvidenceInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);

  if (!sources || sources.length === 0) {
    return null;
  }

  const activeSource = sources[activeSourceIndex] || sources[0];

  return (
    <div className="evidence-inspector-container">
      {/* Toggle Bar */}
      <button
        type="button"
        className="evidence-inspector-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="inspector-toggle-left">
          <span className="inspector-pulse-icon">✦</span>
          <span className="inspector-toggle-title">
            Inspect Evidence ({sources.length} {sources.length === 1 ? 'source' : 'sources'})
          </span>
          {citations.length > 0 && (
            <span className="inspector-citation-count">
              {citations.length} cited in answer
            </span>
          )}
        </div>
        <div className="inspector-toggle-right">
          <span className="inspector-action-label">{isOpen ? 'Hide' : 'Inspect'}</span>
          <svg
            className={`inspector-chevron ${isOpen ? 'open' : ''}`}
            width="18"
            height="18"
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

      {/* Expanded Glass Drawer */}
      {isOpen && (
        <div className="evidence-inspector-body">
          {/* Source Tabs Header */}
          <div className="evidence-tabs-bar">
            {sources.map((src, idx) => {
              const isCited = citations.includes(src.id) || citations.includes(String(src.passageId));
              const isSelected = activeSourceIndex === idx;
              return (
                <button
                  key={src.id || idx}
                  type="button"
                  className={`evidence-tab-btn ${isSelected ? 'active' : ''} ${isCited ? 'cited' : ''}`}
                  onClick={() => setActiveSourceIndex(idx)}
                >
                  <span className="tab-num">0{idx + 1}</span>
                  <span className="tab-title">
                    {src.title || `Passage ${src.passageId || idx + 1}`}
                  </span>
                  {isCited && <span className="tab-cited-badge">CITED</span>}
                </button>
              );
            })}
          </div>

          {/* Active Source Card Content */}
          {activeSource && (
            <div className="evidence-detail-card">
              {/* Metadata Badges Bar */}
              <div className="evidence-meta-row">
                <div className="evidence-meta-chips">
                  <span className="meta-chip dataset">
                    <span className="meta-chip-label">DATASET</span>
                    MSMARCO-XI
                  </span>
                  <span className="meta-chip lang">
                    <span className="meta-chip-label">LANG</span>
                    {activeSource.metadata?.language || activeSource.language || detectedLanguage || 'en'}
                  </span>
                  {activeSource.passageId && (
                    <span className="meta-chip doc">
                      <span className="meta-chip-label">DOC/PASSAGE</span>
                      #{activeSource.passageId}
                    </span>
                  )}
                  {activeSource.strategy && (
                    <span className="meta-chip strategy">
                      <span className="meta-chip-label">STRATEGY</span>
                      {activeSource.strategy}
                    </span>
                  )}
                  {(activeSource.isSelected || activeSource.metadata?.isSelected) && (
                    <span className="meta-chip gold">
                      ★ GOLD PASSAGE
                    </span>
                  )}
                </div>

                {/* Numerical Scores */}
                <div className="evidence-scores-group">
                  <div className="score-stat" title="Combined Hybrid Similarity Score">
                    <span className="score-label">MATCH SCORE</span>
                    <span className="score-value highlight">
                      {(activeSource.score ?? 0).toFixed(3)}
                    </span>
                  </div>
                  {activeSource.metadata?.vectorScore !== undefined && (
                    <div className="score-stat" title="Dense Cosine Similarity">
                      <span className="score-label">VECTOR</span>
                      <span className="score-value">
                        {Number(activeSource.metadata.vectorScore).toFixed(3)}
                      </span>
                    </div>
                  )}
                  {activeSource.metadata?.lexicalScore !== undefined && (
                    <div className="score-stat" title="BM25 Lexical Keyword Overlap">
                      <span className="score-label">BM25</span>
                      <span className="score-value">
                        {Number(activeSource.metadata.lexicalScore).toFixed(3)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Exact Evidence Passage Text */}
              <div className="evidence-passage-box">
                <div className="passage-text-content">
                  {activeSource.text || activeSource.passage || 'No passage text available.'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
