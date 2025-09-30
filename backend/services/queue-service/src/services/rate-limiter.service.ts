import { logger } from '../utils/logger';
import { TokenBucket } from '../utils/token-bucket';
import { RATE_LIMITS, RATE_LIMIT_GROUPS, RateLimitConfig } from '../config/rate-limits.config';
import { getPool } from '../config/database.config';
import Redis from 'ioredis';

interface RateLimiter {
  bucket: TokenBucket;
  concurrent: number;
  maxConcurrent: number;
  lastActivity: number;
  config: RateLimitConfig;
}

export class RateLimiterService {
  private static instance: RateLimiterService;
  private limiters: Map<string, RateLimiter> = new Map();
  private redis: Redis;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 5 // Separate DB for rate limiting
    });
    
    this.initializeLimiters();
    this.startMetricsCollection();
  }
  
  static getInstance(): RateLimiterService {
    if (!this.instance) {
      this.instance = new RateLimiterService();
    }
    return this.instance;
  }
  
  private initializeLimiters(): void {
    for (const [service, config] of Object.entries(RATE_LIMITS)) {
      const bucket = new TokenBucket(
        config.burstSize || config.maxPerSecond * 10,
        config.maxPerSecond
      );
      
      this.limiters.set(service, {
        bucket,
        concurrent: 0,
        maxConcurrent: config.maxConcurrent,
        lastActivity: Date.now(),
        config
      });
      
      logger.info(`Rate limiter initialized for ${service}:`, {
        maxPerSecond: config.maxPerSecond,
        maxConcurrent: config.maxConcurrent
      });
    }
  }
  
  /**
   * Acquire permission to make an API call
   */
  async acquire(service: string, priority: number = 5): Promise<void> {
    // Check if service is part of a group
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      logger.warn(`No rate limiter configured for service: ${service}`);
      return; // Allow if no limiter configured
    }
    
    // Wait for concurrent slot
    while (limiter.concurrent >= limiter.maxConcurrent) {
      await this.sleep(50);
    }
    
    // Wait for rate limit token
    const acquired = await limiter.bucket.waitForTokens(1, 30000);
    if (!acquired) {
      throw new Error(`Rate limit timeout for ${service}`);
    }
    
    // Increment concurrent count
    limiter.concurrent++;
    limiter.lastActivity = Date.now();
    
    // Store metrics in Redis
    await this.recordMetric(service, 'acquire');
    
    logger.debug(`Rate limit acquired for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
  }
  
  /**
   * Release a rate limit slot
   */
  release(service: string): void {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return;
    
    if (limiter.concurrent > 0) {
      limiter.concurrent--;
      limiter.lastActivity = Date.now();
      
      logger.debug(`Rate limit released for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
    }
  }
  
  /**
   * Get current status of rate limiters
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [service, limiter] of this.limiters) {
      status[service] = {
        tokensAvailable: limiter.bucket.getTokenCount(),
        concurrent: limiter.concurrent,
        maxConcurrent: limiter.maxConcurrent,
        lastActivity: new Date(limiter.lastActivity).toISOString(),
        config: limiter.config
      };
    }
    
    return status;
  }
  
  /**
   * Check if a service is rate limited
   */
  async isRateLimited(service: string): Promise<boolean> {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return false;
    
    return limiter.concurrent >= limiter.maxConcurrent || 
           limiter.bucket.getTokenCount() < 1;
  }
  
  /**
   * Get wait time until next available slot (ms)
   */
  getWaitTime(service: string): number {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return 0;
    
    if (limiter.concurrent >= limiter.maxConcurrent) {
      // Estimate based on average processing time
      return limiter.config.cooldownMs || 1000;
    }
    
    return limiter.bucket.getTimeUntilNextToken();
  }
  
  /**
   * Reset rate limiter for a service
   */
  reset(service: string): void {
    const limiter = this.limiters.get(service);
    if (!limiter) return;
    
    limiter.bucket = new TokenBucket(
      limiter.config.burstSize || limiter.config.maxPerSecond * 10,
      limiter.config.maxPerSecond
    );
    limiter.concurrent = 0;
    
    logger.info(`Rate limiter reset for ${service}`);
  }
  
  /**
   * Emergency stop - pause all rate limiters
   */
  emergencyStop(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = 0;
      logger.warn(`Emergency stop: Rate limiter paused for ${service}`);
    }
  }
  
  /**
   * Resume after emergency stop
   */
  resume(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = limiter.config.maxConcurrent;
      logger.info(`Rate limiter resumed for ${service}`);
    }
  }
  
  private getServiceGroup(service: string): string | null {
    for (const [group, services] of Object.entries(RATE_LIMIT_GROUPS)) {
      if (services.includes(service)) {
        return group;
      }
    }
    return null;
  }
  
  private async recordMetric(service: string, action: string): Promise<void> {
    const key = `rate_limit:${service}:${action}`;
    const timestamp = Date.now();
    
    try {
      await this.redis.zadd(key, timestamp, timestamp);
      // Keep only last hour of data
      await this.redis.zremrangebyscore(key, 0, timestamp - 3600000);
    } catch (error) {
      logger.error('Failed to record rate limit metric:', error);
    }
  }
  
  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(async () => {
      try {
        await this.storeMetrics();
      } catch (error) {
        logger.error('Failed to store rate limit metrics:', error);
      }
    }, 60000);
  }
  
  private async storeMetrics(): Promise<void> {
    const pool = getPool();
    const metrics = this.getStatus();
    
    for (const [service, status] of Object.entries(metrics)) {
      await pool.query(
        `INSERT INTO rate_limit_metrics 
         (service_name, tokens_available, concurrent_requests, max_concurrent, captured_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [service, status.tokensAvailable, status.concurrent, status.maxConcurrent]
      ).catch(() => {}); // Ignore if table doesn't exist
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}
