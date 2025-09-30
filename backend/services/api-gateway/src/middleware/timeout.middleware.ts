import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config, timeoutConfig } from '../config';
import { createRequestLogger } from '../utils/logger';
import { ServiceUnavailableError, TimeoutBudget } from '../types';

export async function setupTimeoutMiddleware(server: FastifyInstance) {
  // Add timeout budget to requests
  server.addHook('onRequest', async (request: FastifyRequest) => {
    const timeout = calculateTimeout(request);

    request.timeoutBudget = {
      total: timeout,
      remaining: timeout,
      deadlineMs: Date.now() + timeout,
    };

    // Set deadline header for downstream services
    request.headers['x-request-deadline'] = request.timeoutBudget.deadlineMs.toString();
  });

  // Monitor timeout budget
  server.addHook('preHandler', async (request: FastifyRequest) => {
    if (!request.timeoutBudget) return;

    const now = Date.now();
    const elapsed = now - (request.timeoutBudget.deadlineMs - request.timeoutBudget.total);
    request.timeoutBudget.remaining = Math.max(0, request.timeoutBudget.total - elapsed);

    if (request.timeoutBudget.remaining <= 0) {
      const logger = createRequestLogger(request.id);
      logger.error({
        timeout: request.timeoutBudget.total,
        elapsed,
        path: request.url,
      }, 'Request timeout exceeded');

      throw new ServiceUnavailableError('Request timeout');
    }
  });

  // Apply timeout to response
  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const timeout = request.timeoutBudget?.total || config.timeouts.default;

    // Set socket timeout
    request.raw.setTimeout(timeout + 1000); // Add 1s buffer

    // Set up timeout handler
    const timeoutId = setTimeout(() => {
      if (!reply.sent) {
        const logger = createRequestLogger(request.id);
        logger.error({
          timeout,
          path: request.url,
          method: request.method,
        }, 'Request timed out');

        reply.code(504).send({
          statusCode: 504,
          error: 'Gateway Timeout',
          message: 'The request took too long to process',
          requestId: request.id,
        });
      }
    }, timeout);

    // Clear timeout on response
    reply.raw.on('finish', () => {
      clearTimeout(timeoutId);
    });
  });
}

// Calculate timeout based on request type and service
function calculateTimeout(request: FastifyRequest): number {
  const path = request.routeOptions?.url || request.url;
  const method = request.method;

  // Check for specific endpoint timeouts
  const services = Object.entries(timeoutConfig.services) as Array<[string, any]>;
  
  for (const [_service, config] of services) {
    if (config.endpoints) {
      for (const [endpoint, timeout] of Object.entries(config.endpoints)) {
        const [endpointMethod, endpointPath] = endpoint.split(' ');

        if (method === endpointMethod && path.includes(endpointPath.split('/')[1])) {
          return timeout as number;
        }
      }
    }
  }

  // Special cases
  if (path.includes('/payments')) {
    return config.timeouts.payment;
  }

  if (path.includes('/nft')) {
    return config.timeouts.nftMinting;
  }

  // Default timeout
  return config.timeouts.default;
}

// Distributed timeout coordination
export class DistributedTimeoutCoordinator {
  static calculateDownstreamTimeout(
    upstreamBudget: TimeoutBudget,
    downstreamService: string
  ): number {
    const now = Date.now();
    const remainingTime = upstreamBudget.deadlineMs - now;

    if (remainingTime <= 0) {
      throw new Error('Timeout budget exhausted');
    }

    // Apply buffer for response processing
    const buffer = 1000; // 1 second buffer
    const downstreamTimeout = remainingTime - buffer;

    // Respect minimum timeout for service
    const services = timeoutConfig.services as Record<string, any>;
    const serviceConfig = services[downstreamService];
    const minTimeout = serviceConfig?.default || 5000;

    return Math.max(downstreamTimeout, minTimeout);
  }

  static propagateTimeout(
    request: FastifyRequest,
    downstreamRequest: any
  ): void {
    if (!request.timeoutBudget) return;

    const deadline = request.timeoutBudget.deadlineMs;
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      throw new Error('Request deadline exceeded');
    }

    // Add headers for downstream service
    downstreamRequest.headers = {
      ...downstreamRequest.headers,
      'x-request-deadline': deadline.toString(),
      'x-timeout-remaining': remaining.toString(),
    };

    // Set timeout on the request
    downstreamRequest.timeout = remaining - 100; // 100ms buffer
  }
}

// Timeout monitoring
export function monitorTimeouts(server: FastifyInstance) {
  // Track timeout metrics in server context
  if (!(server as any).timeoutMetrics) {
    (server as any).timeoutMetrics = {
      activeRequests: 0,
      timeoutCount: 0
    };
  }

  setInterval(() => {
    // TODO: Export timeout metrics to monitoring system
    const metrics = (server as any).timeoutMetrics;

    if (metrics.timeoutCount > 10) {
      server.log.warn({
        metrics,
      }, 'High number of timeouts detected');
    }
  }, 30000); // Every 30 seconds
}
