import { useState, useRef, useEffect } from 'react';
import AIAmbientOrb, { OrbState } from './AIAmbientOrb';
import AnswerPanel from './AnswerPanel';
import { QueryResult } from '../types';

interface AskExperienceProps {
  selectedLanguage: string;
}

function getSupportedMimeType(): string {
  const candidateTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/wav'
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of candidateTypes) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch (e) {}
  }
  return '';
}

function detectScript(text: string): { code: string; label: string } {
  if (/[\u0900-\u097F]/.test(text)) return { code: 'hi-IN', label: 'Hindi (हिन्दी)' };
  if (/[\u0B80-\u0BFF]/.test(text)) return { code: 'ta-IN', label: 'Tamil (தமிழ்)' };
  if (/[\u0C00-\u0C7F]/.test(text)) return { code: 'te-IN', label: 'Telugu (తెలుగు)' };
  if (/[\u0C80-\u0CFF]/.test(text)) return { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' };
  if (/[a-zA-Z]/.test(text)) return { code: 'en-IN', label: 'English (Latin)' };
  return { code: 'en-IN', label: 'English (Latin)' };
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
      answer: data.answer || data.reason || "I couldn't find enough information in the available sources to answer that reliably.",
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
      reason: data.error || data.reason || 'Remote Gemini API quota reached. Operating safely with fallback.',
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

export default function AskExperience({
  selectedLanguage
}: AskExperienceProps) {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const [detectedLangLabel, setDetectedLangLabel] = useState<string>('English');
  const [micVolume, setMicVolume] = useState<number>(0);
  const [recordingTimer, setRecordingTimer] = useState<number>(0);
  const [micError, setMicError] = useState<string>('');

  // Recording internals
  const isRecordingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any | null>(null);
  const maxTimeoutRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const MAX_RECORDING_SECONDS = 20;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (maxTimeoutRef.current) clearTimeout(maxTimeoutRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Web Audio Volume Extraction Loop
  function startVolumeTracking(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const track = () => {
        if (!isRecordingRef.current) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1.0, (avg / 128.0) * 1.5);
        setMicVolume(normalized);

        animFrameRef.current = requestAnimationFrame(track);
      };

      track();
    } catch (e) {
      console.warn('[AskExperience] Web Audio volume extraction error:', e);
    }
  }

  function stopVolumeTracking() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicVolume(0);
  }

  // Robust Microphone Recording (DOES NOT PREMATURELY STOP)
  async function startRecording() {
    setMicError('');
    audioChunksRef.current = [];
    setCurrentResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      const actualMime = mediaRecorder.mimeType || mimeType || 'audio/webm';

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        if (audioBlob.size > 0 && isRecordingRef.current === false) {
          handleAudioSubmit(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      mediaRecorder.start(250); // Slice every 250ms

      setOrbState('listening');
      setRecordingTimer(0);

      // Recording timer
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTimer(elapsed);
      }, 250);

      // 20s Max Cap Safety Timeout
      maxTimeoutRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.log('[AskExperience] Maximum recording time (20s) reached.');
          stopRecording();
        }
      }, MAX_RECORDING_SECONDS * 1000);

      startVolumeTracking(stream);
    } catch (err: any) {
      console.error('[AskExperience] Microphone capture error:', err);
      setMicError('Microphone permission denied or device unavailable.');
      setOrbState('idle');
      isRecordingRef.current = false;
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }

    stopVolumeTracking();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function toggleRecording() {
    if (orbState === 'listening') {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Voice Submit API Call with Progressive State Transitions
  async function handleAudioSubmit(audioBlob: Blob) {
    setOrbState('transcribing');
    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 25000);

    // Simulate progressive retrieval/verification state for clear visual feedback
    const t1 = setTimeout(() => {
      setOrbState('retrieving');
    }, 1200);

    const t2 = setTimeout(() => {
      setOrbState('verifying');
    }, 2200);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'query.webm');
      formData.append('strategy', 'semantic');
      formData.append('rerank', 'true');
      formData.append('languageCode', selectedLanguage);

      const res = await fetch('/api/voice-query', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(clientTimeout);
      clearTimeout(t1);
      clearTimeout(t2);

      const data = await res.json();
      const mapped = mapBackendResponse(data, res.status);

      const transcriptText = data.transcript || 'Spoken Indic Query';
      setActiveQuery(transcriptText);

      const detected = detectScript(transcriptText);
      setDetectedLangLabel(detected.label);

      setCurrentResult(mapped);

      if (mapped.status === 'GROUNDED_SUCCESS') {
        setOrbState('success');
      } else if (mapped.status === 'INSUFFICIENT_CTX') {
        setOrbState('refused');
      } else {
        setOrbState('error');
      }
    } catch (err: any) {
      clearTimeout(clientTimeout);
      clearTimeout(t1);
      clearTimeout(t2);
      console.error('[AskExperience] Voice Query Error:', err);
      setCurrentResult({
        status: 'SERVER_ERROR',
        answer: '',
        citations: [],
        sources: [],
        telemetry: null,
        reason: err.name === 'AbortError' ? 'Voice processing timed out after 25s.' : 'Voice connection failed.'
      });
      setOrbState('error');
    }
  }

  // Text Submit API Call with Progressive State Transitions
  async function handleTextSubmit(text: string) {
    if (!text || text.trim().length === 0) return;
    const cleanText = text.trim();
    setActiveQuery(cleanText);
    setQueryInput('');
    setCurrentResult(null);
    setOrbState('retrieving');

    const detected = detectScript(cleanText);
    setDetectedLangLabel(detected.label);
    const targetLangCode = detected.code.split('-')[0].toLowerCase();

    const tVerify = setTimeout(() => {
      setOrbState('verifying');
    }, 400);

    const tAnswer = setTimeout(() => {
      setOrbState('answering');
    }, 800);

    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cleanText,
          strategy: 'semantic',
          rerank: true,
          languageCode: targetLangCode
        }),
        signal: controller.signal
      });

      clearTimeout(clientTimeout);
      clearTimeout(tVerify);
      clearTimeout(tAnswer);

      const data = await res.json();
      const mapped = mapBackendResponse(data, res.status);
      setCurrentResult(mapped);

      if (mapped.status === 'GROUNDED_SUCCESS') {
        setOrbState('success');
      } else if (mapped.status === 'INSUFFICIENT_CTX') {
        setOrbState('refused');
      } else {
        setOrbState('error');
      }
    } catch (err: any) {
      clearTimeout(clientTimeout);
      clearTimeout(tVerify);
      clearTimeout(tAnswer);
      console.error('[AskExperience] Text Query Error:', err);
      setCurrentResult({
        status: 'SERVER_ERROR',
        answer: '',
        citations: [],
        sources: [],
        telemetry: null,
        reason: err.name === 'AbortError' ? 'Query timed out after 20s.' : 'Network connection interrupted.'
      });
      setOrbState('error');
    }
  }

  // Real official MSMARCO-XI suggestions organized by language
  const officialSuggestions: Record<string, { text: string; label: string; lang: string; tag: string }[]> = {
    all: [
      { text: "what is a corporation?", label: "Corporation", lang: "EN", tag: "Finance" },
      { text: "ताजमहल कहाँ स्थित है?", label: "ताजमहल", lang: "HI", tag: "History" },
      { text: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", label: "ಕಾರ್ಪೊರೇಷನ್", lang: "KN", tag: "Finance" },
      { text: "ஒரு நிறுவனம் என்பது என்ன?", label: "நிறுவனம்", lang: "TA", tag: "Finance" },
      { text: "తాజ్ మహల్ ఎక్కడ ఉంది?", label: "తాజ్ మహల్", lang: "TE", tag: "History" },
      { text: "Who is India Prime Minister?", label: "Prime Minister", lang: "EN", tag: "Refusal Test" }
    ],
    en: [
      { text: "what is a corporation?", label: "Corporation", lang: "EN", tag: "Finance" },
      { text: "Where is the Taj Mahal located?", label: "Taj Mahal", lang: "EN", tag: "History" },
      { text: "why did rachel carson write silent spring", label: "Rachel Carson", lang: "EN", tag: "Literature" },
      { text: "Who is India Prime Minister?", label: "Prime Minister", lang: "EN", tag: "Refusal Test" }
    ],
    hi: [
      { text: "कॉर्पोरेशन क्या है?", label: "कॉर्पोरेशन", lang: "HI", tag: "Finance" },
      { text: "ताजमहल कहाँ स्थित है?", label: "ताजमहल", lang: "HI", tag: "History" },
      { text: "रेचल कार्सन ने क्यों एक दायित्व बर्दाश्त करने के लिए लिखा", label: "रेचल कार्सन", lang: "HI", tag: "Literature" },
      { text: "जापान की राजधानी क्या है?", label: "जापान", lang: "HI", tag: "Refusal Test" }
    ],
    kn: [
      { text: "ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?", label: "ಕಾರ್ಪೊರೇಷನ್", lang: "KN", tag: "Finance" },
      { text: "ತಾಜ್ ಮಹಲ್ ಎಲ್ಲಿದೆ?", label: "ತಾಜ್ ಮಹಲ್", lang: "KN", tag: "History" },
      { text: "ರಾಚೆಲ್ ಕಾರ್ಸನ್ ಸೈಲೆಂಟ್ ಸ್ಪ್ರಿಂಗ್ ಏಕೆ ಬರೆದರು", label: "ರಾಚೆಲ್ ಕಾರ್ಸನ್", lang: "KN", tag: "Literature" },
      { text: "ಜಪಾನ್ ದೇಶದ ರಾಜಧಾನಿ ಯಾವುದು?", label: "ಜಪಾನ್", lang: "KN", tag: "Refusal Test" }
    ],
    ta: [
      { text: "ஒரு நிறுவனம் என்பது என்ன?", label: "நிறுவனம்", lang: "TA", tag: "Finance" },
      { text: "தாஜ்மஹால் எங்கே உள்ளது?", label: "தாஜ்மஹால்", lang: "TA", tag: "History" },
      { text: "ரேச்சல் கார்சன் ஏன் அமைதியான வசந்தத்தை எழுதினார்", label: "ரேச்சல் கார்சன்", lang: "TA", tag: "Literature" },
      { text: "ஜப்பானின் தலைநகரம் எது?", label: "ஜப்பான்", lang: "TA", tag: "Refusal Test" }
    ],
    te: [
      { text: "కార్పొరేషన్ అంటే ఏమిటి?", label: "కార్పొరేషన్", lang: "TE", tag: "Finance" },
      { text: "తాజ్ మహల్ ఎక్కడ ఉంది?", label: "తాజ్ మహల్", lang: "TE", tag: "History" },
      { text: "రాచెల్ కార్సన్ సైలెంట్ స్ప్రింగ్ ఎందుకు రాశారు", label: "రాచెల్ కార్సన్", lang: "TE", tag: "Literature" },
      { text: "జపాన్ రాజధాని ఏమిటి?", label: "జపాన్", lang: "TE", tag: "Refusal Test" }
    ]
  };

  const currentLangKey = selectedLanguage.split('-')[0].toLowerCase();
  const displayedSuggestions = officialSuggestions[currentLangKey] || officialSuggestions.all;

  const isBusy = orbState === 'listening' || orbState === 'transcribing' || orbState === 'retrieving' || orbState === 'verifying' || orbState === 'answering';

  return (
    <div className="ask-experience-container">
      {/* ── Minimal Cinematic Masthead ── */}
      {!currentResult && (
        <section className="hero-cinematic-masthead">
          <div className="hero-eyebrow-pill">
            <span className="eyebrow-sparkle">✦</span>
            <span>VOICE-FIRST • EVIDENCE GROUNDED • #RAGGOA</span>
          </div>

          <h1 className="hero-main-title">
            Ask anything.<br />
            <span className="hero-title-shimmer">We'll find the evidence.</span>
          </h1>

          <p className="hero-main-subtitle">
            Speak or type in English, Hindi, Kannada, Tamil, or Telugu. RAGGoa retrieves verified passages from MSMARCO-XI before answering.
          </p>
        </section>
      )}

      {/* ── Central Intelligent Living 3D Orb ── */}
      <section className="hero-orb-stage" aria-label="Microphone Interaction Orb">
        <AIAmbientOrb
          state={orbState}
          audioVolume={micVolume}
          onClick={toggleRecording}
          timerSeconds={recordingTimer}
        />

        {micError && (
          <div className="mic-error-toast" role="alert">
            <span>⚠️ {micError}</span>
          </div>
        )}
      </section>

      {/* ── Floating Refined Command Bar ── */}
      <section className="hero-input-stage">
        <form
          className="floating-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleTextSubmit(queryInput);
          }}
        >
          <input
            type="text"
            className="floating-text-field"
            placeholder={
              orbState === 'listening' 
                ? "Listening to speech... (tap orb when done)" 
                : isBusy 
                ? "Searching evidence in MSMARCO-XI..." 
                : "Ask anything in English, हिन्दी, ಕನ್ನಡ, தமிழ், తెలుగు... 🎙 →"
            }
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            disabled={isBusy}
            aria-label="Ask a question"
          />

          <div className="input-actions-group">
            <button
              type="button"
              className={`input-mic-btn ${orbState === 'listening' ? 'active-listening' : ''}`}
              onClick={toggleRecording}
              title={orbState === 'listening' ? "Stop recording" : "Record voice question"}
              aria-label="Toggle voice recording"
            >
              {orbState === 'listening' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>

            <button
              type="submit"
              className="input-submit-btn"
              disabled={!queryInput.trim() || isBusy}
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
      </section>

      {/* ── Official MSMARCO-XI Suggestion Pills ── */}
      {!currentResult && (
        <section className="hero-suggestions-section" aria-label="Sample Inquiries">
          <div className="suggestions-header-label">Verified MSMARCO-XI Questions:</div>
          <div className="suggestions-pill-grid">
            {displayedSuggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="suggestion-chip-btn"
                onClick={() => handleTextSubmit(item.text)}
              >
                <span className="suggestion-lang-badge">{item.lang}</span>
                <span className="suggestion-text">{item.text}</span>
                <span className="suggestion-tag">{item.tag}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Conversational Evidence / Answer Panel ── */}
      {currentResult && (
        <AnswerPanel
          query={activeQuery}
          result={currentResult}
          detectedLanguage={detectedLangLabel}
          onAskAnother={() => {
            setCurrentResult(null);
            setOrbState('idle');
            setQueryInput('');
          }}
          onRefineQuestion={(txt) => {
            setCurrentResult(null);
            setOrbState('idle');
            setQueryInput(txt);
          }}
        />
      )}
    </div>
  );
}
