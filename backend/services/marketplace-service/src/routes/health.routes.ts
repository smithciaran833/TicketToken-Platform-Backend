/**
 * Health Check Routes for Marketplace Service
 * 
 * Issues Fixed:
 * - HL-1: No deep health checks → Added comprehensive dependency checks
 * - HL-2: No readiness probe → Added /ready endpoint
 * - HL-3: No liveness probe → Added /live endpoint
 * - HL-4: Health checks don't timeout → Added configurable timeouts
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import knex from '../config/database';
import { cache } from '../config/redis';
import { getAllCircuitStates } from '../utils/circuit-breaker';

const log = logger.child({ component: 'HealthRoutes' });

// Health check timeout (ms)
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);

interface DependencyStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  dependencies?: Record<string, DependencyStatus>;
  circuitBreakers?: Record<string, any>;
}

const startTime = Date.now();

/**
 * AUDIT FIX HL-1: Check database connectivity
 */
async function checkDatabase(): Promise<DependencyStatus> {
  const start = Date.now();
  
  try {
    const result = await Promise.race([
      knex.raw('SELECT 1 as health'),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Database timeout')), HEALTH_CHECK_TIMEOUT)
      )
    ]);
    
    return {
      status: 'healthy',
      latencyMs: Date.now() - start
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error.message
    };
  }
}

/**
 * AUDIT FIX HL-1: Check Redis connectivity
 */
async function checkRedis(): Promise<DependencyStatus> {
  const start = Date.now();
  
  try {
    const result = await Promise.race([
      cache.get('health-check'),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Redis timeout')), HEALTH_CHECK_TIMEOUT)
      )
    ]);
    
    return {
      status: 'healthy',
      latencyMs: Date.now() - start
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error.message
    };
  }
}

/**
 * AUDIT FIX HL-1: Check external service connectivity
 */
async function checkExternalService(name: string, url: string): Promise<DependencyStatus> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
  
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return {
        status: 'healthy',
        latencyMs: Date.now() - start
      };
    }
    
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: `HTTP ${response.status}`
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error.name === 'AbortError' ? 'Timeout' : error.message
    };
  }
}

/**
 * Determine overall health status
 */
function determineOverallStatus(dependencies: Record<string, DependencyStatus>): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(dependencies);
  
  // If database or Redis is unhealthy, service is unhealthy
  if (dependencies.database?.status === 'unhealthy' || dependencies.redis?.status === 'unhealthy') {
    return 'unhealthy';
  }
  
  // If any core dependency is unhealthy, service is degraded
  if (statuses.some(s => s.status === 'unhealthy')) {
    return 'degraded';
  }
  
  // If any dependency is degraded, service is degraded
  if (statuses.some(s => s.status === 'degraded')) {
    return 'degraded';
  }
  
  return 'healthy';
}

export default async function healthRoutes(fastify: FastifyInstance) {
  /**
   * Kubernetes liveness probe - is the service alive?
   * Should return quickly with minimal checks
   */
  fastify.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Kubernetes readiness probe - is the service ready to accept traffic?
   * Checks critical dependencies only
   */
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const dependencies: Record<string, DependencyStatus> = {};
    
    // Check only critical dependencies for readiness
    const [dbStatus, redisStatus] = await Promise.all([
      checkDatabase(),
      checkRedis()
    ]);
    
    dependencies.database = dbStatus;
    dependencies.redis = redisStatus;
    
    const overallStatus = determineOverallStatus(dependencies);
    
    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      dependencies
    };
    
    if (overallStatus === 'unhealthy') {
      log.warn('Readiness check failed', { dependencies });
      return reply.status(503).send(response);
    }
    
    return reply.send(response);
  });

  /**
   * AUDIT FIX HL-1: Deep health check with all dependencies
   * Used for monitoring dashboards, not K8s probes
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const dependencies: Record<string, DependencyStatus> = {};
    
    // Check all dependencies in parallel
    const [dbStatus, redisStatus] = await Promise.all([
      checkDatabase(),
      checkRedis()
    ]);
    
    dependencies.database = dbStatus;
    dependencies.redis = redisStatus;
    
    // Check external services (with their own timeouts)
    const blockchainServiceUrl = process.env.BLOCKCHAIN_SERVICE_URL;
    if (blockchainServiceUrl) {
      dependencies.blockchainService = await checkExternalService('blockchain-service', blockchainServiceUrl);
    }
    
    const ticketServiceUrl = process.env.TICKET_SERVICE_URL;
    if (ticketServiceUrl) {
      dependencies.ticketService = await checkExternalService('ticket-service', ticketServiceUrl);
    }
    
    const overallStatus = determineOverallStatus(dependencies);
    
    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      dependencies,
      circuitBreakers: getAllCircuitStates()
    };
    
    if (overallStatus === 'unhealthy') {
      log.error('Deep health check failed', { dependencies });
      return reply.status(503).send(response);
    }
    
    if (overallStatus === 'degraded') {
      log.warn('Deep health check degraded', { dependencies });
      return reply.status(200).send(response);
    }
    
    return reply.send(response);
  });

  /**
   * Metrics endpoint for Prometheus
   */
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    // Basic metrics in Prometheus format
    const metrics = [
      `# HELP marketplace_uptime_seconds Service uptime in seconds`,
      `# TYPE marketplace_uptime_seconds gauge`,
      `marketplace_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`,
      ``,
      `# HELP marketplace_health_status Service health status (1=healthy, 0=unhealthy)`,
      `# TYPE marketplace_health_status gauge`,
    ];
    
    const dbStatus = await checkDatabase();
    const redisStatus = await checkRedis();
    
    metrics.push(`marketplace_health_status{dependency="database"} ${dbStatus.status === 'healthy' ? 1 : 0}`);
    metrics.push(`marketplace_health_status{dependency="redis"} ${redisStatus.status === 'healthy' ? 1 : 0}`);
    
    // Circuit breaker metrics
    const circuits = getAllCircuitStates();
    metrics.push(`# HELP marketplace_circuit_breaker_status Circuit breaker status (0=closed, 1=half_open, 2=open)`);
    metrics.push(`# TYPE marketplace_circuit_breaker_status gauge`);
    
    for (const [name, state] of Object.entries(circuits)) {
      const statusValue = state.state === 'CLOSED' ? 0 : state.state === 'HALF_OPEN' ? 1 : 2;
      metrics.push(`marketplace_circuit_breaker_status{circuit="${name}"} ${statusValue}`);
    }
    
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return reply.send(metrics.join('\n'));
  });
}
