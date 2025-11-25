import { FastifyRequest, FastifyReply } from 'fastify';
import { PIISanitizer } from '../utils/pii-sanitizer';

/**
 * Fastify hook for request/response logging with PII sanitization
 */
export async function loggingMiddleware(logger: any) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const startTime = Date.now();

    // Log incoming request (sanitized)
    logger.info('Incoming request', {
      request: PIISanitizer.sanitizeRequest(request),
      timestamp: new Date().toISOString(),
    });

    // Track response
    reply.raw.on('finish', () => {
      const duration = Date.now() - startTime;

      logger.info('Response sent', {
        request: {
          method: request.method,
          url: request.url,
          id: (request as any).id,
        },
        response: {
          statusCode: reply.statusCode,
          // Only log response body for errors or debug mode
          ...(reply.statusCode >= 400 || process.env.LOG_LEVEL === 'debug'
            ? { body: PIISanitizer.sanitize((reply as any).payload) }
            : {}),
        },
        duration: `${duration}ms`,
      });
    });
  };
}

/**
 * Error logging hook with PII sanitization
 */
export async function errorLoggingMiddleware(logger: any) {
  return async (request: FastifyRequest, reply: FastifyReply, error: Error): Promise<void> => {
    logger.error('Request error', {
      error: PIISanitizer.sanitize({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }),
      request: {
        method: request.method,
        url: request.url,
        id: (request as any).id,
      },
    });

    throw error; // Re-throw to let Fastify handle it
  };
}
