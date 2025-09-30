// PIISanitizer included directly to avoid import issues in Docker
class PIISanitizer {
  static sanitize(data: any): any {
    if (typeof data === 'string') {
      return data.replace(/\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/gi, '[EMAIL]')
                 .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
                 .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
    }
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const key in data) {
        sanitized[key] = this.sanitize(data[key]);
      }
      return sanitized;
    }
    return data;
  }

  static sanitizeRequest(req: any): any {
    return {
      method: req.method,
      url: req.url,
      headers: this.sanitize(req.headers),
      body: this.sanitize(req.body),
      params: this.sanitize(req.params),
      query: this.sanitize(req.query)
    };
  }
}

class Logger {
  private component: string;

  constructor(component?: string) {
    this.component = component || 'payment-service';
  }

  child(meta: any) {
    return new Logger(meta.component || this.component);
  }

  private formatMessage(level: string, msg: string, data?: any) {
    const timestamp = new Date().toISOString();
    const sanitizedData = data ? PIISanitizer.sanitize(data) : '';
    return `[${timestamp}] [${level}] [${this.component}] ${msg}`;
  }

  info(msg: string, data?: any) {
    const sanitized = PIISanitizer.sanitize(data);
    console.log(this.formatMessage('INFO', msg), sanitized || '');
  }

  error(msg: string, error?: any) {
    const sanitized = PIISanitizer.sanitize(error);
    console.error(this.formatMessage('ERROR', msg), sanitized || '');
  }

  warn(msg: string, data?: any) {
    const sanitized = PIISanitizer.sanitize(data);
    console.warn(this.formatMessage('WARN', msg), sanitized || '');
  }

  debug(msg: string, data?: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      const sanitized = PIISanitizer.sanitize(data);
      console.log(this.formatMessage('DEBUG', msg), sanitized || '');
    }
  }
}

export const logger = new Logger();

// Override global console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
  const sanitized = args.map(arg => PIISanitizer.sanitize(arg));
  originalConsoleLog(...sanitized);
};

console.error = (...args: any[]) => {
  const sanitized = args.map(arg => PIISanitizer.sanitize(arg));
  originalConsoleError(...sanitized);
};

console.warn = (...args: any[]) => {
  const sanitized = args.map(arg => PIISanitizer.sanitize(arg));
  originalConsoleWarn(...sanitized);
};

export default logger;
