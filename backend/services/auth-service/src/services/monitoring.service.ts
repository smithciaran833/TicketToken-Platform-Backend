import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { getRedis } from '../config/redis';
import { pool } from '../config/database';

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

export class MonitoringService {
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

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await db.raw('SELECT 1');
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
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const redis = getRedis();
      await redis.ping();
      const latency = Date.now() - start;
      
      const info = await redis.info('stats');
      const connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      
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
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private checkMemory(): CheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    return {
      status: heapUsedMB > 500 ? 'error' : 'ok',
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100)
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

# HELP auth_service_db_pool_total Total database connections
# TYPE auth_service_db_pool_total gauge
auth_service_db_pool_total ${pool.totalCount}

# HELP auth_service_db_pool_idle Idle database connections
# TYPE auth_service_db_pool_idle gauge
auth_service_db_pool_idle ${pool.idleCount}

# HELP auth_service_db_pool_waiting Waiting database connections
# TYPE auth_service_db_pool_waiting gauge
auth_service_db_pool_waiting ${pool.waitingCount}
`.trim();
  }
}

export function setupMonitoring(fastify: FastifyInstance, monitoringService: MonitoringService) {
  // Enhanced health check
  fastify.get('/health', async (_request, reply) => {
    const health = await monitoringService.performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    reply.status(statusCode).send(health);
  });

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = monitoringService.getMetrics();
    reply
      .type('text/plain; version=0.0.4')
      .send(metrics);
  });

  // Kubernetes liveness probe
  fastify.get('/live', async (_request, reply) => {
    reply.send({ status: 'alive' });
  });

  // Kubernetes readiness probe
  fastify.get('/ready', async (_request, reply) => {
      try {
        const redis = getRedis();
        await Promise.all([
          db.raw('SELECT 1'),
          redis.ping()
        ]);
      reply.send({ ready: true });
    } catch (error) {
      reply.status(503).send({ ready: false });
    }
  });
}
