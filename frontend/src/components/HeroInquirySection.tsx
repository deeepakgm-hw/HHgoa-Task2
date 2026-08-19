import { useState } from 'react';
import LivingSculpture, { SculptureState } from './LivingSculpture';

interface HeroInquirySectionProps {
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onSubmitText: (query: string) => void;
  onSubmitAudio: (blob: Blob) => void;
  sculptureState: SculptureState;
  onToggleRecord: () => void;
  recordingTimer: number;
  micVolume: number;
  micError?: string;
  isBusy: boolean;
}

export default function HeroInquirySection({
  selectedLanguage,
  onSelectLanguage,
  onSubmitText,
  sculptureState,
  onToggleRecord,
  recordingTimer,
  micVolume,
  micError,
  isBusy
}: HeroInquirySectionProps) {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'en' | 'hi' | 'kn' | 'ta' | 'te'>('all');

  const datasetInquiries: Record<string, { text: string; label: string; lang: string; tag: string }[]> = {
    all: [
      { text: "what is a corporation?", label: "Corporation", lang: "EN", tag: "Finance" },
      { text: "ताजमहल कहाँ स्थित है?", label: "ताजमहल", lang: "HI", tag: "History" },
      { text: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", label: "ಕಾರ್ಪೊರೇಷನ್", lang: "KN", tag: "Finance" },
      { text: "ஒரு நிறுவனம் என்பது என்ன?", label: "நிறுவனம்", lang: "TA", tag: "Finance" },
      { text: "తాజ్ మహల్ ఎక్కడ ఉంది?", label: "తాజ్ మహల్", lang: "TE", tag: "History" },
      { text: "Who is India Prime Minister?", label: "Prime Minister", lang: "EN", tag: "Refusal Guardrail" }
    ],
    en: [
      { text: "what is a corporation?", label: "Corporation", lang: "EN", tag: "Finance" },
      { text: "Where is the Taj Mahal located?", label: "Taj Mahal", lang: "EN", tag: "History" },
      { text: "why did rachel carson write silent spring", label: "Rachel Carson", lang: "EN", tag: "Literature" },
      { text: "Who is India Prime Minister?", label: "Prime Minister", lang: "EN", tag: "Refusal Guardrail" }
    ],
    hi: [
      { text: "कॉर्पोरेशन क्या है?", label: "कॉर्पोरेशन", lang: "HI", tag: "Finance" },
      { text: "ताजमहल कहाँ स्थित है?", label: "ताजमहल", lang: "HI", tag: "History" },
      { text: "रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा", label: "रेचल कार्सन", lang: "HI", tag: "Literature" },
      { text: "जापान की राजधानी क्या है?", label: "जापान", lang: "HI", tag: "Refusal Guardrail" }
    ],
    kn: [
      { text: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", label: "ಕಾರ್ಪೊರೇಷನ್", lang: "KN", tag: "Finance" },
      { text: "ತಾಜ್ ಮಹಲ್ ಎಲ್ಲಿದೆ?", label: "ತಾಜ್ ಮಹಲ್", lang: "KN", tag: "History" },
      { text: "ರಾಚೆಲ್ ಕಾರ್ಸನ್ ಸೈಲೆಂಟ್ ಸ್ಪ್ರಿಂಗ್ ಏಕೆ ಬರೆದರು", label: "ರಾಚೆಲ್ ಕಾರ್ಸನ್", lang: "KN", tag: "Literature" },
      { text: "ಜಪಾನ್ ದೇಶದ ರಾಜಧಾನಿ ಯಾವುದು?", label: "ಜಪಾನ್", lang: "KN", tag: "Refusal Guardrail" }
    ],
    ta: [
      { text: "ஒரு நிறுவனம் என்பது என்ன?", label: "நிறுவனம்", lang: "TA", tag: "Finance" },
      { text: "தாஜ்மஹால் எங்கே உள்ளது?", label: "தாஜ்மஹால்", lang: "TA", tag: "History" },
      { text: "ரேச்சல் கார்சன் ஏன் அமைதியான வசந்தத்தை எழுதினார்", label: "ரேச்சல் கார்சன்", lang: "TA", tag: "Literature" },
      { text: "ஜப்பானின் தலைநகரம் எது?", label: "ஜப்பான்", lang: "TA", tag: "Refusal Guardrail" }
    ],
    te: [
      { text: "కార్పొరేషన్ అంటే ఏమిటి?", label: "కార్పొరేషన్", lang: "TE", tag: "Finance" },
      { text: "తాజ్ మహల్ ఎక్కడ ఉంది?", label: "తాజ్ మహల్", lang: "TE", tag: "History" },
      { text: "రాచెల్ కార్సన్ సైలెంట్ స్ప్రింగ్ ఎందుకు రాశారు", label: "రాచెల్ కార్సన్", lang: "TE", tag: "Literature" },
      { text: "జపాన్ రాజధాని ఏమిటి?", label: "జపాన్", lang: "TE", tag: "Refusal Guardrail" }
    ]
  };

  const currentQueries = datasetInquiries[activeTab] || datasetInquiries.all;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isBusy) {
      onSubmitText(inputText.trim());
      setInputText('');
    }
  };

  return (
    <section className="spatial-hero-layout" aria-label="Evidence Inquiry Hero">
      {/* ── Asymmetric Grid: Left Editorial Statement & Right Living Sculpture ── */}
      <div className="spatial-hero-grid">
        
        {/* Left Column: Editorial Presence */}
        <div className="spatial-hero-editorial">
          <div className="editorial-eyebrow">
            <span className="eyebrow-accent-sparkle">✦</span>
            <span className="eyebrow-text">MULTILINGUAL VOICE RAG • MSMARCO-XI</span>
          </div>

          <h1 className="editorial-headline">
            ASK THE<br />
            <span className="headline-gradient-shimmer">EVIDENCE.</span>
          </h1>

          <p className="editorial-lead">
            An intelligent AI instrument that listens to spoken speech in 5 Indian languages, retrieves verified passage chunks from MSMARCO-XI, and answers strictly when the evidence proves it true.
          </p>

          {/* Supported Language Bar */}
          <div className="editorial-language-strip">
            <span className="strip-title">SUPPORTED:</span>
            <div className="strip-languages">
              {[
                { code: 'en-IN', label: 'English' },
                { code: 'hi-IN', label: 'हिन्दी' },
                { code: 'kn-IN', label: 'ಕನ್ನಡ' },
                { code: 'ta-IN', label: 'தமிழ்' },
                { code: 'te-IN', label: 'తెలుగు' }
              ].map(lang => (
                <button
                  key={lang.code}
                  type="button"
                  className={`lang-indicator-chip ${selectedLanguage.startsWith(lang.code.split('-')[0]) ? 'active' : ''}`}
                  onClick={() => onSelectLanguage(lang.code)}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: 3D Living Glass Sculpture Focal Point */}
        <div className="spatial-hero-sculpture-col">
          <LivingSculpture
            state={sculptureState}
            audioVolume={micVolume}
            onClick={onToggleRecord}
            timerSeconds={recordingTimer}
          />
        </div>

      </div>

      {/* ── Spanning Floating Command Surface ── */}
      <div className="spatial-command-surface">
        <form className="spatial-command-bar" onSubmit={handleSubmit}>
          <input
            type="text"
            className="spatial-command-input"
            placeholder={
              sculptureState === 'listening'
                ? "Listening to voice speech... (tap sculpture when finished)"
                : isBusy
                ? "Searching verified evidence in MSMARCO-XI..."
                : "Ask anything in English, हिन्दी, ಕನ್ನಡ, தமிழ், తెలుగు..."
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isBusy}
            aria-label="Ask a question"
          />

          <div className="command-bar-actions">
            {/* Real Audio Volume Wave Bar (when recording) */}
            {sculptureState === 'listening' && (
              <div className="live-amplitude-bar" title="Mic Volume">
                <div 
                  className="amplitude-level-fill" 
                  style={{ width: `${Math.max(12, micVolume * 100)}%` }} 
                />
              </div>
            )}

            {/* Voice Trigger Button */}
            <button
              type="button"
              className={`command-mic-trigger ${sculptureState === 'listening' ? 'recording' : ''}`}
              onClick={onToggleRecord}
              title={sculptureState === 'listening' ? "Stop recording" : "Record spoken question"}
              aria-label="Toggle voice recording"
            >
              {sculptureState === 'listening' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2.5" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>

            {/* Submit Arrow */}
            <button
              type="submit"
              className="command-submit-trigger"
              disabled={!inputText.trim() || isBusy}
              title="Submit query"
              aria-label="Submit query"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </form>

        {micError && (
          <div className="spatial-mic-error" role="alert">
            ⚠️ {micError}
          </div>
        )}
      </div>

      {/* ── Verified Dataset Suggestion Pills ── */}
      <div className="spatial-suggestions-wrapper">
        <div className="suggestions-tabs-bar">
          <span className="suggestions-lead-title">Verified MSMARCO-XI Inquiries:</span>
          <div className="suggestions-lang-tabs">
            {[
              { id: 'all', label: 'All Languages' },
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिन्दी' },
              { id: 'kn', label: 'ಕನ್ನಡ' },
              { id: 'ta', label: 'தமிழ்' },
              { id: 'te', label: 'తెలుగు' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`suggestion-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="suggestions-card-stream">
          {currentQueries.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="suggestion-stream-card"
              onClick={() => onSubmitText(item.text)}
            >
              <span className="card-lang-tag">{item.lang}</span>
              <span className="card-inquiry-text">{item.text}</span>
              <span className="card-category-tag">{item.tag}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
