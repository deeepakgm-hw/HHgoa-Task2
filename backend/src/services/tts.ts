import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

export class TtsService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SARVAM_API_KEY || '';
  }

  /**
   * Cleans text to produce natural spoken speech for Google Assistant style readout.
   */
  public cleanTextForSpeech(rawText: string): string {
    return rawText
      .replace(/^Based on (?:sources?|retrieved context|the provided context)?\s*\[[^\]]+\]:?\s*/i, '')
      .replace(/\[Source\s*\d+\]/gi, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\[msmarco-[^\]]+\]/gi, '')
      .replace(/[*#_`~>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Maps generic language codes to Sarvam Indic locales.
   */
  public normalizeLanguageCode(code: string): string {
    const lower = (code || 'en-IN').toLowerCase();
    if (lower.startsWith('hi')) return 'hi-IN';
    if (lower.startsWith('kn')) return 'kn-IN';
    if (lower.startsWith('ta')) return 'ta-IN';
    if (lower.startsWith('te')) return 'te-IN';
    if (lower.startsWith('mr')) return 'mr-IN';
    if (lower.startsWith('bn')) return 'bn-IN';
    if (lower.startsWith('gu')) return 'gu-IN';
    if (lower.startsWith('ml')) return 'ml-IN';
    if (lower.startsWith('pa')) return 'pa-IN';
    if (lower.startsWith('od')) return 'od-IN';
    return 'en-IN';
  }

  /**
   * Synthesizes audio using Sarvam AI Bulbul TTS API.
   * Returns base64 encoded audio (WAV format).
   */
  public async synthesize(text: string, languageCode: string): Promise<string> {
    const cleaned = this.cleanTextForSpeech(text);
    if (!cleaned) {
      throw new Error("Text is empty after cleaning.");
    }

    if (!this.apiKey) {
      throw new Error("SARVAM_API_KEY is not configured.");
    }

    const targetLang = this.normalizeLanguageCode(languageCode);

    // Limit text chunk for single speech utterance to 400 characters for optimal latency
    const speechInput = cleaned.length > 450 ? cleaned.substring(0, 440) + '...' : cleaned;

    const payload = {
      inputs: [speechInput],
      target_language_code: targetLang,
      speaker: "anushka",
      pitch: 0,
      pace: 1.0,
      loudness: 1.5,
      speech_sample_rate: 16000,
      enable_preprocessing: true,
      model: "bulbul:v2"
    };

    const data = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.sarvam.ai',
        port: 443,
        path: '/text-to-speech',
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 10000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.audios && json.audios.length > 0 && json.audios[0]) {
              resolve(json.audios[0]);
            } else {
              reject(new Error(json.error?.message || json.message || "Failed to synthesize speech audio"));
            }
          } catch (e: any) {
            reject(new Error(`Failed to parse TTS response: ${body.substring(0, 150)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error("Sarvam TTS request timed out after 10s"));
      });

      req.write(data);
      req.end();
    });
  }
}
