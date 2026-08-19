export interface LogEntry {
  requestId: string;
  query?: string;
  stage?: string;
  durationMs?: number;
  status: 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING';
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export class Logger {
  private static scrubSecrets(obj: any): any {
    if (!obj) return obj;
    if (typeof obj !== 'object') return obj;
    
    const scrubbed = { ...obj };
    const secretKeys = ['api-key', 'apikey', 'key', 'secret', 'subscription-key', 'token', 'credentials', 'password'];
    
    for (const k in scrubbed) {
      if (secretKeys.some(sk => k.toLowerCase().includes(sk))) {
        scrubbed[k] = "[REDACTED]";
      } else if (typeof scrubbed[k] === 'object') {
        scrubbed[k] = Logger.scrubSecrets(scrubbed[k]);
      }
    }
    return scrubbed;
  }

  static info(message: string, requestId: string = 'SYSTEM', metadata?: Record<string, any>): void {
    this.log({
      requestId,
      status: 'INFO',
      message,
      metadata: this.scrubSecrets(metadata),
      timestamp: new Date().toISOString()
    });
  }

  static success(message: string, requestId: string, durationMs?: number, metadata?: Record<string, any>): void {
    this.log({
      requestId,
      status: 'SUCCESS',
      message,
      durationMs,
      metadata: this.scrubSecrets(metadata),
      timestamp: new Date().toISOString()
    });
  }

  static warn(message: string, requestId: string = 'SYSTEM', metadata?: Record<string, any>): void {
    this.log({
      requestId,
      status: 'WARNING',
      message,
      metadata: this.scrubSecrets(metadata),
      timestamp: new Date().toISOString()
    });
  }

  static error(message: string, requestId: string, error?: any, metadata?: Record<string, any>): void {
    const errorMeta = {
      ...metadata,
      errorMessage: error?.message || String(error),
      stack: error?.stack
    };
    this.log({
      requestId,
      status: 'ERROR',
      message,
      metadata: this.scrubSecrets(errorMeta),
      timestamp: new Date().toISOString()
    });
  }

  private static log(entry: LogEntry): void {
    // Print to standard console in a structured JSON string format for production observability
    console.log(JSON.stringify(entry));
  }
}
