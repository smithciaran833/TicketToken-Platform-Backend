import { FastifyInstance } from 'fastify';

export default async function healthRoutes(server: FastifyInstance) {
  // Basic health check
  server.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            memory: { type: 'object' },
            pid: { type: 'number' },
            version: { type: 'string' },
            circuitBreakers: { type: 'object' },
          },
        },
      },
    },
  }, async (_request) => {
    const circuitBreakers: any = {};
    
    // Access circuit breakers with type assertion
    const serverWithBreakers = server as any;
    if (serverWithBreakers.circuitBreakers) {
      for (const [service, breaker] of serverWithBreakers.circuitBreakers) {
        circuitBreakers[service] = {
          state: breaker.opened ? 'OPEN' : 'CLOSED',
          stats: breaker.stats
        };
      }
    }
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      version: process.env.npm_package_version || '1.0.0',
      circuitBreakers,
    };
  });

  // Detailed readiness check
  server.get('/ready', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: { type: 'object' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const checks: any = {};
    let allHealthy = true;

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryThreshold = 1024 * 1024 * 1024; // 1GB
    checks.memory = memoryUsage.heapUsed < memoryThreshold ? 'ok' : 'warning';

    // Check circuit breakers with type assertion
    checks.circuitBreakers = {};
    const serverWithBreakers = server as any;
    if (serverWithBreakers.circuitBreakers) {
      for (const [service, breaker] of serverWithBreakers.circuitBreakers) {
        const state = breaker.opened ? 'OPEN' : 'CLOSED';
        checks.circuitBreakers[service] = state === 'OPEN' ? 'error' : 'ok';
        if (state === 'OPEN') {
          allHealthy = false;
        }
      }
    }

    if (!allHealthy) {
      return reply.code(503).send({
        status: 'not ready',
        checks,
      });
    }

    return {
      status: 'ready',
      checks,
    };
  });

  // Liveness check
  server.get('/live', async () => {
    return { status: 'alive' };
  });
}
