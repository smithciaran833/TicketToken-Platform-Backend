import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logRequest, logResponse, performanceLogger } from '../utils/logger';

export async function setupLoggingMiddleware(server: FastifyInstance) {
  // Log incoming requests
  server.addHook('onRequest', async (request: FastifyRequest) => {
    // Skip logging for health checks
    if (request.url === '/health' || request.url === '/ready') {
      return;
    }
    logRequest(request);
  });

  // Log responses
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip logging for health checks
    if (request.url === '/health' || request.url === '/ready') {
      return;
    }

    const responseTime = reply.elapsedTime;
    
    logResponse(request, reply, responseTime);

    // Log performance metrics for slow requests
    if (responseTime > 1000) {
      performanceLogger.warn({
        requestId: request.id,
        method: request.method,
        url: request.url,
        responseTime,
        statusCode: reply.statusCode,
      }, `Slow request detected: ${responseTime}ms`);
    }

    // Track metrics
    trackRequestMetrics(request, reply, responseTime);
  });

  // Log route details
  server.addHook('onRoute', (routeOptions) => {
    server.log.debug({
      method: routeOptions.method,
      url: routeOptions.url,
      prefix: routeOptions.prefix,
      logLevel: routeOptions.logLevel,
    }, 'Route registered');
  });
}

// Track request metrics for monitoring
function trackRequestMetrics(
  _request: FastifyRequest,
  _reply: FastifyReply,
  _responseTime: number
) {
  // TODO: Implement actual metrics tracking
  // const labels = {
  //   method: request.method,
  //   route: request.routerPath || 'unknown',
  //   statusCode: reply.statusCode.toString(),
  // };
  // metrics.requestDuration.observe(labels, responseTime / 1000);
  // metrics.requestCount.inc(labels);
}
