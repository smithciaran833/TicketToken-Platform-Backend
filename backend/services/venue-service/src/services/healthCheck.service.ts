import { Knex } from 'knex';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { getConfig } from '../config/index';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

export class HealthCheckService {
  private db: Knex;
  private redis: Redis;
  private queueService: any;
  private startTime: Date;
  private rabbitMQCheckCache: { status: string; timestamp: number; result?: any } | null = null;
  private readonly CACHE_TTL = 10000; // 10 seconds

  constructor(dependencies: { db: Knex; redis: Redis; queueService?: any }) {
    this.db = dependencies.db;
    this.redis = dependencies.redis;
    this.queueService = dependencies.queueService;
    this.startTime = new Date();
  }

  // Liveness probe - is the service alive?
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString()
    };
  }

  // Readiness probe - is the service ready to accept traffic?
  async getReadiness(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};

    // Check database
    const dbStart = Date.now();
    try {
      await this.db.raw('SELECT 1');
      checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart
      };
    } catch (error: any) {
      checks.database = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - dbStart
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'ok',
        responseTime: Date.now() - redisStart
      };
    } catch (error: any) {
      checks.redis = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - redisStart
      };
    }

    // Determine overall status
    const hasErrors = Object.values(checks).some(c => c.status === 'error');

    let status: HealthCheckResult['status'] = 'healthy';
    if (hasErrors) {
      if (checks.database.status === 'error') {
        status = 'unhealthy'; // Database is critical
      } else {
        status = 'degraded'; // Redis failure is degraded
      }
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  // Full health check with business logic
  async getFullHealth(): Promise<HealthCheckResult> {
    const readiness = await this.getReadiness();

    // Add business logic checks
    const businessChecks: HealthCheckResult['checks'] = {};

    // Check if we can query venues
    const queryStart = Date.now();
    try {
      const count = await this.db('venues').count('id as count').first();
      businessChecks.venueQuery = {
        status: 'ok',
        responseTime: Date.now() - queryStart,
        details: { venueCount: Number(count?.count) || 0 }
      };
    } catch (error: any) {
      businessChecks.venueQuery = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - queryStart
      };
    }

    // Check cache operations
    const cacheStart = Date.now();
    try {
      // Fix 3: Use unique cache test key to prevent collision
      const testKey = `health:check:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      await this.redis.set(testKey, 'ok', 'EX', 10);
      const value = await this.redis.get(testKey);
      await this.redis.del(testKey);

      businessChecks.cacheOperations = {
        status: value === 'ok' ? 'ok' : 'warning',
        responseTime: Date.now() - cacheStart
      };
    } catch (error: any) {
      businessChecks.cacheOperations = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - cacheStart
      };
    }

    // Check RabbitMQ connection (optional - service can run without it)
    businessChecks.rabbitMQ = await this.checkRabbitMQ();

    // Check database migrations status
    businessChecks.migrations = await this.checkMigrations();

    // Fix 1: Set overall status to 'degraded' when migrations are pending
    let overallStatus = readiness.status;
    if (businessChecks.migrations?.status === 'warning') {
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    return {
      ...readiness,
      status: overallStatus,
      checks: {
        ...readiness.checks,
        ...businessChecks
      }
    };
  }

  /**
   * Check database migration status
   * Warns if there are pending migrations
   */
  private async checkMigrations(): Promise<HealthCheckResult['checks'][string]> {
    const migrationStart = Date.now();

    try {
      // Get current migration version
      const [currentVersion] = await this.db.migrate.currentVersion();

      // Get list of all migrations (applied and pending)
      const [, pending] = await this.db.migrate.list();

      if (pending.length > 0) {
        return {
          status: 'warning',
          message: `${pending.length} pending migration(s)`,
          responseTime: Date.now() - migrationStart,
          details: {
            currentVersion,
            pendingCount: pending.length,
            pendingMigrations: pending.slice(0, 5).map((m: any) => m.name), // First 5
            note: 'Run migrations before deploying new code'
          }
        };
      }

      return {
        status: 'ok',
        responseTime: Date.now() - migrationStart,
        details: {
          currentVersion,
          pendingCount: 0,
          upToDate: true
        }
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to check migration status');

      return {
        status: 'error',
        message: `Migration check failed: ${error.message}`,
        responseTime: Date.now() - migrationStart,
        details: {
          error: error.message
        }
      };
    }
  }

  /**
   * Check RabbitMQ connection status
   * Uses caching to avoid checking on every health check request
   * RabbitMQ is optional - service reports as 'warning' if unavailable, not 'error'
   */
  private async checkRabbitMQ(): Promise<HealthCheckResult['checks'][string]> {
    const now = Date.now();

    // Return cached result if still valid
    if (this.rabbitMQCheckCache && (now - this.rabbitMQCheckCache.timestamp) < this.CACHE_TTL) {
      return this.rabbitMQCheckCache.result;
    }

    const rabbitStart = now;

    // If queueService is not configured, mark as disabled
    if (!this.queueService) {
      const result = {
        status: 'warning' as const,
        message: 'RabbitMQ not configured (optional)',
        responseTime: Date.now() - rabbitStart,
        details: {
          enabled: false,
          note: 'Service can operate without RabbitMQ'
        }
      };

      this.rabbitMQCheckCache = { status: 'warning', timestamp: now, result };
      return result;
    }

    try {
      // Check if queueService has an active connection
      const isConnected = this.queueService.connection &&
                         !this.queueService.connection.closed;

      if (!isConnected) {
        const result = {
          status: 'warning' as const,
          message: 'RabbitMQ disconnected but service operational',
          responseTime: Date.now() - rabbitStart,
          details: {
            connected: false,
            note: 'Events will not be published'
          }
        };

        this.rabbitMQCheckCache = { status: 'warning', timestamp: now, result };
        return result;
      }

      // Connection is active
      const channelCount = this.queueService.channel ? 1 : 0;

      const result = {
        status: 'ok' as const,
        responseTime: Date.now() - rabbitStart,
        details: {
          connected: true,
          channels: channelCount,
          host: getConfig().rabbitmq.host,
          lastCheck: new Date().toISOString()
        }
      };

      this.rabbitMQCheckCache = { status: 'ok', timestamp: now, result };
      return result;
    } catch (error: any) {
      logger.debug({ error }, 'RabbitMQ health check error');

      const result = {
        status: 'warning' as const,
        message: `RabbitMQ check failed: ${error.message}`,
        responseTime: Date.now() - rabbitStart,
        details: {
          error: error.message,
          note: 'Service can operate without RabbitMQ'
        }
      };

      this.rabbitMQCheckCache = { status: 'warning', timestamp: now, result };
      return result;
    }
  }
}
