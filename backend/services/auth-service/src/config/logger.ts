import pino from 'pino';
import { env } from './env';

// Create base logger configuration
const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'auth-service',
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  },
};

// Development pretty printing
if (env.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss Z'
    }
  };
}

export const logger = pino(loggerOptions);

// Create child loggers for different components
export const dbLogger = logger.child({ component: 'database' });
export const redisLogger = logger.child({ component: 'redis' });
export const authLogger = logger.child({ component: 'auth' });
export const apiLogger = logger.child({ component: 'api' });

// Audit logger for security events
export const auditLogger = logger.child({ 
  component: 'audit',
  level: 'info' // Always log audit events
});

// Helper to log with context
export function logWithContext(context: any, message: string, extra?: any) {
  logger.info({ context, ...extra }, message);
}

// Request logger middleware
export function createRequestLogger() {
  return async (request: any, reply: any) => {
    const start = Date.now();
    
    // Log response when it's sent
    reply.raw.on('finish', () => {
      apiLogger.info({
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: Date.now() - start,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
        userId: request.user?.id
      }, 'Request completed');
    });
  };
}
