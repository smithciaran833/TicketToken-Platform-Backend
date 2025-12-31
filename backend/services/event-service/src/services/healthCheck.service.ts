import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

/**
 * Health check result for Kubernetes probes and monitoring.
 * 
 * CRITICAL FIX: External service checks (venue-service, auth-service) have been
 * REMOVED from the main health check to prevent cascading failures.
 * 
 * Health checks should only verify LOCAL dependencies:
 * - Database connectivity
 * - Redis connectivity
 * - Memory/CPU (if applicable)
 * 
 * External service health should be monitored via:
 * - Separate dependency checks (not affecting readiness)
 * - Circuit breakers
 * - Service mesh health
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  // AUDIT FIX (LOW-UPTIME): uptime removed from public health response
  // Uptime exposes server restart info which can be a security concern
  // Only available in authenticated /health/full endpoint
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
  };
  // External dependencies are reported separately and don't affect overall status
  dependencies?: {
    venueService?: DependencyCheck;
    authService?: DependencyCheck;
  };
}

export interface LivenessResult {
  status: 'ok' | 'error';
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
  };
}

interface HealthCheck {
  status: 'up' | 'degraded' | 'down';
  responseTime?: number;
  error?: string;
  details?: any;
}

// Response time thresholds for degraded state (AUDIT FIX HC-1)
const DB_SLOW_THRESHOLD_MS = 1000;  // Database > 1000ms = degraded
const REDIS_SLOW_THRESHOLD_MS = 500; // Redis > 500ms = degraded

// Health check timeouts (AUDIT FIX HC-1)
const DB_HEALTH_TIMEOUT_MS = 2000;  // 2 second timeout for DB health checks
const REDIS_HEALTH_TIMEOUT_MS = 1000; // 1 second timeout for Redis health checks

// Clock drift tolerance (AUDIT FIX TSO-1)
const MAX_CLOCK_DRIFT_MS = 5000; // 5 seconds max drift from NTP

interface DependencyCheck {
  status: 'up' | 'down' | 'unknown';
  responseTime?: number;
  lastChecked?: string;
  error?: string;
}

export class HealthCheckService {
  private startTime: number;
  private version: string;
  
  // Cache external dependency status (don't check on every health request)
  private dependencyCache: Map<string, { status: DependencyCheck; timestamp: number }> = new Map();
  private readonly DEPENDENCY_CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
  }

  /**
   * Kubernetes liveness probe.
   * Should be fast (<100ms) and only check if the process is alive.
   * Does NOT check dependencies - that would cause cascading failures.
   */
  async performLivenessCheck(): Promise<LivenessResult> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Kubernetes readiness probe.
   * Checks if the service can handle requests (local dependencies only).
   * 
   * IMPORTANT: Does NOT check external services to prevent cascading failures.
   */
  async performReadinessCheck(db: Pool, redis: Redis): Promise<ReadinessResult> {
    const [database, redisCheck] = await Promise.all([
      this.checkDatabase(db),
      this.checkRedis(redis),
    ]);

    const allUp = database.status === 'up' && redisCheck.status === 'up';

    return {
      status: allUp ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis: redisCheck,
      },
    };
  }

  /**
   * Comprehensive health check for monitoring dashboards.
   * 
   * CRITICAL: External service checks are OPTIONAL and don't affect overall status.
   * This prevents cascading failures when dependent services are down.
   * 
   * @param db - PostgreSQL connection pool
   * @param redis - Redis client
   * @param includeExternalDeps - Whether to include external dependency checks (default: false)
   */
  async performHealthCheck(
    db: Pool,
    redis: Redis,
    includeExternalDeps: boolean = false
  ): Promise<HealthCheckResult> {
    // Only check LOCAL dependencies for health status
    const [database, redisCheck] = await Promise.all([
      this.checkDatabase(db),
      this.checkRedis(redis),
    ]);

    // Determine overall status based ONLY on local dependencies
    const allUp = database.status === 'up' && redisCheck.status === 'up';
    const anyDown = database.status === 'down' || redisCheck.status === 'down';

    const status = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded';

    // AUDIT FIX (LOW-UPTIME): uptime removed from public response
    // Uptime is only available in authenticated /health/full endpoint
    const result: HealthCheckResult = {
      status,
      timestamp: new Date().toISOString(),
      version: this.version,
      checks: {
        database,
        redis: redisCheck,
      },
    };

    // Optionally include external dependencies (for debugging/monitoring only)
    if (includeExternalDeps) {
      result.dependencies = await this.checkExternalDependencies();
    }

    return result;
  }

  /**
   * Check database connectivity.
   * AUDIT FIX (HC-1): Uses DB_HEALTH_TIMEOUT_MS (2s) timeout
   * Returns 'degraded' if response time exceeds threshold but service is still responding.
   */
  private async checkDatabase(db: Pool): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database check timeout')), DB_HEALTH_TIMEOUT_MS);
      });

      await Promise.race([
        db.query('SELECT 1'),
        timeoutPromise,
      ]);

      const responseTime = Date.now() - start;
      
      // Check if response is slow (degraded) but still responding
      if (responseTime > DB_SLOW_THRESHOLD_MS) {
        return {
          status: 'degraded',
          responseTime,
          details: { warning: `Response time ${responseTime}ms exceeds threshold ${DB_SLOW_THRESHOLD_MS}ms` },
        };
      }
      
      return {
        status: 'up',
        responseTime,
      };
    } catch (error: any) {
      logger.error({ error }, 'Database health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error.code || 'CONNECTION_ERROR', // Don't expose internal message
      };
    }
  }

  /**
   * Check Redis connectivity.
   * AUDIT FIX (HC-1): Uses REDIS_HEALTH_TIMEOUT_MS (1s) timeout
   * Returns 'degraded' if response time exceeds threshold but service is still responding.
   */
  private async checkRedis(redisClient: Redis): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis check timeout')), REDIS_HEALTH_TIMEOUT_MS);
      });

      await Promise.race([
        redisClient.ping(),
        timeoutPromise,
      ]);

      const responseTime = Date.now() - start;
      
      // Check if response is slow (degraded) but still responding
      if (responseTime > REDIS_SLOW_THRESHOLD_MS) {
        return {
          status: 'degraded',
          responseTime,
          details: { warning: `Response time ${responseTime}ms exceeds threshold ${REDIS_SLOW_THRESHOLD_MS}ms` },
        };
      }

      return {
        status: 'up',
        responseTime,
      };
    } catch (error: any) {
      logger.error({ error }, 'Redis health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error.code || 'CONNECTION_ERROR', // Don't expose internal message
      };
    }
  }

  /**
   * Check external dependencies (for monitoring dashboards only).
   * 
   * IMPORTANT: These checks are cached and do NOT affect service health status.
   * External service failures should be handled by circuit breakers, not health checks.
   */
  private async checkExternalDependencies(): Promise<{
    venueService?: DependencyCheck;
    authService?: DependencyCheck;
  }> {
    const now = Date.now();
    const result: {
      venueService?: DependencyCheck;
      authService?: DependencyCheck;
    } = {};

    // Check cached status first
    const venueCache = this.dependencyCache.get('venue-service');
    if (venueCache && (now - venueCache.timestamp) < this.DEPENDENCY_CACHE_TTL) {
      result.venueService = venueCache.status;
    } else if (process.env.VENUE_SERVICE_URL) {
      const venueStatus = await this.checkExternalService(
        process.env.VENUE_SERVICE_URL,
        'venue-service'
      );
      this.dependencyCache.set('venue-service', { status: venueStatus, timestamp: now });
      result.venueService = venueStatus;
    }

    const authCache = this.dependencyCache.get('auth-service');
    if (authCache && (now - authCache.timestamp) < this.DEPENDENCY_CACHE_TTL) {
      result.authService = authCache.status;
    } else if (process.env.AUTH_SERVICE_URL) {
      const authStatus = await this.checkExternalService(
        process.env.AUTH_SERVICE_URL,
        'auth-service'
      );
      this.dependencyCache.set('auth-service', { status: authStatus, timestamp: now });
      result.authService = authStatus;
    }

    return result;
  }

  /**
   * Check a single external service health.
   * Used for monitoring only - does not affect this service's health status.
   */
  private async checkExternalService(
    baseUrl: string,
    serviceName: string
  ): Promise<DependencyCheck> {
    const start = Date.now();
    const timeout = 5000; // 5 second timeout

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${baseUrl}/health/live`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          status: 'up',
          responseTime: Date.now() - start,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'down',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        error: `HTTP_${response.status}`,
      };
    } catch (error: any) {
      logger.warn({ error, serviceName }, `External service check failed (non-critical)`);
      return {
        status: error.name === 'AbortError' ? 'unknown' : 'down',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        error: error.name === 'AbortError' ? 'TIMEOUT' : 'CONNECTION_ERROR',
      };
    }
  }

  /**
   * Startup probe for Kubernetes.
   * Used to check if the application has finished initialization.
   */
  async performStartupCheck(db: Pool, redis: Redis): Promise<{ ready: boolean; message: string }> {
    try {
      // Check database connection
      await db.query('SELECT 1');
      
      // Check Redis connection
      await redis.ping();

      return {
        ready: true,
        message: 'Service initialized successfully',
      };
    } catch (error: any) {
      logger.error({ error }, 'Startup check failed');
      return {
        ready: false,
        message: 'Service initialization incomplete',
      };
    }
  }

  /**
   * AUDIT FIX (TSO-1): Check clock drift by comparing database time with local time.
   * Returns drift in milliseconds. Positive means local clock is ahead.
   */
  async checkClockDrift(db: Pool): Promise<{ driftMs: number; status: 'ok' | 'warning' | 'error' }> {
    try {
      const localBefore = Date.now();
      const result = await db.query('SELECT NOW() AS db_time');
      const localAfter = Date.now();
      
      const dbTime = new Date(result.rows[0].db_time).getTime();
      const localMid = (localBefore + localAfter) / 2;
      const driftMs = localMid - dbTime;
      
      // Determine status based on drift magnitude
      let status: 'ok' | 'warning' | 'error';
      if (Math.abs(driftMs) < MAX_CLOCK_DRIFT_MS / 2) {
        status = 'ok';
      } else if (Math.abs(driftMs) < MAX_CLOCK_DRIFT_MS) {
        status = 'warning';
        logger.warn({ driftMs }, 'Clock drift detected (warning threshold)');
      } else {
        status = 'error';
        logger.error({ driftMs }, 'Clock drift exceeds maximum tolerance');
      }
      
      return { driftMs, status };
    } catch (error: any) {
      logger.error({ error }, 'Failed to check clock drift');
      return { driftMs: 0, status: 'error' };
    }
  }

  /**
   * AUDIT FIX (HC-2): Detailed health check requiring authentication.
   * Includes additional details like clock drift, memory usage, etc.
   * Should be protected by requireAdmin or requireRole middleware.
   */
  async performDetailedHealthCheck(
    db: Pool,
    redis: Redis
  ): Promise<HealthCheckResult & { 
    detailed: {
      clockDrift: { driftMs: number; status: string };
      memory: { heapUsed: number; heapTotal: number; rss: number };
      process: { pid: number; nodeVersion: string };
    };
  }> {
    const baseHealth = await this.performHealthCheck(db, redis, true);
    const clockDrift = await this.checkClockDrift(db);
    const memoryUsage = process.memoryUsage();
    
    return {
      ...baseHealth,
      detailed: {
        clockDrift,
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
        },
        process: {
          pid: process.pid,
          nodeVersion: process.version,
        },
      },
    };
  }
}

/**
 * AUDIT FIX (TSO-2): Get current server time for API responses.
 * This can be added to response metadata for time synchronization.
 */
export function getServerTime(): { server_time: string; unix_ms: number } {
  const now = new Date();
  return {
    server_time: now.toISOString(),
    unix_ms: now.getTime(),
  };
}
