import winston from 'winston';
import { PIISanitizer, createSanitizingFormat } from '@tickettoken/shared/utils/pii-sanitizer';

// Custom format that sanitizes before logging
const sanitizingFormat = winston.format((info) => {
  // Sanitize the entire log object
  return PIISanitizer.sanitize(info);
})();

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    sanitizingFormat, // Apply sanitization first
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : winston.format.json()
    })
  ]
});

// Override console methods to ensure they also sanitize
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

// Helper for logging errors with sanitization
export function logError(message: string, error: any, meta?: any) {
  logger.error(message, {
    error: PIISanitizer.sanitize(error),
    ...PIISanitizer.sanitize(meta)
  });
}

// Helper for logging requests
export function logRequest(req: any, meta?: any) {
  logger.info('Request received', {
    request: PIISanitizer.sanitizeRequest(req),
    ...PIISanitizer.sanitize(meta)
  });
}

// Helper for logging responses
export function logResponse(req: any, res: any, body?: any, meta?: any) {
  logger.info('Response sent', {
    request: {
      method: req.method,
      url: req.url || req.path
    },
    response: PIISanitizer.sanitizeResponse(res, body),
    ...PIISanitizer.sanitize(meta)
  });
}

export default logger;
