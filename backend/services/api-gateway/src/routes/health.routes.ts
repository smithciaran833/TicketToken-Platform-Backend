import { FastifyInstance } from 'fastify';
import { AuthServiceClient } from '../clients/AuthServiceClient';
import { VenueServiceClient } from '../clients/VenueServiceClient';

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

  // Detailed readiness check with downstream service verification
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
            checks: { type: 'object' },
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

    // Check Redis connectivity (critical dependency)
    try {
      const pingStart = Date.now();
      await server.redis.ping();
      const pingTime = Date.now() - pingStart;
      checks.redis = pingTime < 100 ? 'ok' : 'warning';
    } catch (error) {
      checks.redis = 'error';
      allHealthy = false;
      server.log.error({ error }, 'Redis health check failed');
    }

    // Check critical circuit breakers
    checks.circuitBreakers = {};
    const serverWithBreakers = server as any;
    const criticalServices = ['auth-service', 'venue-service']; // Critical for authentication
    
    if (serverWithBreakers.circuitBreakers) {
      for (const [service, breaker] of serverWithBreakers.circuitBreakers) {
        const state = breaker.opened ? 'OPEN' : 'CLOSED';
        checks.circuitBreakers[service] = state;
        
        // Only fail readiness if CRITICAL services have circuits open
        if (state === 'OPEN' && criticalServices.includes(service)) {
          allHealthy = false;
        }
      }
    }

    // Check auth-service reachability (critical dependency)
    try {
      const authClient = new AuthServiceClient(server);
      const authHealthy = await Promise.race([
        authClient.healthCheck(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
      ]);
      checks.authService = authHealthy ? 'ok' : 'error';
      if (!authHealthy) {
        allHealthy = false;
      }
    } catch (error) {
      checks.authService = 'error';
      allHealthy = false;
      server.log.error({ error }, 'Auth service health check failed');
    }

    // Check venue-service reachability (critical dependency)
    try {
      const venueClient = new VenueServiceClient(server);
      const venueHealthy = await Promise.race([
        venueClient.healthCheck(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
      ]);
      checks.venueService = venueHealthy ? 'ok' : 'error';
      if (!venueHealthy) {
        allHealthy = false;
      }
    } catch (error) {
      checks.venueService = 'error';
      allHealthy = false;
      server.log.error({ error }, 'Venue service health check failed');
    }

    if (!allHealthy) {
      return reply.code(503).send({
        status: 'not ready',
        error: 'One or more critical dependencies are unavailable',
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
