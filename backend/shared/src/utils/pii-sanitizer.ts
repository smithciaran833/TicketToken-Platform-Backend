/**
 * PII Sanitizer - Removes sensitive information from logs
 */
export class PIISanitizer {
  private static readonly PII_PATTERNS = {
    email: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  };

  static sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const key of Object.keys(data)) {
        // Redact sensitive keys entirely
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(data[key]);
        }
      }
      return sanitized;
    }

    return data;
  }

  static sanitizeRequest(req: any): any {
    return {
      method: req.method,
      url: req.url,
      ip: this.maskIP(req.ip),
      headers: this.sanitize(req.headers),
    };
  }

  private static sanitizeString(str: string): string {
    let sanitized = str;
    
    // Replace PII patterns
    sanitized = sanitized.replace(this.PII_PATTERNS.email, '[EMAIL]');
    sanitized = sanitized.replace(this.PII_PATTERNS.ssn, '[SSN]');
    sanitized = sanitized.replace(this.PII_PATTERNS.creditCard, '[CARD]');
    sanitized = sanitized.replace(this.PII_PATTERNS.phone, '[PHONE]');
    
    return sanitized;
  }

  private static isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'apiKey', 'api_key',
      'privateKey', 'private_key', 'creditCard', 'ssn',
      'authorization', 'cookie'
    ];
    
    return sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  private static maskIP(ip: string): string {
    if (!ip) return ip;
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return '[IP]';
  }
}
