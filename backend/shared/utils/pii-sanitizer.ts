export class PIISanitizer {
  static sanitize(data: any): any {
    if (typeof data === 'string') {
      return data
        .replace(/\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/gi, '[EMAIL]')
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
      query: this.sanitize(req.query),
    };
  }
}
