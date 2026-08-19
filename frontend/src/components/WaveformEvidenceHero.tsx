import { useState } from 'react';

interface WaveformEvidenceHeroProps {
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onSubmitText: (query: string) => void;
  onToggleRecord: () => void;
  isRecording: boolean;
  recordingTimer: number;
  micVolume: number;
  micError?: string;
  isBusy: boolean;
  activeStatusText: string;
}

export default function WaveformEvidenceHero({
  selectedLanguage,
  onSubmitText,
  onToggleRecord,
  isRecording,
  recordingTimer,
  micVolume,
  micError,
  isBusy,
  activeStatusText
}: WaveformEvidenceHeroProps) {
  const [inputText, setInputText] = useState('');

  // Sample live evidence fragments resolving from indexed MSMARCO-XI
  const sampleEvidenceFragments: Record<string, string> = {
    'en': '“A corporation is a legal entity created under the laws of a nation, state, or province, granting it legal personality separate from its shareholders...”',
    'hi': '“ताजमहल भारतीय शहर आगरा में यमुना नदी के दक्षिण तट पर एक हाथीदांत-सफ़ेद संगमरमर का मक़बरा है...”',
    'kn': '“ಕಾರ್ಪೊರೇಷನ್ ಎಂಬುದು ಕಾನೂನಿನ ಪ್ರಕಾರ ರಚಿಸಲಾದ ಪ್ರತ್ಯೇಕ ಕಾನೂನುಬದ್ಧ ಸಂಸ್ಥೆಯಾಗಿದೆ...”',
    'ta': '“ஒரு நிறுவனம் என்பது ஒரு குறிப்பிட்ட நாட்டின் சட்டங்களின் கீழ் இணைக்கப்பட்ட ஒரு சட்டப்பூர்வ அமைப்பாகும்...”',
    'te': '“కార్పొరేషన్ అనేది చట్టబద్ధమైన వ్యక్తిత్వాన్ని కలిగి ఉన్న ప్రత్యేక చట్టపరమైన సంస్థ...”'
  };

  const currentLangKey = selectedLanguage.split('-')[0].toLowerCase();
  const currentEvidence = sampleEvidenceFragments[currentLangKey] || sampleEvidenceFragments.en;

  const datasetInquiries = [
    { text: "what is a corporation?", lang: "EN", tag: "Finance", isRefusal: false, langClass: "" },
    { text: "ताजमहल कहाँ स्थित है?", lang: "HI", tag: "History", isRefusal: false, langClass: "indic-text-hi" },
    { text: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", lang: "KN", tag: "Finance", isRefusal: false, langClass: "indic-text-kn" },
    { text: "ஒரு நிறுவனம் என்பது என்ன?", lang: "TA", tag: "Finance", isRefusal: false, langClass: "indic-text-ta" },
    { text: "తాజ్ మహల్ ఎక్కడ ఉంది?", lang: "TE", tag: "History", isRefusal: false, langClass: "indic-text-te" },
    { text: "Who is India Prime Minister?", lang: "EN", tag: "Refusal Guardrail", isRefusal: true, langClass: "" }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isBusy) {
      onSubmitText(inputText.trim());
      setInputText('');
    }
  };

  // Generate 48 waveform bars with dynamic volume modulation
  const waveBarsCount = 48;
  const bars = Array.from({ length: waveBarsCount }, (_, i) => {
    const baseHeight = 12 + Math.sin((i / waveBarsCount) * Math.PI) * 18;
    const dynamicAmp = isRecording ? (micVolume * 45 * Math.sin((i + Date.now() / 150) * 0.4)) : 0;
    const height = Math.max(6, Math.min(78, baseHeight + dynamicAmp));
    return height;
  });

  return (
    <section className="hero-ledger-view" aria-label="Evidence Ledger Console">
      
      {/* ── Editorial Headline Block (Strictly ONE Display Serif, Fraunces) ── */}
      <div className="hero-editorial-block">
        <div className="hero-label">HACKER HOUSE GOA 2026 • TASK #2 EVIDENCE LEDGER</div>
        <h1 className="hero-headline">
          Precision Evidence Instrument.
          <span className="hero-headline-sub">Audited truth across 5 Indian languages.</span>
        </h1>
        <p className="hero-lead-prose">
          Direct multilingual voice and lexical retrieval over ai4bharat/MSMARCO-XI. Answers are synthesized exclusively when supported by retrieved text; out-of-domain queries are strictly refused.
        </p>
      </div>

      {/* ── Live Waveform & Sound-to-Evidence Visualizer ── */}
      <div className="waveform-instrument-stage">
        <div className="instrument-top-status">
          <div className="instrument-tag">
            <span className={`instrument-pulse-dot ${isRecording ? 'recording' : ''}`} />
            <span>{isRecording ? 'SPEECH CAPTURE ENGAGED' : activeStatusText}</span>
          </div>

          <div className="instrument-timer">
            {isRecording ? `00:${recordingTimer.toString().padStart(2, '0')} / 00:20` : '3,381 CHUNKS LOADED'}
          </div>
        </div>

        {/* Dynamic Waveform Track */}
        <div className="waveform-bars-box" aria-hidden="true">
          {bars.map((h, idx) => (
            <div
              key={idx}
              className={`wave-bar ${isRecording ? 'recording' : (isBusy ? 'active' : '')}`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        {/* Live Grounded Evidence Text Fragment (Sound becoming Evidence) */}
        <div className="live-evidence-fragment-box">
          <div className="evidence-lead-label">REPRESENTATIVE INDEXED EVIDENCE PASSAGE ({currentLangKey.toUpperCase()}):</div>
          <div className="evidence-fragment-text">
            {currentEvidence}
          </div>
        </div>
      </div>

      {/* ── Command Surface: Input + Integrated Mic ── */}
      <div className="ledger-command-surface">
        <form className="command-input-container" onSubmit={handleSubmit}>
          <input
            type="text"
            className="ledger-text-input"
            placeholder={
              isRecording
                ? "Listening... (tap Stop Recording when finished)"
                : isBusy
                ? "Searching verified evidence in MSMARCO-XI..."
                : "Type or speak an inquiry in English, हिन्दी, ಕನ್ನಡ, தமிழ், or తెలుగు..."
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isBusy && !isRecording}
            aria-label="Inquiry input"
          />
        </form>

        <button
          type="button"
          className={`mic-action-btn ${isRecording ? 'recording' : ''}`}
          onClick={onToggleRecord}
          title={isRecording ? "Stop recording" : "Record voice query"}
          aria-label="Toggle voice recording"
        >
          {isRecording ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>Stop Recording</span>
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              <span>Speak</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="submit-action-btn"
          onClick={() => {
            if (inputText.trim() && !isBusy) {
              onSubmitText(inputText.trim());
              setInputText('');
            }
          }}
          disabled={!inputText.trim() || isBusy}
          aria-label="Submit inquiry"
        >
          Query
        </button>
      </div>

      {micError && (
        <div style={{ color: 'var(--refused)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
          ⚠️ {micError}
        </div>
      )}

      {/* ── Verified MSMARCO-XI Query Chips Strip (Refusal chip in Rust) ── */}
      <div className="verified-chips-section">
        <div className="chips-section-title">VERIFIED INQUIRY TESTS (WITH EXPLICIT REFUSAL GUARDRAIL):</div>
        <div className="chips-grid">
          {datasetInquiries.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className={`verified-query-chip ${item.isRefusal ? 'refusal-chip' : ''}`}
              onClick={() => onSubmitText(item.text)}
            >
              <div className="chip-meta-row">
                <span className="chip-lang-badge">{item.lang}</span>
                <span className={`chip-category-tag ${item.isRefusal ? 'refusal' : ''}`}>
                  {item.tag}
                </span>
              </div>
              <div className={`chip-query-text ${item.langClass}`}>
                {item.text}
              </div>
            </button>
          ))}
        </div>
      </div>

    </section>
  );
}
