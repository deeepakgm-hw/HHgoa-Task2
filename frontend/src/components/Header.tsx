

interface HeaderProps {
  activeTab: 'ask' | 'performance' | 'architecture';
  setActiveTab: (tab: 'ask' | 'performance' | 'architecture') => void;
  selectedLanguage: string;
  onSelectLanguage: (langCode: string) => void;
  isLive: boolean;
  chunkCount?: number;
}

export default function Header({
  activeTab,
  setActiveTab,
  selectedLanguage,
  onSelectLanguage,
  isLive,
  chunkCount = 3381
}: HeaderProps) {
  const languages = [
    { code: 'en-IN', short: 'EN', label: 'English' },
    { code: 'hi-IN', short: 'HI', label: 'हिन्दी' },
    { code: 'kn-IN', short: 'KN', label: 'ಕನ್ನಡ' },
    { code: 'ta-IN', short: 'TA', label: 'தமிழ்' },
    { code: 'te-IN', short: 'TE', label: 'తెలుగు' }
  ];

  return (
    <header className="header-glass-floating" role="banner">
      <div className="header-floating-inner">
        {/* LEFT: Brand & Indicator */}
        <div className="header-brand-group" onClick={() => setActiveTab('ask')}>
          <div className="brand-orb-icon">
            <div className="brand-inner-glow" />
            <span>R</span>
          </div>
          <div className="brand-text-stack">
            <div className="brand-wordmark">
              RAG<span className="brand-gradient-accent">Goa</span>
            </div>
            <div className="brand-subtext">INDIC EVIDENCE ENGINE</div>
          </div>
          
          <div className={`status-pill ${isLive ? 'status-live' : 'status-mock'}`} title={isLive ? "Live Gemini & Sarvam APIs connected" : "Local heuristic simulation"}>
            <span className="status-indicator-dot" />
            <span className="status-label">{isLive ? 'LIVE' : 'SIMULATION'}</span>
          </div>
        </div>

        {/* CENTER: Segmented Glass Navigation Control */}
        <nav className="header-segmented-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-segment-btn ${activeTab === 'ask' ? 'active' : ''}`}
            onClick={() => setActiveTab('ask')}
            aria-selected={activeTab === 'ask'}
          >
            Ask
          </button>
          <button
            type="button"
            className={`nav-segment-btn ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
            aria-selected={activeTab === 'performance'}
          >
            Performance
          </button>
          <button
            type="button"
            className={`nav-segment-btn ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
            aria-selected={activeTab === 'architecture'}
          >
            Architecture
          </button>
        </nav>

        {/* RIGHT: Compact Language Selector & Subtle Metadata */}
        <div className="header-utility-group">
          {/* Subtle Chunk Count */}
          <div className="header-corpus-badge" title="Official MSMARCO-XI 5-Language Indexed Corpus">
            <span className="corpus-dot" />
            <span>{chunkCount.toLocaleString()} indexed</span>
          </div>

          {/* Minimal Language Pills */}
          <div className="header-lang-selector" aria-label="Select Target Language">
            {languages.map((l) => {
              const isSelected = selectedLanguage.startsWith(l.code.split('-')[0]);
              return (
                <button
                  key={l.code}
                  type="button"
                  className={`lang-pill-item ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectLanguage(l.code)}
                  title={l.label}
                  aria-pressed={isSelected}
                >
                  {l.short}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
