import winston from 'winston';
import { PIISanitizer } from '@tickettoken/shared';
import { AsyncLocalStorage } from 'async_hooks';

// Async local storage for correlation ID
export const correlationStorage = new AsyncLocalStorage<{ correlationId: string }>();

// Custom format that adds correlation ID
const correlationFormat = winston.format((info) => {
  const store = correlationStorage.getStore();
  if (store?.correlationId) {
    info.correlationId = store.correlationId;
  }
  return info;
})();

// Custom format that sanitizes before logging
const sanitizingFormat = winston.format((info) => {
  return PIISanitizer.sanitize(info);
})();

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    correlationFormat,
    sanitizingFormat,
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
            winston.format.printf(({ level, message, timestamp, correlationId, ...meta }) => {
              const corrId = correlationId ? `[${correlationId}] ` : '';
              const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${corrId}${message}${metaStr}`;
            })
          )
        : winston.format.json()
    })
  ]
});

// Create a child logger with correlation ID
export function createChildLogger(correlationId: string): winston.Logger {
  return logger.child({ correlationId });
}

// Run callback with correlation context
export function withCorrelation<T>(correlationId: string, callback: () => T): T {
  return correlationStorage.run({ correlationId }, callback);
}

// Get current correlation ID
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

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
    correlationId: req.correlationId || req.id,
    request: PIISanitizer.sanitizeRequest(req),
    ...PIISanitizer.sanitize(meta)
  });
}

// Helper for logging responses
export function logResponse(req: any, res: any, body?: any, meta?: any) {
  logger.info('Response sent', {
    correlationId: req.correlationId || req.id,
    request: {
      method: req.method,
      url: req.url || req.path
    },
    response: PIISanitizer.sanitize({ res, body }),
    ...PIISanitizer.sanitize(meta)
  });
}

export default logger;
