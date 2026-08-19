import { useState } from 'react';

interface RetrievalInspectorProps {
  sources: {
    id: string;
    text: string;
    score: number;
    strategy?: 'fixed' | 'sentence' | 'semantic' | 'metadata' | string;
    [key: string]: any;
  }[];
  strategy: string;
}

export default function RetrievalInspector({ sources, strategy }: RetrievalInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  if (!sources || sources.length === 0) return null;

  return (
    <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
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
        aria-expanded={isOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-pure)' }}>Sources</span>
          <span className="badge-pill" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}>
            {sources.length} {sources.length === 1 ? 'source' : 'sources'}
          </span>
        </div>
        <span style={{ color: 'var(--emerald-light)', fontSize: '0.8rem', fontWeight: 500 }}>
          {isOpen ? 'Hide evidence ↑' : 'Inspect evidence →'}
        </span>
      </button>

      {isOpen && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', animation: 'fadeIn 0.2s ease' }}>
          
          {/* List of Retrieved Source Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '380px', overflowY: 'auto' }}>
            {sources.map((src, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: 'rgba(10, 13, 20, 0.75)', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: 'var(--radius-md)',
                  padding: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                {/* Header: Source 01 & Copy */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--emerald-light)', letterSpacing: '0.02em' }}>
                    Source {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>

                  <button 
                    onClick={() => copyText(src.id, src.text)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedId === src.id ? 'var(--emerald-light)' : 'var(--text-muted)',
                      fontSize: '0.74rem',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    {copiedId === src.id ? '✓ Copied' : 'Copy Passage'}
                  </button>
                </div>
                
                {/* Passage Text (Clean & Highly Legible) */}
                <p style={{ fontSize: '0.94rem', color: 'var(--text-primary)', lineHeight: '1.6', fontWeight: 400 }}>
                  "{src.text}"
                </p>

                {/* Secondary Technical Metadata */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  flexWrap: 'wrap', 
                  gap: '0.5rem',
                  paddingTop: '0.6rem',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span>Relevance: <strong style={{ color: 'var(--emerald-light)' }}>{src.score.toFixed(3)}</strong></span>
                    <span>Strategy: <strong style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{src.strategy || strategy}</strong></span>
                  </div>
                  <span style={{ color: 'var(--text-disabled)' }}>ID: {src.id}</span>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
