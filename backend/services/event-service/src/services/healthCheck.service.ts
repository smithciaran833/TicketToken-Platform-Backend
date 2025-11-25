import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    venueService: HealthCheck;
    authService: HealthCheck;
  };
}

interface HealthCheck {
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
  details?: any;
}

export class HealthCheckService {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async performHealthCheck(
    db: Pool,
    redis: Redis
  ): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(db),
      this.checkRedis(redis),
      this.checkVenueService(),
      this.checkAuthService(),
    ]);

    const [database, redisCheck, venueService, authService] = checks;

    // Determine overall status
    const allUp = checks.every((check) => check.status === 'up');
    const anyDown = checks.some((check) => check.status === 'down');

    const status = allUp
      ? 'healthy'
      : anyDown
      ? 'unhealthy'
      : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        database,
        redis: redisCheck,
        venueService,
        authService,
      },
    };
  }

  private async checkDatabase(db: Pool): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await db.query('SELECT 1');
      return {
        status: 'up',
        responseTime: Date.now() - start,
      };
    } catch (error: any) {
      logger.error({ error }, 'Database health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async checkRedis(redis: Redis): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await redis.ping();
      return {
        status: 'up',
        responseTime: Date.now() - start,
      };
    } catch (error: any) {
      logger.error({ error }, 'Redis health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async checkVenueService(): Promise<HealthCheck> {
    const start = Date.now();
    const url = process.env.VENUE_SERVICE_URL;

    if (!url) {
      return {
        status: 'down',
        error: 'VENUE_SERVICE_URL not configured',
      };
    }

    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (response.ok) {
        return {
          status: 'up',
          responseTime: Date.now() - start,
        };
      }

      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: `HTTP ${response.status}`,
      };
    } catch (error: any) {
      logger.warn({ error, url }, 'Venue service health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async checkAuthService(): Promise<HealthCheck> {
    const start = Date.now();
    const url = process.env.AUTH_SERVICE_URL;

    if (!url) {
      return {
        status: 'down',
        error: 'AUTH_SERVICE_URL not configured',
      };
    }

    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (response.ok) {
        return {
          status: 'up',
          responseTime: Date.now() - start,
        };
      }

      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: `HTTP ${response.status}`,
      };
    } catch (error: any) {
      logger.warn({ error, url }, 'Auth service health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }
}
