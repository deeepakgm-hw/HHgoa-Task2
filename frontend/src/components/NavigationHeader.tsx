interface NavigationHeaderProps {
  activeView: 'inquiry' | 'observability' | 'architecture';
  setActiveView: (view: 'inquiry' | 'observability' | 'architecture') => void;
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  chunkCount?: number;
}

export default function NavigationHeader({
  activeView,
  setActiveView,
  selectedLanguage,
  onSelectLanguage,
  chunkCount = 3381
}: NavigationHeaderProps) {
  const languages = [
    { code: 'en-IN', short: 'EN', name: 'English' },
    { code: 'hi-IN', short: 'HI', name: 'हिन्दी' },
    { code: 'kn-IN', short: 'KN', name: 'ಕನ್ನಡ' },
    { code: 'ta-IN', short: 'TA', name: 'தமிழ்' },
    { code: 'te-IN', short: 'TE', name: 'తెలుగు' }
  ];

  return (
    <header className="ledger-header" role="banner">
      <div className="header-container">
        {/* Left: Brand Identity */}
        <div className="header-brand" onClick={() => setActiveView('inquiry')}>
          <span className="brand-title">RAGGoa</span>
          <span className="brand-tagline">INDIC EVIDENCE LEDGER</span>
        </div>

        {/* Center: Primary Navigation */}
        <nav className="header-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-item-btn ${activeView === 'inquiry' ? 'active' : ''}`}
            onClick={() => setActiveView('inquiry')}
          >
            Ledger
          </button>
          <button
            type="button"
            className={`nav-item-btn ${activeView === 'observability' ? 'active' : ''}`}
            onClick={() => setActiveView('observability')}
          >
            Performance Ruler
          </button>
          <button
            type="button"
            className={`nav-item-btn ${activeView === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveView('architecture')}
          >
            Pipeline Architecture
          </button>
        </nav>

        {/* Right: Consolidated Controls (Single Language Selector + Corpus Stat) */}
        <div className="header-console-controls">
          <div className="console-stat-pill" title="Live Indexed Corpus Count">
            <strong>{chunkCount.toLocaleString()}</strong> CHUNKS
          </div>

          {/* Consolidated Language Selector (Equal visual weight, active in brass) */}
          <div className="single-language-control" aria-label="Select Working Language">
            {languages.map((l) => {
              const isSelected = selectedLanguage.startsWith(l.code.split('-')[0]);
              return (
                <button
                  key={l.code}
                  type="button"
                  className={`lang-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectLanguage(l.code)}
                  title={`Switch language context to ${l.name}`}
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
