import { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  recordingState: 'idle' | 'recording' | 'processing' | 'complete' | 'error';
  setRecordingState: (state: 'idle' | 'recording' | 'processing' | 'complete' | 'error') => void;
  onAudioComplete: (blob: Blob) => void;
  onReset: () => void;
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
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    } catch (e) {}
  }
  return '';
}

export default function AudioRecorder({
  recordingState,
  setRecordingState,
  onAudioComplete,
  onReset
}: AudioRecorderProps) {
  const [timer, setTimer] = useState(0);
  const [micError, setMicError] = useState('');
  
  const isRecordingRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any | null>(null);
  const maxTimeoutRef = useRef<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopReasonRef = useRef<'user' | 'timeout' | 'cancel'>('user');
  
  // Web Audio variables for waveform visualizer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const MAX_RECORDING_SECONDS = 15; // 15-second recording cap

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (maxTimeoutRef.current) clearTimeout(maxTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      stopAudioVisualization();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Draw visualizer loop (driven by isRecordingRef.current, NOT affected by React renders)
  function drawWaveform() {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = dataArrayRef.current;

    const draw = () => {
      if (!isRecordingRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray as any);

      // Clean cinematic backdrop
      ctx.fillStyle = 'rgba(8, 10, 15, 0.9)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#10b981'; // Emerald accent line
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }

  // Connect microphone stream to Web Audio API analyzer
  function startAudioVisualization(stream: MediaStream) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();

      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;

      drawWaveform();
    } catch (e) {
      console.warn("[AudioRecorder] Could not load Web Audio visualizer:", e);
    }
  }

  function stopAudioVisualization() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }

  async function startRecording() {
    setMicError('');
    audioChunksRef.current = [];
    stopReasonRef.current = 'user';

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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (err) => {
        console.error("[AudioRecorder] MediaRecorder error:", err);
      };

      mediaRecorder.onstop = () => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        
        console.log(`[AudioRecorder] Recording completed: duration=${elapsed.toFixed(1)}s, reason=${stopReasonRef.current}, size=${audioBlob.size} bytes, mime=${actualMime}`);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        if (stopReasonRef.current !== 'cancel') {
          onAudioComplete(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      startTimeRef.current = Date.now();

      // Collect audio chunks every 250ms
      mediaRecorder.start(250);
      setRecordingState('recording');
      setTimer(0);

      // UI display timer (every 250ms to ensure accurate integer seconds without drift)
      timerIntervalRef.current = setInterval(() => {
        const elapsedSec = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - startTimeRef.current) / 1000));
        setTimer(elapsedSec);
      }, 250);

      // Explicit 15-second automatic timeout cap
      maxTimeoutRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.log("[AudioRecorder] Maximum duration (15s) reached. Stopping automatically.");
          stopRecording('timeout');
        }
      }, MAX_RECORDING_SECONDS * 1000);

      startAudioVisualization(stream);
      console.log(`[AudioRecorder] Recording started with MIME: ${actualMime}`);

    } catch (err: any) {
      console.error("[AudioRecorder] Microphone capture error:", err);
      setMicError("Microphone permission denied or audio device unavailable.");
      isRecordingRef.current = false;
      setRecordingState('idle');
    }
  }

  function stopRecording(reason: 'user' | 'timeout' = 'user') {
    if (!isRecordingRef.current && (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive')) {
      return;
    }

    isRecordingRef.current = false;
    stopReasonRef.current = reason;

    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    stopAudioVisualization();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    isRecordingRef.current = false;
    stopReasonRef.current = 'cancel';

    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    stopAudioVisualization();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setTimer(0);
    onReset();
  }

  return (
    <div className="voice-transducer-hub" aria-label="Precision Voice Transducer Hub">
      
      {/* 1. Idle State */}
      {recordingState === 'idle' && (
        <>
          <div className="transducer-orb-container">
            <div className="transducer-halo"></div>
            <button 
              className="transducer-btn"
              onClick={startRecording}
              aria-label="Tap to speak in Hindi or English"
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </button>
          </div>
          <div className="transducer-label">Tap to Speak</div>
          <div className="transducer-sublabel">Ask in Hindi (Devanagari) or English · MSMARCO-XI Index</div>
          {micError && (
            <p style={{ color: 'var(--refused)', fontSize: '0.8rem', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>
              ⚠️ {micError}
            </p>
          )}
        </>
      )}

      {/* 2. Recording State */}
      {recordingState === 'recording' && (
        <>
          <div className="transducer-orb-container">
            <button 
              className="transducer-btn recording"
              onClick={() => stopRecording('user')}
              aria-label="Stop recording speech"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>

          <div className="waveform-container">
            <canvas ref={canvasRef} className="waveform-canvas" width={420} height={60} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem' }}>
            <span className="status-dot refused" style={{ animation: 'pulse 1s infinite' }}></span>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>Listening to speech...</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
              00:{timer.toString().padStart(2, '0')} / 00:{MAX_RECORDING_SECONDS}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button 
              className="btn btn-primary"
              style={{ padding: '0.45rem 1.25rem' }}
              onClick={() => stopRecording('user')}
            >
              Done Speaking
            </button>
            <button 
              className="btn"
              style={{ padding: '0.45rem 1.25rem' }}
              onClick={cancelRecording}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* 3. Processing State */}
      {recordingState === 'processing' && (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div className="transducer-orb-container" style={{ margin: '0 auto 1.25rem' }}>
            <div className="transducer-halo" style={{ opacity: 0.9, transform: 'scale(1.2)' }}></div>
            <div className="transducer-btn" style={{ borderColor: 'var(--grounded)' }}>
              <div style={{ border: '2.5px solid transparent', borderTopColor: 'var(--grounded)', borderRadius: '50%', width: '28px', height: '28px', animation: 'spin 0.8s linear infinite' }}></div>
            </div>
          </div>
          <div className="transducer-label" style={{ color: 'var(--grounded)' }}>
            Transcribing &amp; Retrieving Evidence...
          </div>
          <div className="transducer-sublabel">
            Sarvam STT decoding audio → Indic Hybrid Search
          </div>
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {/* 4. Complete State Controls */}
      {(recordingState === 'complete' || recordingState === 'error') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button 
            className="btn btn-primary"
            style={{ padding: '0.5rem 1.25rem' }}
            onClick={startRecording}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
            Ask Another Spoken Question
          </button>
          <button 
            className="btn"
            style={{ padding: '0.5rem 1rem' }}
            onClick={onReset}
          >
            Clear
          </button>
        </div>
      )}

    </div>
  );
}
