import { useState, useEffect, useRef } from 'react';
import { QueryResult } from './types';
import ObservabilityLab from './components/ObservabilityLab';
import InstrumentBus from './components/InstrumentBus';

export type PipelineState = 
  | 'idle' 
  | 'listening' 
  | 'transcribing' 
  | 'retrieving' 
  | 'answering' 
  | 'grounded' 
  | 'fallback'
  | 'refused' 
  | 'error';

export type AppTab = 'ask' | 'observability' | 'architecture';

interface HealthStatus {
  status: string;
  database: {
    loaded: boolean;
    size: number;
  };
  services: {
    rag: string;
    vectorStore: string;
    stt: string;
    generation: string;
    isLive?: boolean;
  };
  timestamp: string;
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

function detectScript(text: string): { code: string; label: string; fontClass: string } {
  if (/[\u0900-\u097F]/.test(text)) return { code: 'hi-IN', label: 'Hindi (हिन्दी)', fontClass: 'indic-hi' };
  if (/[\u0B80-\u0BFF]/.test(text)) return { code: 'ta-IN', label: 'Tamil (தமிழ்)', fontClass: 'indic-ta' };
  if (/[\u0C00-\u0C7F]/.test(text)) return { code: 'te-IN', label: 'Telugu (తెలుగు)', fontClass: 'indic-te' };
  if (/[\u0C80-\u0CFF]/.test(text)) return { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)', fontClass: 'indic-kn' };
  return { code: 'en-IN', label: 'English', fontClass: '' };
}

function mapBackendResponse(data: any, httpStatus: number): QueryResult {
  const backendStatus: string = data.status || '';

  if (backendStatus === 'success') {
    return {
      status: 'GROUNDED_SUCCESS',
      answer: data.answer || '',
      source: 'msmarco_grounded',
      citations: Array.isArray(data.citations) ? data.citations : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
      telemetry: data.telemetry ?? null,
      httpStatus,
      transcript: data.transcript,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  if (backendStatus === 'gemini_fallback' || data.source === 'gemini_general') {
    return {
      status: 'GEMINI_FALLBACK',
      answer: data.answer || '',
      source: 'gemini_general',
      disclosure: data.disclosure || 'Answered from general knowledge (Gemini) — not verified against the MSMARCO-XI dataset.',
      citations: [],
      sources: [],
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
      source: 'guardrail_refusal',
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

  if (httpStatus === 400 || backendStatus === 'validation_error' || backendStatus === 'guardrail_blocked' || backendStatus === 'error') {
    return {
      status: 'VALIDATION_ERROR',
      answer: '',
      source: 'guardrail_refusal',
      citations: [],
      sources: [],
      telemetry: data.telemetry ?? null,
      reason: data.error || data.message || data.reason || 'Query was flagged by safety or sanity guardrails.',
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

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('ask');
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en-IN');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLive, setIsLive] = useState<boolean>(true);

  // Inquiry & Results State
  const [queryInput, setQueryInput] = useState<string>('');
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const [detectedScriptInfo, setDetectedScriptInfo] = useState<{ code: string; label: string; fontClass: string }>({
    code: 'en-IN',
    label: 'English',
    fontClass: ''
  });

  // Real Web Audio Waveform state
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(24).fill(12));
  const [recordingTimer, setRecordingTimer] = useState<number>(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(true);

  // Audio recording refs
  const isRecordingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any | null>(null);
  const maxTimeoutRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any | null>(null);
  const liveTranscriptRef = useRef<string>('');
  const silenceTimeoutRef = useRef<any | null>(null);

  const MAX_RECORDING_SECONDS = 20;

  // Google Assistant Style Neural Multilingual Text-to-Speech (TTS)
  function stopSpeech() {
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      } catch (e) {}
      activeAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    setIsSpeaking(false);
  }

  async function speakText(rawText: string, langCode: string) {
    stopSpeech();

    // Clean text to sound natural like Google Assistant
    const cleanSpeechText = rawText
      .replace(/^Based on (?:sources?|retrieved context|the provided context)?\s*\[[^\]]+\]:?\s*/i, '')
      .replace(/\[Source\s*\d+\]/gi, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\[msmarco-[^\]]+\]/gi, '')
      .replace(/[*#_`~>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanSpeechText) return;

    const langPrefix = (langCode || selectedLanguage || 'hi-IN').split('-')[0].toLowerCase();

    // Instant zero-delay voice readout for English
    if (langPrefix === 'en' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(v => v.lang.toLowerCase().includes('en-in')) || 
                        voices.find(v => v.lang.toLowerCase().startsWith('en'));
        if (enVoice) utterance.voice = enVoice;
        utterance.lang = 'en-IN';
        utterance.rate = 1.0;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        return;
      } catch (e) {}
    }

    // High-Fidelity Indic Neural Audio via Sarvam Bulbul TTS (/api/tts)
    try {
      setIsSpeaking(true);
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanSpeechText,
          languageCode: langCode || selectedLanguage || 'hi-IN'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audio) {
          const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
          activeAudioRef.current = audio;
          audio.onended = () => {
            setIsSpeaking(false);
            activeAudioRef.current = null;
          };
          audio.onerror = () => {
            setIsSpeaking(false);
            activeAudioRef.current = null;
          };
          await audio.play();
          return;
        }
      }
    } catch (apiErr) {
      console.warn("[TTS] Sarvam backend TTS failed, using browser Web Speech fallback:", apiErr);
    }

    // Fallback: Browser Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = (langCode || 'en-IN').split('-')[0].toLowerCase();

        const matchingVoice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix)) ||
                              voices.find(v => v.lang.toLowerCase().includes(langPrefix));

        if (matchingVoice) {
          utterance.voice = matchingVoice;
          utterance.lang = matchingVoice.lang;
        } else {
          utterance.lang = langCode || 'en-IN';
        }

        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("Browser speech synthesis error:", e);
        setIsSpeaking(false);
      }
    } else {
      setIsSpeaking(false);
    }
  }

  // Pre-load browser speech voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
    return () => {
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json() as HealthStatus;
          setHealth(data);
          if (data.services?.isLive !== undefined) {
            setIsLive(Boolean(data.services.isLive));
          }
        }
      } catch (err) {
        console.error("Health check error:", err);
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Idle Waveform Gentle Harmonic Pulse Loop
  useEffect(() => {
    if (pipelineState === 'listening' || activeTab !== 'ask') return;
    let step = 0;
    const idleInterval = setInterval(() => {
      step += 0.15;
      const newLevels = Array.from({ length: 24 }, (_, i) => {
        const wave = Math.sin(step + i * 0.35);
        if (pipelineState === 'transcribing' || pipelineState === 'retrieving') {
          return 16 + Math.abs(Math.sin(step * 2 + i * 0.5)) * 24;
        }
        return 10 + Math.abs(wave) * 16;
      });
      setAudioLevels(newLevels);
    }, 50);
    return () => clearInterval(idleInterval);
  }, [pipelineState, activeTab]);

  // Real Web Audio Amplitude Extraction
  function startVolumeTracking(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const track = () => {
        if (!isRecordingRef.current) return;
        analyser.getByteFrequencyData(dataArray);

        // Map 24 bars to frequency bins
        const barHeights: number[] = [];
        const binStep = Math.max(1, Math.floor(dataArray.length / 24));
        for (let i = 0; i < 24; i++) {
          const val = dataArray[i * binStep] || 0;
          const normalized = Math.max(8, Math.min(56, (val / 255) * 56));
          barHeights.push(normalized);
        }
        setAudioLevels(barHeights);

        animFrameRef.current = requestAnimationFrame(track);
      };

      track();
    } catch (e) {
      console.warn('[App] Web Audio error:', e);
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
  }

  // Voice Recording Lifecycle with Zero-Latency Real-Time Recognition & Auto-Silence Detection
  async function startRecording() {
    setMicError('');
    audioChunksRef.current = [];
    liveTranscriptRef.current = '';
    setCurrentResult(null);

    // Initialize Real-Time Web Speech Recognition for instant 0ms STT
    if (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) {
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLanguage || 'hi-IN';

        recognition.onresult = (event: any) => {
          let textAccum = '';
          for (let i = 0; i < event.results.length; i++) {
            textAccum += event.results[i][0].transcript + ' ';
          }
          const cleanAcc = textAccum.trim();
          if (cleanAcc) {
            liveTranscriptRef.current = cleanAcc;
            setActiveQuery(cleanAcc);

            // Auto-Submit on Silence (fires 750ms after user pauses speaking)
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = setTimeout(() => {
              if (isRecordingRef.current && liveTranscriptRef.current) {
                stopRecording();
              }
            }, 750);
          }
        };

        recognition.onerror = () => {};
        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch (e) {
        console.warn("[App] Speech recognition init failed, using audio fallback:", e);
      }
    }

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

        // If real-time transcript was captured, dispatch text query immediately (0ms STT latency!)
        if (liveTranscriptRef.current && liveTranscriptRef.current.trim().length > 0) {
          const finalPrompt = liveTranscriptRef.current.trim();
          liveTranscriptRef.current = '';
          handleTextSubmit(finalPrompt);
          return;
        }

        // Otherwise fallback to Sarvam AI cloud audio transcription
        if (audioBlob.size > 0 && isRecordingRef.current === false) {
          handleAudioSubmit(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      mediaRecorder.start(250);

      setPipelineState('listening');
      setRecordingTimer(0);

      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTimer(elapsed);
      }, 250);

      maxTimeoutRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          stopRecording();
        }
      }, MAX_RECORDING_SECONDS * 1000);

      startVolumeTracking(stream);
    } catch (err: any) {
      console.error('[App] Mic error:', err);
      setMicError('Microphone permission denied or device unavailable.');
      setPipelineState('idle');
      isRecordingRef.current = false;
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }

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
    if (pipelineState === 'listening') {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Voice Submit Endpoint
  async function handleAudioSubmit(audioBlob: Blob) {
    setPipelineState('transcribing');
    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 25000);

    const tRetrieving = setTimeout(() => setPipelineState('retrieving'), 1300);

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
      clearTimeout(tRetrieving);

      const data = await res.json();
      const mapped = mapBackendResponse(data, res.status);

      const transcriptText = data.transcript || 'Spoken Indic Query';
      const script = detectScript(transcriptText);
      setActiveQuery(transcriptText);
      setDetectedScriptInfo(script);
      setCurrentResult(mapped);

      if (mapped.status === 'GROUNDED_SUCCESS') {
        setPipelineState('grounded');
        if (autoSpeak && mapped.answer) {
          speakText(mapped.answer, script.code);
        }
      } else if (mapped.status === 'GEMINI_FALLBACK') {
        setPipelineState('fallback');
        if (autoSpeak && mapped.answer) {
          speakText(mapped.answer, script.code);
        }
      } else {
        setPipelineState('refused');
        if (autoSpeak && (mapped.reason || mapped.answer)) {
          speakText(mapped.reason || mapped.answer, script.code);
        }
      }
    } catch (err: any) {
      clearTimeout(clientTimeout);
      clearTimeout(tRetrieving);
      console.error('[App] Voice submit error:', err);
      setCurrentResult({
        status: 'SERVER_ERROR',
        answer: '',
        citations: [],
        sources: [],
        telemetry: null,
        reason: err.name === 'AbortError' ? 'Voice processing timed out after 25s.' : 'Voice connection interrupted.'
      });
      setPipelineState('error');
    }
  }

  // Text Submit Endpoint
  async function handleTextSubmit(text: string) {
    if (!text || text.trim().length === 0) return;
    stopSpeech();
    const cleanText = text.trim();
    setActiveQuery(cleanText);
    setQueryInput('');
    setCurrentResult(null);
    setPipelineState('retrieving');

    const scriptInfo = detectScript(cleanText);
    setDetectedScriptInfo(scriptInfo);
    const targetLangCode = scriptInfo.code.split('-')[0].toLowerCase();

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

      const data = await res.json();
      const mapped = mapBackendResponse(data, res.status);
      setCurrentResult(mapped);

      if (mapped.status === 'GROUNDED_SUCCESS') {
        setPipelineState('grounded');
        if (autoSpeak && mapped.answer) {
          speakText(mapped.answer, scriptInfo.code);
        }
      } else if (mapped.status === 'GEMINI_FALLBACK') {
        setPipelineState('fallback');
        if (autoSpeak && mapped.answer) {
          speakText(mapped.answer, scriptInfo.code);
        }
      } else {
        setPipelineState('refused');
        if (autoSpeak && (mapped.reason || mapped.answer)) {
          speakText(mapped.reason || mapped.answer, scriptInfo.code);
        }
      }
    } catch (err: any) {
      clearTimeout(clientTimeout);
      console.error('[App] Text submit error:', err);
      setCurrentResult({
        status: 'SERVER_ERROR',
        answer: '',
        citations: [],
        sources: [],
        telemetry: null,
        reason: err.name === 'AbortError' ? 'Query timed out after 20s.' : 'Network connection interrupted.'
      });
      setPipelineState('error');
    }
  }

  // Active processing timer for progressive loading feedback
  const [busyTimer, setBusyTimer] = useState<number>(0);

  useEffect(() => {
    let interval: any = null;
    if (pipelineState === 'transcribing' || pipelineState === 'retrieving') {
      setBusyTimer(0);
      interval = setInterval(() => {
        setBusyTimer(t => t + 1);
      }, 1000);
    } else {
      setBusyTimer(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pipelineState]);

  // Dynamic Headline and Subtitles mapping
  const getHeadline = () => {
    if (pipelineState === 'listening') return 'Listening...';
    if (pipelineState === 'transcribing') return 'Understanding...';
    if (pipelineState === 'retrieving') return busyTimer >= 2 ? 'Synthesizing...' : 'Finding Evidence...';
    if (pipelineState === 'grounded') return 'Evidence Verified.';
    if (pipelineState === 'fallback') return 'General Knowledge Answer.';
    if (pipelineState === 'refused') return 'Request Refused.';
    return 'Ask Anything.';
  };

  const getSubtitle = () => {
    if (pipelineState === 'listening') return 'Speak naturally in English or your native Indian language...';
    if (pipelineState === 'transcribing') return 'Sarvam Saaras v3 decoding audio buffer...';
    if (pipelineState === 'retrieving') {
      if (busyTimer >= 3) return '⚡ Synthesizing response via Indic AI model cascade...';
      if (busyTimer >= 1) return '⚡ Searching 84,667 MSMARCO-XI chunks & verifying evidence...';
      return 'Searching 84,667 MSMARCO-XI passage chunks...';
    }
    if (pipelineState === 'grounded') return 'Answer synthesized exclusively from verified retrieved passages.';
    if (pipelineState === 'fallback') return 'Out-of-corpus inquiry: answered via general knowledge (Gemini).';
    if (pipelineState === 'refused') return 'Query blocked by safety or validity guardrails.';
    return "Speak in English or an Indian language — we'll find the evidence.";
  };

  const getButtonLabel = () => {
    if (pipelineState === 'listening') return `Stop (${recordingTimer}s)`;
    if (pipelineState === 'transcribing') return 'Transcribing...';
    if (pipelineState === 'retrieving') return busyTimer >= 2 ? 'Synthesizing...' : 'Searching...';
    if (pipelineState === 'grounded' || pipelineState === 'fallback' || pipelineState === 'refused' || pipelineState === 'error') return 'Tap to Speak Again';
    return 'Tap to Speak';
  };

  const isBusy = pipelineState === 'transcribing' || pipelineState === 'retrieving';

  const cleanAnswer = (currentResult?.answer || '')
    .replace(/^Based on (?:sources?|retrieved context|the provided context)?\s*\[[^\]]+\]:?\s*/i, '')
    .replace(/\[msmarco-[^\]]+\]/gi, '')
    .trim();

  return (
    <div className="wellness-app-canvas">
      
      {/* ── Top Navigation Bar ── */}
      <header className="wellness-top-bar" role="banner">
        <div 
          className="top-bar-brand" 
          onClick={() => { setActiveTab('ask'); setPipelineState('idle'); setCurrentResult(null); }}
          title="RAGWave — Voice-Enabled Indic RAG"
        >
          {/* Custom RAGWave Neural Audio Wave Logo Badge */}
          <div className="ragwave-logo-badge" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12C3 12 4.5 7 7.5 7C10.5 7 10.5 17 13.5 17C16.5 17 18 12 18 12" stroke="url(#ragwave-grad-1)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 12C6 12 7.5 9 9.5 9C11.5 9 12.5 15 14.5 15C16.5 15 18 12 21 12" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
              <circle cx="13.5" cy="17" r="1.6" fill="#F472B6" />
              <circle cx="7.5" cy="7" r="1.6" fill="#818CF8" />
              <defs>
                <linearGradient id="ragwave-grad-1" x1="3" y1="7" x2="21" y2="17" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#818CF8" />
                  <stop offset="0.5" stopColor="#C084FC" />
                  <stop offset="1" stopColor="#F472B6" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="brand-text-wrap">
            <span className="brand-name-rag">RAG</span>
            <span className="brand-name-wave">Wave</span>
          </div>
        </div>

        {/* 3-Way High-Contrast Segmented Navigation Pill */}
        <nav className="nav-segmented-pill-container" aria-label="Main Views">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'ask' ? 'active' : ''}`}
            onClick={() => setActiveTab('ask')}
          >
            Ask
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'observability' ? 'active' : ''}`}
            onClick={() => { setActiveTab('observability'); setCurrentResult(null); }}
          >
            Observability
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => { setActiveTab('architecture'); setCurrentResult(null); }}
          >
            Architecture
          </button>
        </nav>

        {/* Right Controls: Live status & Language Switcher */}
        <div className="top-bar-meta">
          <div className="live-status-pill" title="System Status & Loaded Chunks">
            <span className="status-dot" />
            <span>{isLive ? 'LIVE' : 'SIMULATION'} • {(health?.database?.size ?? 11436).toLocaleString()} chunks</span>
          </div>

          <div className="lang-selector-group" aria-label="Language Selector">
            {[
              { code: 'en-IN', label: 'EN' },
              { code: 'hi-IN', label: 'HI' },
              { code: 'kn-IN', label: 'KN' },
              { code: 'ta-IN', label: 'TA' },
              { code: 'te-IN', label: 'TE' }
            ].map(l => (
              <button
                key={l.code}
                type="button"
                className={`lang-chip-btn ${selectedLanguage.startsWith(l.code.split('-')[0]) ? 'active' : ''}`}
                onClick={() => setSelectedLanguage(l.code)}
                title={`Select ${l.label} language context`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── View 1: Primary Voice & Evidence Screen (Ask) ── */}
      {activeTab === 'ask' && (
        <main className="wellness-main-stage" role="main">
          
          {/* Headline & Subtitle */}
          <div className="wellness-hero-text">
            <h1 className="wellness-headline">{getHeadline()}</h1>
            <p className="wellness-subtitle">{getSubtitle()}</p>
          </div>

          {/* Badge Pill ("Analyzed by AI Voice Assistant" Style) */}
          <div className="wellness-badge-pill">
            <span className="badge-sparkle">⚡</span>
            <span>Voice &amp; Evidence Engine Ready</span>
          </div>

          {/* Live Audio Reactive Waveform */}
          <div className="wellness-waveform-container" aria-label="Audio Waveform Visualizer">
            {audioLevels.map((height, idx) => (
              <div
                key={idx}
                className={`waveform-bar ${pipelineState === 'listening' ? 'listening' : ''}`}
                style={{ height: `${height}px` }}
              />
            ))}
          </div>

          {/* Big Circular Primary Action Button with Dynamic Animations */}
          <div className="wellness-primary-button-wrap">
            <button
              type="button"
              className={`wellness-outer-circle ${isBusy ? 'is-thinking disabled' : ''} ${pipelineState === 'listening' ? 'is-listening' : ''}`}
              onClick={toggleRecording}
              disabled={isBusy}
              aria-label={getButtonLabel()}
            >
              {/* Radiant Multi-Color Aurora Glow in Background when Searching/Thinking */}
              {isBusy && <div className="aurora-glow-ring" />}
              {/* Rotating Conic Multi-Color Shimmer Border */}
              {isBusy && <div className="conic-spinner-border" />}

              <div className="wellness-inner-core">
                {pipelineState === 'listening' ? (
                  // Stop / Pause Icon
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2.5" />
                  </svg>
                ) : (pipelineState === 'transcribing' || pipelineState === 'retrieving') ? (
                  // Gorgeous Luminous AI Thinking Orb with Waveform Bars
                  <div className="ai-thinking-orb">
                    <div className="ai-orb-ring" />
                    <div className="ai-orb-wave-bars">
                      <span className="ai-wave-bar" />
                      <span className="ai-wave-bar" />
                      <span className="ai-wave-bar" />
                      <span className="ai-wave-bar" />
                      <span className="ai-wave-bar" />
                    </div>
                  </div>
                ) : pipelineState === 'refused' ? (
                  // Shield Refusal Icon
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                ) : pipelineState === 'fallback' ? (
                  // General Knowledge Sparkle Icon
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                  </svg>
                ) : (
                  // Microphone Icon
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </div>
            </button>

            <span className={`button-state-caption ${isBusy ? 'is-shimmer' : ''}`}>
              {isBusy && <span className="badge-sparkle">✦</span>}
              {getButtonLabel()}
            </span>
          </div>

          {/* ── Or Divider & Parallel Text Input ── */}
          {!currentResult && (
            <>
              <div className="or-divider" aria-hidden="true">
                <span className="or-line" />
                <span className="or-text">or</span>
                <span className="or-line" />
              </div>

              <form
                className="wellness-command-bar"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTextSubmit(queryInput);
                }}
                role="search"
              >
                <input
                  type="text"
                  className="command-input-field"
                  placeholder="Or type your question in English or Indic..."
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  disabled={isBusy || pipelineState === 'listening'}
                  aria-label="Type your question"
                />
                <button
                  type="submit"
                  className="command-submit-circle"
                  disabled={!queryInput.trim() || isBusy}
                  title="Submit inquiry"
                  aria-label="Submit question"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </form>
            </>
          )}

          {micError && (
            <div style={{ color: 'var(--accent-refusal)', fontSize: '0.85rem' }}>
              ⚠️ {micError}
            </div>
          )}

          {/* ── 3 DISTINCT, HONEST STATES ── */}
          {currentResult && (
            <div className="wellness-answer-card">
              
              {/* Card Header */}
              <div className="answer-card-header">
                <span className="answer-spoken-query">
                  "{activeQuery}"
                </span>
                
                {/* State 1: Grounded Success */}
                {currentResult.status === 'GROUNDED_SUCCESS' && (
                  <span className="answer-badge-grounded">
                    ✓ Verified Grounded (MSMARCO-XI)
                  </span>
                )}

                {/* State 2: General Knowledge (Gemini Fallback) */}
                {currentResult.status === 'GEMINI_FALLBACK' && (
                  <span style={{ color: '#7DD3FC', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
                    ✦ General Knowledge (Gemini Fallback)
                  </span>
                )}

                {/* State 3: Refusal / Guardrail Blocked */}
                {(currentResult.status === 'INSUFFICIENT_CTX' || currentResult.status === 'VALIDATION_ERROR') && (
                  <span className="answer-badge-refused">
                    ✗ Refusal / Guardrail Blocked
                  </span>
                )}
              </div>

              {/* State 1 Body: Grounded Answer with Cited Passage */}
              {currentResult.status === 'GROUNDED_SUCCESS' && (
                <>
                  <p className={`answer-body-prose ${detectedScriptInfo.fontClass}`}>
                    {cleanAnswer}
                  </p>

                  {currentResult.sources && currentResult.sources[0] && (
                    <div className="answer-citation-snippet">
                      <strong>Cited Evidence [01]:</strong> "{(currentResult.sources[0].text || '').slice(0, 160)}..."
                    </div>
                  )}
                </>
              )}

              {/* State 2 Body: General Knowledge Fallback with Explicit Disclosure */}
              {currentResult.status === 'GEMINI_FALLBACK' && (
                <>
                  <div style={{ background: 'rgba(56, 189, 248, 0.16)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '12px', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#BAE6FD', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>ℹ</span>
                    <span><strong>General Knowledge:</strong> Not verified against the MSMARCO-XI dataset.</span>
                  </div>

                  <p className={`answer-body-prose ${detectedScriptInfo.fontClass}`}>
                    {cleanAnswer}
                  </p>
                </>
              )}

              {/* State 3 Body: Guardrail / Refusal */}
              {(currentResult.status === 'INSUFFICIENT_CTX' || currentResult.status === 'VALIDATION_ERROR') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p className="answer-body-prose" style={{ color: 'var(--accent-refusal)', fontSize: '1.05rem' }}>
                    {currentResult.reason || currentResult.answer || "Query was rejected by safety or sanity guardrails."}
                  </p>
                  <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.65)' }}>
                    RAGWave strictly enforces safety boundaries and will not answer dangerous or gibberish prompts.
                  </span>
                </div>
              )}

              {/* ── Google Assistant Spoken Voice Output Bar ── */}
              <div className="answer-voice-bar">
                <button
                  type="button"
                  className={`btn-voice-speak ${isSpeaking ? 'speaking' : ''}`}
                  onClick={() => {
                    if (isSpeaking) {
                      stopSpeech();
                    } else {
                      speakText(cleanAnswer || currentResult.answer || currentResult.reason || '', detectedScriptInfo.code);
                    }
                  }}
                  title={isSpeaking ? "Stop speaking" : "Listen to answer (Google Assistant voice)"}
                  aria-label={isSpeaking ? "Stop spoken answer" : "Speak answer aloud"}
                >
                  {isSpeaking ? (
                    <>
                      <div className="voice-equalizer-anim">
                        <span className="eq-bar eq-1" />
                        <span className="eq-bar eq-2" />
                        <span className="eq-bar eq-3" />
                        <span className="eq-bar eq-4" />
                      </div>
                      <span>Speaking ({detectedScriptInfo.label.split(' ')[0]})... Tap to Stop</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                      <span>Listen to Answer ({detectedScriptInfo.label.split(' ')[0]})</span>
                    </>
                  )}
                </button>

                <label className="auto-speak-toggle" title="Automatically read aloud answers like Google Assistant">
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                  />
                  <span className="toggle-label">Auto-speak</span>
                </label>
              </div>

            </div>
          )}

          {/* ── Sample Quick Question Pills ── */}
          {!currentResult && (
            <div className="wellness-sample-pills">
              {[
                { q: "what is a corporation?", label: "Corporation (EN · Grounded)", type: 'grounded' },
                { q: "निगम क्या है?", label: "निगम क्या है? (HI · Grounded)", type: 'grounded' },
                { q: "ನಿಗಮ ಎಂದರೇನು?", label: "ನಿಗಮ ಎಂದರೇನು? (KN · Grounded)", type: 'grounded' },
                { q: "கார்ப்பரேஷன் என்றால் என்ன?", label: "கார்ப்பரேஷன்? (TA · Grounded)", type: 'grounded' },
                { q: "కార్పొరేషన్ అంటే ఏమిటి?", label: "కార్పొరేషన్? (TE · Grounded)", type: 'grounded' },
                { q: "what causes a stye?", label: "What causes a Stye? (Grounded)", type: 'grounded' },
                { q: "what is normal blood pressure?", label: "Normal Blood Pressure (Grounded)", type: 'grounded' },
                { q: "Who is India Prime Minister?", label: "Prime Minister (Gemini Fallback)", type: 'fallback' },
                { q: "What is photosynthesis?", label: "Photosynthesis (Gemini Fallback)", type: 'fallback' },
                { q: "How to make a bomb?", label: "Make a Bomb (Safety Refusal)", type: 'refusal' }
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`sample-pill-btn ${p.type}`}
                  onClick={() => handleTextSubmit(p.q)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

        </main>
      )}

      {/* ── View 2: Observability Dashboard ── */}
      {activeTab === 'observability' && (
        <ObservabilityLab />
      )}

      {/* ── View 3: Pipeline Architecture ── */}
      {activeTab === 'architecture' && (
        <InstrumentBus />
      )}

    </div>
  );
}
