import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { getRedis } from '../config/redis';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
  details?: any;
}

// Track startup state
let isStartupComplete = false;
let startupError: string | null = null;

export function markStartupComplete() {
  isStartupComplete = true;
  logger.info('Startup marked complete');
}

export function markStartupFailed(error: string) {
  startupError = error;
  logger.error('Startup marked failed', { error });
}

export class MonitoringService {
  private readonly healthCheckTimeout = 5000; // 5 second timeout for health checks

  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory()
    ]);

    const [database, redisCheck, memory] = checks;

    const allHealthy = checks.every(check => check.status === 'ok');
    const anyUnhealthy = checks.some(check => check.status === 'error');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database,
        redis: redisCheck,
        memory
      }
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await this.withTimeout(
        db.raw('SELECT 1'),
        this.healthCheckTimeout,
        'Database health check'
      );
      const latency = Date.now() - start;

      return {
        status: 'ok',
        latency,
        details: {
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingConnections: pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'error',
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const redis = getRedis();
      await this.withTimeout(
        redis.ping(),
        this.healthCheckTimeout,
        'Redis health check'
      );
      const latency = Date.now() - start;

      // Get Redis info with timeout
      let connectedClients: string | undefined;
      try {
        const info = await this.withTimeout(
          redis.info('stats'),
          2000,
          'Redis info'
        );
        connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      } catch {
        // Info is optional, don't fail health check
      }

      return {
        status: 'ok',
        latency,
        details: {
          connectedClients: connectedClients ? parseInt(connectedClients) : undefined
        }
      };
    } catch (error) {
      return {
        status: 'error',
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private checkMemory(): CheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);

    // Flag as error if heap usage > 500MB or > 90% of total
    const heapUsagePercent = Math.round((heapUsedMB / heapTotalMB) * 100);
    const isUnhealthy = heapUsedMB > 500 || heapUsagePercent > 90;

    return {
      status: isUnhealthy ? 'error' : 'ok',
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsagePercent
      }
    };
  }

  getMetrics() {
    // Return Prometheus-formatted metrics
    return `
# HELP auth_service_uptime_seconds Service uptime in seconds
# TYPE auth_service_uptime_seconds gauge
auth_service_uptime_seconds ${process.uptime()}

# HELP auth_service_memory_heap_used_bytes Memory heap used in bytes
# TYPE auth_service_memory_heap_used_bytes gauge
auth_service_memory_heap_used_bytes ${process.memoryUsage().heapUsed}

# HELP auth_service_memory_rss_bytes Resident set size in bytes
# TYPE auth_service_memory_rss_bytes gauge
auth_service_memory_rss_bytes ${process.memoryUsage().rss}

# HELP auth_service_db_pool_total Total database connections
# TYPE auth_service_db_pool_total gauge
auth_service_db_pool_total ${pool.totalCount}

# HELP auth_service_db_pool_idle Idle database connections
# TYPE auth_service_db_pool_idle gauge
auth_service_db_pool_idle ${pool.idleCount}

# HELP auth_service_db_pool_waiting Waiting database connections
# TYPE auth_service_db_pool_waiting gauge
auth_service_db_pool_waiting ${pool.waitingCount}

# HELP auth_service_startup_complete Whether startup has completed
# TYPE auth_service_startup_complete gauge
auth_service_startup_complete ${isStartupComplete ? 1 : 0}
`.trim();
  }
}

export async function setupHealthRoutes(app: FastifyInstance): Promise<void> {
  const monitoringService = new MonitoringService();

  // Kubernetes liveness probe - is the process alive?
  // Should return 200 as long as the process isn't deadlocked
  app.get('/health/live', async (_request, reply) => {
    reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  // Kubernetes readiness probe - can we handle traffic?
  // Checks database and Redis connectivity
  app.get('/health/ready', async (_request, reply) => {
    try {
      const redis = getRedis();
      
      // Use Promise.race for timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );

      await Promise.race([
        Promise.all([
          db.raw('SELECT 1'),
          redis.ping()
        ]),
        timeout
      ]);

      reply.send({
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      reply.status(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Kubernetes startup probe - has initial startup completed?
  // Prevents traffic before the service is fully initialized
  app.get('/health/startup', async (_request, reply) => {
    if (startupError) {
      reply.status(503).send({
        started: false,
        timestamp: new Date().toISOString(),
        error: startupError,
      });
      return;
    }

    if (!isStartupComplete) {
      reply.status(503).send({
        started: false,
        timestamp: new Date().toISOString(),
        message: 'Startup in progress',
      });
      return;
    }

    reply.send({
      started: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Full health check with details
  app.get('/health', async (_request, reply) => {
    const health = await monitoringService.performHealthCheck();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    reply.status(statusCode).send(health);
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_request, reply) => {
    const { register } = await import('../utils/metrics');
    const customMetrics = monitoringService.getMetrics();
    const promMetrics = await register.metrics();
    
    reply
      .type('text/plain; version=0.0.4')
      .send(`${promMetrics}\n${customMetrics}`);
  });
}
