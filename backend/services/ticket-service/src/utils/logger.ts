import winston from 'winston';
import { config } from '../config';
import { PIISanitizer } from '@tickettoken/shared';

// Custom format that sanitizes before logging
const sanitizingFormat = winston.format((info) => {
  return PIISanitizer.sanitize(info);
})();

const logFormat = winston.format.combine(
  sanitizingFormat, // Apply sanitization first
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'ticket-service' },
  transports: [
    new winston.transports.Console({
      format: config.env === 'production'
        ? logFormat
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    })
  ]
});

// Create child loggers for specific components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Override console methods
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

// Helper functions
export function logError(message: string, error: any, meta?: any) {
  logger.error(message, {
    error: PIISanitizer.sanitize(error),
    ...PIISanitizer.sanitize(meta)
  });
}

export function logRequest(req: any, meta?: any) {
  logger.info('Request received', {
    request: PIISanitizer.sanitizeRequest(req),
    ...PIISanitizer.sanitize(meta)
  });
}

export default logger;
