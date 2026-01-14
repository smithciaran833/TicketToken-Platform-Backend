/**
 * Request Logger Middleware
 * AUDIT FIX: LOG-1,4 - Structured request/response logging with PII protection
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-internal-signature'];
const SKIP_PATHS = ['/health', '/ready', '/live', '/metrics'];

function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function requestLoggerMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip health checks
  if (SKIP_PATHS.some(p => request.url.startsWith(p))) return;

  const startTime = process.hrtime.bigint();
  
  // Log request
  logger.info({
    event: 'request_started',
    requestId: request.id,
    method: request.method,
    url: request.url,
    headers: sanitizeHeaders(request.headers as Record<string, any>),
    tenantId: (request as any).tenantContext?.tenantId,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  }, `${request.method} ${request.url}`);

  // Log response on finish - using both onfulfilled and onrejected handlers
  const logCompletion = () => {
    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    logger.info({
      event: 'request_completed',
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: duration.toFixed(2),
      tenantId: (request as any).tenantContext?.tenantId,
    }, `${request.method} ${request.url} ${reply.statusCode} ${duration.toFixed(0)}ms`);
  };
  reply.then(logCompletion, logCompletion);
}

export async function registerRequestLogger(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requestLoggerMiddleware);
}

export default { requestLoggerMiddleware, registerRequestLogger };
