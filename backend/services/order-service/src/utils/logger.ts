import pino from 'pino';
import type { FastifyRequest } from 'fastify';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined,
  base: {
    service: 'order-service',
    environment: process.env.NODE_ENV || 'development'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  }
});

/**
 * Create a child logger with correlation context from request
 * This attaches traceId, spanId, and other request metadata to all log entries
 */
export function createRequestLogger(request: FastifyRequest): any {
  const correlationContext: any = {
    traceId: (request as any).traceId || request.id,
    spanId: (request as any).spanId,
    requestId: request.id,
    method: request.method,
    url: request.url,
    ip: request.ip,
  };

  // Add tenant context if available
  if ((request as any).tenant) {
    correlationContext.tenantId = (request as any).tenant.id;
    correlationContext.tenantName = (request as any).tenant.name;
  }

  // Add user context if available
  if ((request as any).user) {
    correlationContext.userId = (request as any).user.id;
    correlationContext.userRole = (request as any).user.role;
  }

  return pinoLogger.child(correlationContext);
}

/**
 * Create a child logger with custom correlation context
 * Useful for background jobs, event handlers, etc.
 */
export function createContextLogger(context: Record<string, any>): any {
  return pinoLogger.child({
    ...context,
    timestamp: new Date().toISOString()
  });
}

// Export root logger with any type to avoid Pino's strict typing issues
export const logger = pinoLogger as any;
