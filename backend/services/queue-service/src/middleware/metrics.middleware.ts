import { FastifyRequest, FastifyReply } from 'fastify';

interface RequestMetrics {
  totalRequests: number;
  requestsByEndpoint: Map<string, number>;
  requestsByStatus: Map<number, number>;
  averageResponseTime: number;
}

const metrics: RequestMetrics = {
  totalRequests: 0,
  requestsByEndpoint: new Map(),
  requestsByStatus: new Map(),
  averageResponseTime: 0
};

export async function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const start = Date.now();

  reply.raw.on('finish', () => {
    const duration = Date.now() - start;

    // Update metrics
    metrics.totalRequests++;

    const endpoint = `${request.method} ${request.routeOptions.url || request.url}`;
    metrics.requestsByEndpoint.set(
      endpoint,
      (metrics.requestsByEndpoint.get(endpoint) || 0) + 1
    );

    metrics.requestsByStatus.set(
      reply.statusCode,
      (metrics.requestsByStatus.get(reply.statusCode) || 0) + 1
    );

    // Update average response time
    metrics.averageResponseTime =
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + duration) /
      metrics.totalRequests;
  });
}

export function getMetrics(): RequestMetrics {
  return metrics;
}
