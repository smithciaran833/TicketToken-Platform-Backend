import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logRequest, logResponse, performanceLogger } from '../utils/logger';

export async function setupLoggingMiddleware(server: FastifyInstance) {
  // Log incoming requests
  server.addHook('onRequest', async (request: FastifyRequest) => {
    // Skip logging for health checks and metrics
    if (request.url.startsWith('/health') || request.url === '/ready' || request.url === '/metrics') {
      return;
    }

    logRequest(request);
  });

  // Log responses
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip logging for health checks and metrics
    if (request.url.startsWith('/health') || request.url === '/ready' || request.url === '/metrics') {
      return;
    }

    const responseTime = reply.elapsedTime;
    logResponse(request, reply, responseTime);

    // Log performance metrics for slow requests
    if (responseTime > 1000) {
      performanceLogger.warn({
        requestId: request.id,
        correlationId: request.id,
        method: request.method,
        url: request.url,
        route: request.routeOptions?.url || request.url,
        responseTime,
        statusCode: reply.statusCode,
      }, `Slow request detected: ${responseTime}ms`);
    }

    // Note: Request metrics (duration, count, etc.) are tracked in metrics.middleware.ts
  });

  // Log route registration (debug only)
  server.addHook('onRoute', (routeOptions) => {
    server.log.debug({
      method: routeOptions.method,
      url: routeOptions.url,
      prefix: routeOptions.prefix,
      logLevel: routeOptions.logLevel,
    }, 'Route registered');
  });
}
