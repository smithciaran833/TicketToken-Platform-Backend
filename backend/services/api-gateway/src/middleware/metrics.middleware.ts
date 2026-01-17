import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Create metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestsInProgress = new Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests in progress',
  labelNames: ['method', 'route'],
});

const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

// Business metrics
const authenticationAttempts = new Counter({
  name: 'authentication_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['status'],
});

const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'],
});

export async function setupMetricsMiddleware(server: FastifyInstance) {
  // Collect default metrics (CPU, memory, etc.)
  collectDefaultMetrics({
    prefix: 'api_gateway_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });

  // Add metrics route
  server.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.type('text/plain');
    return register.metrics();
  });

  // Track requests
  server.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    const labels = {
      method: request.method,
      route: request.routeOptions?.url || request.url,
    };

    httpRequestsInProgress.inc(labels);

    // Track request size
    const contentLength = request.headers['content-length'];
    if (contentLength) {
      httpRequestSize.observe(labels, parseInt(contentLength, 10));
    }
  });

  // Track responses
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const labels = {
      method: request.method,
      route: request.routeOptions?.url || request.url,
      status_code: reply.statusCode.toString(),
    };

    // Duration
    const responseTime = reply.elapsedTime;
    httpRequestDuration.observe(labels, responseTime / 1000);

    // Total requests
    httpRequestTotal.inc(labels);

    // Requests in progress
    httpRequestsInProgress.dec({
      method: request.method,
      route: request.routeOptions?.url || request.url,
    });

    // Response size
    const contentLength = reply.getHeader('content-length');
    if (contentLength) {
      httpResponseSize.observe({
        method: request.method,
        route: request.routeOptions?.url || request.url,
      }, parseInt(contentLength as string, 10));
    }

    // Track authentication attempts
    if (request.url === '/api/v1/auth/login') {
      authenticationAttempts.inc({
        status: reply.statusCode < 400 ? 'success' : 'failure',
      });
    }
  });

  // Monitor circuit breakers
  setInterval(() => {
    const circuitBreakers = server.services.circuitBreakerService.getAllStats();

    for (const [service, stats] of Object.entries(circuitBreakers)) {
      const state = (stats as any).state;
      let stateValue = 0;
      if (state === 'OPEN') stateValue = 1;
      else if (state === 'HALF_OPEN') stateValue = 2;

      circuitBreakerState.set({ service }, stateValue);
    }
  }, 5000);

  server.log.info('Metrics middleware configured');
}

// Export metrics for custom use
export const metrics = {
  httpRequestDuration,
  httpRequestTotal,
  httpRequestsInProgress,
  httpRequestSize,
  httpResponseSize,
  authenticationAttempts,
  circuitBreakerState,
};
