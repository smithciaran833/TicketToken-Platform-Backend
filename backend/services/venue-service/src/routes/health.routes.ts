import { FastifyInstance } from 'fastify';

// Track startup state
let startupComplete = false;
let startupError: Error | null = null;

// AUDIT FIX (RD2, PG4): Health check timeout configuration
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
const DB_QUERY_TIMEOUT = parseInt(process.env.DB_HEALTH_TIMEOUT || '3000', 10);

/**
 * AUDIT FIX (PG4): Execute query with timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${name} check timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

export function markStartupComplete() {
  startupComplete = true;
}

export function markStartupFailed(error: Error) {
  startupError = error;
}

export default async function healthRoutes(fastify: FastifyInstance) {
  const healthCheckService = fastify.container.resolve('healthCheckService');

  // SECURITY FIX (HE3): Startup probe - for Kubernetes initial startup
  // Different from liveness/readiness as it only checks once during startup
  fastify.get('/health/startup', async (request, reply) => {
    if (startupError) {
      return reply.code(503).send({
        status: 'failed',
        timestamp: new Date().toISOString(),
        service: 'venue-service',
        error: startupError.message,
      });
    }
    
    if (!startupComplete) {
      return reply.code(503).send({
        status: 'starting',
        timestamp: new Date().toISOString(),
        service: 'venue-service',
        message: 'Service is still initializing',
      });
    }

    // SECURITY FIX (SC3): Don't expose version in unauthenticated health endpoint
    return reply.code(200).send({
      status: 'started',
      timestamp: new Date().toISOString(),
      service: 'venue-service',
    });
  });

  // Liveness probe - for Kubernetes
  fastify.get('/health/live', async (request, reply) => {
    const result = await healthCheckService.getLiveness();
    reply.code(200).send(result);
  });

  // Readiness probe - for Kubernetes
  fastify.get('/health/ready', async (request, reply) => {
    const result = await healthCheckService.getReadiness();
    const httpCode = result.status === 'unhealthy' ? 503 : 200;
    reply.code(httpCode).send(result);
  });

  // AUDIT FIX (SC5): Full health check - RESTRICTED to authenticated internal requests
  // Detailed health info could expose infrastructure details to attackers
  fastify.get('/health/full', {
    preHandler: async (request, reply) => {
      // Check for internal service token or admin auth
      const authHeader = request.headers['authorization'];
      const internalToken = request.headers['x-internal-service-token'];
      const requestIp = request.ip;
      
      // Allow from internal IPs (private networks)
      const isInternalIp = requestIp?.startsWith('10.') || 
                           requestIp?.startsWith('172.') ||
                           requestIp?.startsWith('192.168.') ||
                           requestIp === '127.0.0.1' ||
                           requestIp === '::1';
      
      // Allow with internal service token
      const hasInternalToken = internalToken === process.env.INTERNAL_SERVICE_SECRET;
      
      // Allow with admin auth (check JWT for admin role)
      let isAdmin = false;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = await request.jwtVerify() as any;
          isAdmin = decoded.role === 'admin' || decoded.role === 'platform_admin';
        } catch {
          // JWT verification failed, not an admin
        }
      }
      
      if (!isInternalIp && !hasInternalToken && !isAdmin) {
        reply.code(403).send({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Detailed health endpoint requires internal access',
          }
        });
        return;
      }
    }
  }, async (request, reply) => {
    const result = await healthCheckService.getFullHealth();
    
    // AUDIT FIX (SC2): Remove internal hostnames from response
    const sanitizedResult = {
      ...result,
      // Remove any hostnames that might expose internal infrastructure
      dependencies: Object.fromEntries(
        Object.entries(result.dependencies || {}).map(([key, value]: [string, any]) => [
          key,
          {
            ...value,
            // Remove host info if present
            host: undefined,
            url: undefined,
            connectionString: undefined,
          }
        ])
      ),
    };
    
    const httpCode = result.status === 'unhealthy' ? 503 : 
                     result.status === 'degraded' ? 200 : 200;
    reply.code(httpCode).send(sanitizedResult);
  });

  // Keep existing simple health endpoint for backward compatibility
  // SECURITY FIX (SC3): Don't expose version in unauthenticated health endpoint
  fastify.get('/health', async (request, reply) => {
    const { db, redis } = fastify.container.cradle;
    const health: Record<string, any> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      // SECURITY FIX (SC3): Version removed from public endpoint - only in authenticated endpoints
      checks: {
        database: 'unknown',
        redis: 'unknown',
      }
    };

    // AUDIT FIX (PG4): Database health check with timeout
    try {
      await withTimeout(db.raw('SELECT 1'), DB_QUERY_TIMEOUT, 'Database');
      health.checks.database = 'ok';
    } catch (error: any) {
      health.checks.database = error.message?.includes('timed out') ? 'timeout' : 'error';
      health.status = 'unhealthy';
    }

    // AUDIT FIX (RD2): Redis health check with timeout
    try {
      await withTimeout(redis.ping(), DB_QUERY_TIMEOUT, 'Redis');
      health.checks.redis = 'ok';
    } catch (error: any) {
      health.checks.redis = error.message?.includes('timed out') ? 'timeout' : 'error';
      if (health.status === 'ok') {
        health.status = 'degraded';
      }
    }

    const httpCode = health.status === 'unhealthy' ? 503 : 200;
    reply.code(httpCode).send(health);
  });
}
