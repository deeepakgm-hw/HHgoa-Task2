import fetch from 'node-fetch';
import FormData from 'form-data';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Error thrown when STT returns an empty or whitespace-only transcript.
 * The pipeline catches this and returns a structured error response rather
 * than silently proceeding with a garbage query.
 */
export class EmptyTranscriptError extends Error {
  constructor(public readonly audioSizeBytes: number) {
    super(`Speech-to-text returned an empty transcript for ${audioSizeBytes}-byte audio buffer. The audio may be silent, too short, or contain no recognizable speech.`);
    this.name = 'EmptyTranscriptError';
  }
}

export class SttService {
  private apiKey: string;
  private useMock: boolean = false;

  constructor(forceMock: boolean = false) {
    this.apiKey = process.env.SARVAM_API_KEY || "";
    if (forceMock || !this.apiKey || this.apiKey.startsWith('your_')) {
      if (forceMock) {
        console.log("SttService: Mock mode FORCED by constructor.");
      } else {
        console.warn("SARVAM_API_KEY is not set or placeholder is used. Running SttService in MOCK mode.");
      }
      this.useMock = true;
    }
  }

  /**
   * Returns the list of standard supported language codes for Sarvam saaras:v3.
   */
  getSupportedLanguages(): string[] {
    return ['hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'en-IN'];
  }

  /**
   * Transcribes raw audio buffer into text using Sarvam AI Saaras:v3 API.
   *
   * Error recovery contract:
   *   - If the API returns HTTP 4xx/5xx: throws a structured error with the HTTP status
   *     and body detail. The caller (ragPipeline) catches this and returns status=error.
   *   - If the API returns a valid response but the transcript field is empty or
   *     whitespace-only: throws EmptyTranscriptError. The caller returns
   *     status=error with a user-visible message ("no speech detected").
   *   - If a network-level error occurs (connection refused, timeout, DNS failure):
   *     throws the original error. The caller's withTimeout + withRetries wrappers
   *     handle retry and timeout before it reaches the pipeline error handler.
   *   - In mock mode: returns a hardcoded transcript — only used in CI/offline tests,
   *     never in production.
   *
   * @param audioBuffer Audio file buffer from frontend
   * @param filename Filename with proper extension (e.g. wav, webm)
   * @param languageCode Target language (default 'hi-IN')
   * @throws EmptyTranscriptError if transcript is empty
   * @throws Error with HTTP details if Sarvam API returns non-200
   */
  async transcribe(
    audioBuffer: Buffer,
    filename: string = 'query.wav',
    languageCode: string = 'hi-IN'
  ): Promise<string> {
    if (this.useMock) {
      console.log("[STT MOCK] Transcribing mock audio file...");
      return "क्या भारत की राजधानी नई दिल्ली है?"; 
    }

    const form = new FormData();
    const contentType = filename.endsWith('.webm') ? 'audio/webm' : 'audio/wav';
    form.append('file', audioBuffer, { filename, contentType });
    form.append('model', 'saaras:v3');
    form.append('language_code', languageCode);

    const headers = {
      'api-subscription-key': this.apiKey,
      ...form.getHeaders()
    };

    const response = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers,
      body: form
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      throw new Error(`Sarvam STT HTTP ${response.status}: ${errorDetail}`);
    }

    const body = await response.json() as any;

    if (!body || typeof body.transcript !== 'string') {
      throw new Error("Sarvam STT response body did not contain 'transcript' property.");
    }

    const transcript = body.transcript.trim();

    // Empty transcript = no speech detected — surface as a typed error
    if (transcript.length === 0) {
      throw new EmptyTranscriptError(audioBuffer.length);
    }

    return transcript;
  }
}
