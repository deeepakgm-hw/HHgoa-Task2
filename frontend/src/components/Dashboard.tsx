import { useState } from 'react';
import AudioRecorder from './AudioRecorder';
import PipelineViewer from './PipelineViewer';
import RetrievalInspector from './RetrievalInspector';
import { SourceDocument, TelemetryData } from '../types';

export type ResponseStatus =
  | 'GROUNDED_SUCCESS'
  | 'INSUFFICIENT_CTX'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

export interface QueryResult {
  status: ResponseStatus;
  answer: string;
  citations: string[];
  sources: SourceDocument[];
  telemetry: TelemetryData | null;
  reason?: string;
  httpStatus?: number;
  transcript?: string;
  timestamp?: string;
}

interface DashboardProps {
  isLive: boolean;
}

interface LedgerEntry {
  id: string;
  serial: number;
  query: string;
  result: QueryResult;
  timestamp: string;
}

function mapBackendResponse(data: any, httpStatus: number): QueryResult {
  const backendStatus: string = data.status || '';

  if (backendStatus === 'success') {
    return {
      status: 'GROUNDED_SUCCESS',
      answer: data.answer || '',
      citations: Array.isArray(data.citations) ? data.citations : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
      telemetry: data.telemetry ?? null,
      httpStatus,
      transcript: data.transcript,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  if (backendStatus === 'refused' || backendStatus === 'insufficient_context') {
    return {
      status: 'INSUFFICIENT_CTX',
      answer: data.answer || data.reason || "Insufficient evidence in MSMARCO-XI index.",
      citations: [],
      sources: Array.isArray(data.sources) ? data.sources : [],
      telemetry: data.telemetry ?? null,
      reason: data.reason,
      httpStatus,
      transcript: data.transcript,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  if (httpStatus === 429 || backendStatus === 'rate_limited' || /quota|rate limit|resource_exhausted|429/i.test(data.error || '')) {
    return {
      status: 'RATE_LIMITED',
      answer: '',
      citations: [],
      sources: [],
      telemetry: data.telemetry ?? null,
      reason: data.error || data.reason || 'Remote Gemini API quota reached. System is operating safely without crashing.',
      httpStatus
    };
  }

  if (httpStatus === 400 || backendStatus === 'validation_error' || backendStatus === 'guardrail_blocked') {
    return {
      status: 'VALIDATION_ERROR',
      answer: '',
      citations: [],
      sources: [],
      telemetry: data.telemetry ?? null,
      reason: data.error || data.reason || 'Query was flagged by input validation guardrails.',
      httpStatus,
      transcript: data.transcript
    };
  }

  return {
    status: 'SERVER_ERROR',
    answer: '',
    citations: [],
    sources: [],
    telemetry: data.telemetry ?? null,
    reason: data.reason || data.error || 'An unexpected pipeline error occurred.',
    httpStatus
  };
}

function detectScript(text: string): { code: string; label: string } {
  if (/[ऀ-ॿ]/.test(text)) return { code: 'hi-IN', label: 'Hindi (Devanagari)' };
  if (/[஀-௿]/.test(text)) return { code: 'ta-IN', label: 'Tamil (தமிழ்)' };
  if (/[ఀ-౿]/.test(text)) return { code: 'te-IN', label: 'Telugu (తెలుగు)' };
  if (/[ಀ-೿]/.test(text)) return { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' };
  if (/[a-zA-Z]/.test(text)) return { code: 'en-IN', label: 'English (Latin)' };
  return { code: 'hi-IN', label: 'Hindi (Devanagari)' };
}

function cleanNaturalAnswer(rawAnswer: string): string {
  if (!rawAnswer) return '';
  let text = rawAnswer;
  text = text.replace(/^Based on (?:sources?|retrieved context|the provided context)?\s*\[[^\]]+\]:?\s*/i, '');
  text = text.replace(/^Based on (?:sources?|retrieved context|the provided context):?\s*/i, '');
  text = text.replace(/\[(?:msmarco|doc|chunk|source)[^\]]+\]:?/gi, '');
  return text.trim();
}

type UiPhase = 'idle' | 'recording' | 'processing' | 'complete' | 'error';

export default function Dashboard({ isLive }: DashboardProps) {
  const [uiPhase, setUiPhase] = useState<UiPhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [networkError, setNetworkError] = useState('');
  const [languageCode, setLanguageCode] = useState('hi-IN');
  const [selectedLanguageTab, setSelectedLanguageTab] = useState<'all' | 'hi' | 'en' | 'kn' | 'ta' | 'te'>('all');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<'fixed' | 'sentence' | 'semantic'>('semantic');
  const [rerank, setRerank] = useState(true);

  const multilingualQueries: Record<string, { text: string; label: string; tag: string; lang: string }[]> = {
    hi: [
      { text: "कॉर्पोरेशन क्या है?", label: "कॉर्पोरेशन (MSMARCO)", tag: "Finance", lang: "hi" },
      { text: "ताजमहल कहाँ स्थित है?", label: "ताजमहल", tag: "History", lang: "hi" },
      { text: "रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा", label: "रेचल कार्सन", tag: "Literature", lang: "hi" },
      { text: "जापान की राजधानी क्या है?", label: "जापान (Refusal Test)", tag: "Refusal", lang: "hi" }
    ],
    en: [
      { text: "what is a corporation?", label: "Corporation (MSMARCO)", tag: "Finance", lang: "en" },
      { text: "Where is the Taj Mahal located?", label: "Taj Mahal", tag: "History", lang: "en" },
      { text: "why did rachel carson write silent spring", label: "Rachel Carson", tag: "Literature", lang: "en" },
      { text: "What is the capital of Japan?", label: "Japan (Refusal Test)", tag: "Refusal", lang: "en" }
    ],
    kn: [
      { text: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", label: "ಕಾರ್ಪೊರೇಷನ್ (MSMARCO)", tag: "Finance", lang: "kn" },
      { text: "ತಾಜ್ ಮಹಲ್ ಎಲ್ಲಿದೆ?", label: "ತಾಜ್ ಮಹಲ್", tag: "History", lang: "kn" },
      { text: "ರಾಚೆಲ್ ಕಾರ್ಸನ್ ಸೈಲೆಂಟ್ ಸ್ಪ್ರಿಂಗ್ ಏಕೆ ಬರೆದರು", label: "ರಾಚೆಲ್ ಕಾರ್ಸನ್", tag: "Literature", lang: "kn" },
      { text: "ಜಪಾನ್ ದೇಶದ ರಾಜಧಾನಿ ಯಾವುದು?", label: "ಜಪಾನ್ (Refusal Test)", tag: "Refusal", lang: "kn" }
    ],
    ta: [
      { text: "ஒரு நிறுவனம் என்பது என்ன?", label: "நிறுவனம் (MSMARCO)", tag: "Finance", lang: "ta" },
      { text: "தாஜ்மஹால் எங்கே உள்ளது?", label: "தாஜ்மஹால்", tag: "History", lang: "ta" },
      { text: "ரேச்சல் கார்சன் ஏன் அமைதியான வசந்தத்தை எழுதினார்", label: "ரேச்சல் கார்சன்", tag: "Literature", lang: "ta" },
      { text: "ஜப்பானின் தலைநகரம் எது?", label: "ஜப்பான் (Refusal Test)", tag: "Refusal", lang: "ta" }
    ],
    te: [
      { text: "కార్పొరేషన్ అంటే ఏమిటి?", label: "కార్పొరేషన్ (MSMARCO)", tag: "Finance", lang: "te" },
      { text: "తాజ్ మహల్ ఎక్కడ ఉంది?", label: "తాజ్ మహల్", tag: "History", lang: "te" },
      { text: "రాచెల్ కార్సన్ సైలెంట్ స్ప్రింగ్ ఎందుకు రాశారు", label: "రాచెల్ కార్సన్", tag: "Literature", lang: "te" },
      { text: "జపాన్ రాజధాని ఏమిటి?", label: "జపాన్ (Refusal Test)", tag: "Refusal", lang: "te" }
    ]
  };

  const displayedQueries = selectedLanguageTab === 'all'
    ? [
        multilingualQueries.hi[0],
        multilingualQueries.en[0],
        multilingualQueries.kn[0],
        multilingualQueries.ta[0],
        multilingualQueries.te[0],
        multilingualQueries.hi[3]
      ]
    : multilingualQueries[selectedLanguageTab] || multilingualQueries.hi;

  function clearState() {
    setNetworkError('');
    setUiPhase('processing');
  }

  function recordLedgerEntry(q: string, res: QueryResult) {
    const newEntry: LedgerEntry = {
      id: 'entry_' + Date.now(),
      serial: history.length + 1,
      query: q,
      result: res,
      timestamp: new Date().toLocaleTimeString()
    };
    setHistory(prev => [newEntry, ...prev]);
  }

  async function submitQuery(queryText: string) {
    if (!queryText || queryText.trim().length === 0) return;
    clearState();

    const detected = detectScript(queryText);
    setDetectedLanguage(detected.label);
    setLanguageCode(detected.code);

    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 20000);

    try {
      const targetLang = detected.code.split('-')[0].toLowerCase();
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          strategy,
          rerank,
          languageCode: targetLang
        }),
        signal: controller.signal
      });

      clearTimeout(clientTimeout);
      const data = await res.json();
      const mapped = mapBackendResponse(data, res.status);
      recordLedgerEntry(queryText, mapped);
      setUiPhase('complete');
    } catch (err: any) {
      clearTimeout(clientTimeout);
      const msg = err.name === 'AbortError' 
        ? 'Request timed out after 20 seconds. Please try again.' 
        : (err.message || 'Network connection failed');
      setNetworkError(msg);
      setUiPhase('error');
    }
  }

  async function handleAudioUpload(audioBlob: Blob) {
    clearState();
    setTranscript('');

    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 25000);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'query.webm');
      formData.append('strategy', strategy);
      formData.append('rerank', rerank.toString());
      formData.append('languageCode', languageCode);

      const res = await fetch('/api/voice-query', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(clientTimeout);
      const data = await res.json();
      let queryText = 'Spoken Indic Query';
      if (data.transcript) {
        queryText = data.transcript;
        setTranscript(data.transcript);
        const detected = detectScript(data.transcript);
        setDetectedLanguage(detected.label);
      }
      const mapped = mapBackendResponse(data, res.status);
      recordLedgerEntry(queryText, mapped);
      setUiPhase('complete');
    } catch (err: any) {
      clearTimeout(clientTimeout);
      const msg = err.name === 'AbortError'
        ? 'Voice processing timed out after 25 seconds. Please try again.'
        : (err.message || 'Failed to process voice query');
      setNetworkError(msg);
      setUiPhase('error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>

      {/* ── Precision Masthead ── */}
      <section className="hero-masthead">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <span className="badge-pill teal">VOICE-FIRST INDIC RAG</span>
          <span className={`badge-pill ${isLive ? 'brass' : 'rust'}`}>
            {isLive ? "LIVE PIPELINE" : "OFFLINE MOCK"}
          </span>
          <span className="badge-pill structural">#RAGInGoa</span>
        </div>

        <h1 className="hero-headline">
          Ask anything.<br />
          <span className="brass-accent">We'll find the evidence.</span>
        </h1>

        <p className="hero-subtext">
          Speak in Hindi (Devanagari) or English. RAGGoa executes speech transcription, vector hybrid search, and proximity reranking across MSMARCO-XI — answering only when real retrieved evidence supports it.
        </p>
      </section>

      {/* ── Central Voice Transducer Hub (Primary Visual Focus) ── */}
      <AudioRecorder
        recordingState={uiPhase}
        setRecordingState={(s) => {
          setUiPhase(s);
        }}
        onAudioComplete={handleAudioUpload}
        onReset={() => {
          setUiPhase('idle');
          setTranscript('');
        }}
      />

      {/* ── Precision Suggested Query Chips with 5-Language Switcher ── */}
      <section className="suggested-queries-section" aria-label="Suggested Inquiries">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div className="suggested-queries-title" style={{ margin: 0 }}>Official MSMARCO-XI Inquiries (5 Languages)</div>
          
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Languages' },
              { id: 'hi', label: 'हिंदी Hindi' },
              { id: 'en', label: 'English' },
              { id: 'kn', label: 'ಕನ್ನಡ Kannada' },
              { id: 'ta', label: 'தமிழ் Tamil' },
              { id: 'te', label: 'తెలుగు Telugu' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedLanguageTab(tab.id as any);
                  if (tab.id !== 'all') {
                    const map: Record<string, string> = {
                      hi: 'hi-IN',
                      en: 'en-IN',
                      kn: 'kn-IN',
                      ta: 'ta-IN',
                      te: 'te-IN'
                    };
                    setLanguageCode(map[tab.id] || 'hi-IN');
                  }
                }}
                style={{
                  background: selectedLanguageTab === tab.id ? 'var(--grounded)' : 'var(--bg-input)',
                  color: selectedLanguageTab === tab.id ? '#0f172a' : 'var(--ink-secondary)',
                  border: `1px solid ${selectedLanguageTab === tab.id ? 'var(--grounded)' : 'var(--structural)'}`,
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: selectedLanguageTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="suggested-chips-grid">
          {displayedQueries.map((eq, idx) => (
            <button
              key={idx}
              className={`query-chip ${eq.tag === 'Refusal' ? 'refusal-test-chip' : ''}`}
              onClick={() => {
                setTranscript(eq.text);
                submitQuery(eq.text);
              }}
            >
              <span>{eq.tag === 'Refusal' ? '🛡️' : '🔍'}</span>
              <span className="devanagari">{eq.text}</span>
              <span className="badge-pill brass" style={{ fontSize: '0.6rem', padding: '0.08rem 0.3rem', textTransform: 'uppercase' }}>
                {eq.lang}
              </span>
              {eq.tag === 'Refusal' && (
                <span className="badge-pill rust" style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>
                  REFUSAL TEST
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Precision Control Console ── */}
      <div className="control-console" aria-label="RAG Engine Parameters">
        <div className="control-group">
          <label htmlFor="language-select" className="control-label">Voice Script:</label>
          <select
            id="language-select"
            className="control-select"
            value={languageCode}
            onChange={(e) => {
              setLanguageCode(e.target.value);
              const map: Record<string, string> = {
                'hi-IN': 'Hindi (Devanagari)',
                'en-IN': 'English (Latin)',
                'ta-IN': 'Tamil (தமிழ்)',
                'te-IN': 'Telugu (తెలుగు)',
                'kn-IN': 'Kannada (ಕನ್ನಡ)'
              };
              setDetectedLanguage(map[e.target.value] || e.target.value);
            }}
          >
            <option value="hi-IN">Hindi (हिंदी Devanagari)</option>
            <option value="en-IN">English (India)</option>
            <option value="ta-IN">Tamil (தமிழ்)</option>
            <option value="te-IN">Telugu (తెలుగు)</option>
            <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
          </select>
          {detectedLanguage && (
            <span className="badge-pill lang-tag" title="Auto-detected script from current input text">
              ✨ {detectedLanguage}
            </span>
          )}
        </div>

        <div className="control-group">
          <label htmlFor="strategy-select" className="control-label">Chunking:</label>
          <select
            id="strategy-select"
            className="control-select"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as any)}
          >
            <option value="semantic">Semantic (Meaning-Aware)</option>
            <option value="sentence">Sentence-Aware</option>
            <option value="fixed">Fixed-Size Chunks</option>
          </select>
        </div>

        <label className="toggle-label" htmlFor="rerank-checkbox">
          <input
            id="rerank-checkbox"
            type="checkbox"
            className="toggle-input"
            checked={rerank}
            onChange={(e) => setRerank(e.target.checked)}
          />
          <span>Bigram Positional Reranking</span>
        </label>
      </div>

      {/* ── Active Transcript Editor (When editing query) ── */}
      {(transcript || isEditing) && (
        <div className="ledger-entry-card" style={{ maxWidth: '840px', margin: '0 auto 1.5rem', width: '100%' }}>
          <div className="ledger-card-header">
            <span className="ledger-serial">CURRENT TRANSCRIPT</span>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{ background: 'none', border: 'none', color: 'var(--grounded)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
              >
                Edit ✎
              </button>
            )}
          </div>

          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                aria-label="Edit transcribed query text"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={2}
                className="devanagari"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--structural)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--ink)',
                  fontSize: '1.05rem',
                  outline: 'none',
                  resize: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => { setIsEditing(false); submitQuery(transcript); }}>
                  Ask Edited Query
                </button>
              </div>
            </div>
          ) : (
            <div className="user-spoken-query devanagari">"{transcript}"</div>
          )}
        </div>
      )}

      {/* ── Active Processing State ── */}
      {uiPhase === 'processing' && (
        <div className="ledger-entry-card" style={{ maxWidth: '840px', margin: '0 auto 1.5rem', width: '100%' }}>
          <div className="ledger-card-header">
            <span className="ledger-serial">INQUIRY IN FLIGHT</span>
            <span className="badge-pill brass">PROCESSING</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid var(--structural)', borderTopColor: 'var(--grounded)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--ink)' }}>
              Retrieving evidence from MSMARCO-XI vector database...
            </div>
          </div>
          <div className="settling-waveform-line"></div>
        </div>
      )}

      {/* ── Network Error Banner ── */}
      {uiPhase === 'error' && (
        <div className="ledger-entry-card refusal" style={{ maxWidth: '840px', margin: '0 auto 1.5rem', width: '100%' }}>
          <div className="ledger-card-header">
            <span className="ledger-serial">COMMUNICATION FAULT</span>
            <span className="badge-pill rust">ERROR</span>
          </div>
          <p style={{ color: 'var(--ink)', fontSize: '0.92rem', marginBottom: '1rem' }}>
            "{networkError}"
          </p>
          <button className="btn btn-danger" onClick={() => setUiPhase('idle')}>
            Dismiss
          </button>
        </div>
      )}

      {/* ── Evidence Ledger (History of Inquiries & Evidence Cards) ── */}
      <section className="evidence-ledger-stream" aria-label="Evidence Ledger">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--structural-faint)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Verified Evidence Ledger ({history.length} Inquiries)
          </div>
          {history.length > 0 && (
            <button
              className="btn"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              onClick={() => setHistory([])}
            >
              Clear Ledger
            </button>
          )}
        </div>

        {/* Empty State when no queries asked yet */}
        {history.length === 0 && uiPhase !== 'processing' && (
          <div className="ledger-empty-state">
            <div className="ledger-empty-title">Precision Evidence Ledger Ready</div>
            <p className="ledger-empty-desc">
              Tap the voice transducer above or select a verified Indic inquiry to transcribe speech, perform hybrid retrieval, and inspect factual evidence citations.
            </p>
          </div>
        )}

        {/* Ledger Entries */}
        {history.map((entry) => {
          const isGrounded = entry.result.status === 'GROUNDED_SUCCESS';
          const isRefusal = entry.result.status === 'INSUFFICIENT_CTX';

          return (
            <article
              key={entry.id}
              className={`ledger-entry-card ${isGrounded ? 'grounded' : isRefusal ? 'refusal' : ''}`}
            >
              <div className="ledger-card-header">
                <span className="ledger-serial">
                  {`ENTRY #${entry.serial < 10 ? '0' + entry.serial : entry.serial} · ${entry.timestamp}`}
                </span>
                <div>
                  {isGrounded && (
                    <span className="badge-pill brass">
                      ● GROUNDED EVIDENCE
                    </span>
                  )}
                  {isRefusal && (
                    <span className="badge-pill rust">
                      ● HONEST REFUSAL (NO EVIDENCE)
                    </span>
                  )}
                  {!isGrounded && !isRefusal && (
                    <span className="badge-pill structural">
                      ● {entry.result.status}
                    </span>
                  )}
                </div>
              </div>

              {/* User Spoken Question */}
              <div className="user-spoken-query devanagari">
                "{entry.query}"
              </div>

              {/* Evidence Answer with Signature Settled Waveform Underline */}
              <div className="evidence-answer-body devanagari">
                {isGrounded ? (
                  <span className="grounded-evidence-text">
                    {cleanNaturalAnswer(entry.result.answer)}
                  </span>
                ) : (
                  cleanNaturalAnswer(entry.result.answer) || "No supporting passage was found in MSMARCO-XI for this query."
                )}
              </div>

              {/* Settling Waveform Animation on newly added grounded entries */}
              {isGrounded && <div className="settling-waveform-line"></div>}

              {/* Verified Citations Strip */}
              {entry.result.citations.length > 0 && (
                <div className="citations-strip">
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    Grounded in ·
                  </span>
                  {entry.result.citations.map((cite, i) => (
                    <span key={i} className="citation-tag" title={`Verified Citation: ${cite}`}>
                      {`Source #${i + 1 < 10 ? '0' + (i + 1) : i + 1}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Sources Inspector */}
              {entry.result.sources.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <RetrievalInspector sources={entry.result.sources} strategy={strategy} />
                </div>
              )}

              {/* Pipeline Activity Timeline */}
              {entry.result.telemetry && (
                <div style={{ marginTop: '0.75rem' }}>
                  <PipelineViewer telemetry={entry.result.telemetry} />
                </div>
              )}
            </article>
          );
        })}
      </section>

    </div>
  );
}

export { mapBackendResponse };
