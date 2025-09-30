import { Knex } from 'knex';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

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
  private startTime: Date;

  constructor(dependencies: { db: Knex; redis: Redis }) {
    this.db = dependencies.db;
    this.redis = dependencies.redis;
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
        details: { venueCount: count?.count || 0 }
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
      const testKey = 'health:check:' + Date.now();
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

    return {
      ...readiness,
      checks: {
        ...readiness.checks,
        ...businessChecks
      }
    };
  }
}
