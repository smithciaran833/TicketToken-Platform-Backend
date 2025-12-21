import { logger } from '../utils/logger';
import { TokenBucket } from '../utils/token-bucket';
import { RATE_LIMITS, RATE_LIMIT_GROUPS, RateLimitConfig } from '../config/rate-limits.config';
import { getPool } from '../config/database.config';
import { Pool } from 'pg';

interface RateLimiter {
  bucket: TokenBucket;
  config: RateLimitConfig;
}

export class RateLimiterService {
  private static instance: RateLimiterService;
  private limiters: Map<string, RateLimiter> = new Map();
  private pool: Pool;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.pool = getPool();
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
   * Uses PostgreSQL with SELECT FOR UPDATE for atomic operations
   */
  async acquire(service: string, priority: number = 5): Promise<void> {
    // Check if service is part of a group
    const groupName = this.getServiceGroup(service);
    const serviceName = groupName || service;
    
    const limiter = this.limiters.get(serviceName);
    if (!limiter) {
      logger.warn(`No rate limiter configured for service: ${service}`);
      return; // Allow if no limiter configured
    }
    
    const maxRetries = 30;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Start transaction for atomic operation
        const client = await this.pool.connect();
        
        try {
          await client.query('BEGIN');
          
          // Lock the row and get current state
          const result = await client.query(
            `SELECT tokens_available, concurrent_requests, max_concurrent, 
                    refill_rate, bucket_size, last_refill 
             FROM rate_limiters 
             WHERE service_name = $1 
             FOR UPDATE`,
            [serviceName]
          );
          
          if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            logger.error(`Rate limiter not configured in DB for: ${serviceName}`);
            return; // Allow if not configured
          }
          
          const row = result.rows[0];
          const now = Date.now();
          const lastRefill = new Date(row.last_refill).getTime();
          
          // Calculate token refill
          const timePassed = (now - lastRefill) / 1000; // seconds
          const tokensToAdd = timePassed * parseFloat(row.refill_rate);
          const newTokens = Math.min(
            parseFloat(row.bucket_size),
            parseFloat(row.tokens_available) + tokensToAdd
          );
          
          // Check concurrent limit
          if (row.concurrent_requests >= row.max_concurrent) {
            await client.query('ROLLBACK');
            client.release();
            await this.sleep(100);
            retries++;
            continue;
          }
          
          // Check if we have tokens
          if (newTokens < 1) {
            await client.query('ROLLBACK');
            client.release();
            await this.sleep(100);
            retries++;
            continue;
          }
          
          // Consume token and increment concurrent
          await client.query(
            `UPDATE rate_limiters 
             SET tokens_available = $1 - 1,
                 concurrent_requests = concurrent_requests + 1,
                 last_refill = NOW(),
                 updated_at = NOW()
             WHERE service_name = $2`,
            [newTokens, serviceName]
          );
          
          await client.query('COMMIT');
          client.release();
          
          logger.debug(`Rate limit acquired for ${service}`);
          return; // Success!
          
        } catch (error) {
          await client.query('ROLLBACK');
          client.release();
          throw error;
        }
        
      } catch (error) {
        logger.error(`Rate limit acquisition error for ${service}:`, error);
        await this.sleep(100);
        retries++;
      }
    }
    
    throw new Error(`Rate limit timeout for ${service} after ${maxRetries} retries`);
  }
  
  /**
   * Release a rate limit slot
   */
  async release(service: string): Promise<void> {
    const groupName = this.getServiceGroup(service);
    const serviceName = groupName || service;
    
    const limiter = this.limiters.get(serviceName);
    if (!limiter) return;
    
    try {
      await this.pool.query(
        `UPDATE rate_limiters 
         SET concurrent_requests = GREATEST(concurrent_requests - 1, 0),
             updated_at = NOW()
         WHERE service_name = $1`,
        [serviceName]
      );
      
      logger.debug(`Rate limit released for ${service}`);
    } catch (error) {
      logger.error(`Failed to release rate limit for ${service}:`, error);
    }
  }
  
  /**
   * Get current status of rate limiters
   */
  async getStatus(): Promise<Record<string, any>> {
    const result = await this.pool.query(
      'SELECT * FROM rate_limiters ORDER BY service_name'
    );
    
    const status: Record<string, any> = {};
    
    for (const row of result.rows) {
      // Calculate current tokens with refill
      const now = Date.now();
      const lastRefill = new Date(row.last_refill).getTime();
      const timePassed = (now - lastRefill) / 1000;
      const tokensToAdd = timePassed * parseFloat(row.refill_rate);
      const currentTokens = Math.min(
        parseFloat(row.bucket_size),
        parseFloat(row.tokens_available) + tokensToAdd
      );
      
      status[row.service_name] = {
        tokensAvailable: currentTokens,
        concurrent: row.concurrent_requests,
        maxConcurrent: row.max_concurrent,
        refillRate: parseFloat(row.refill_rate),
        bucketSize: row.bucket_size,
        lastActivity: row.updated_at
      };
    }
    
    return status;
  }
  
  /**
   * Check if a service is rate limited
   */
  async isRateLimited(service: string): Promise<boolean> {
    const groupName = this.getServiceGroup(service);
    const serviceName = groupName || service;
    
    const limiter = this.limiters.get(serviceName);
    if (!limiter) return false;
    
    try {
      const result = await this.pool.query(
        'SELECT tokens_available, concurrent_requests, max_concurrent FROM rate_limiters WHERE service_name = $1',
        [serviceName]
      );
      
      if (result.rows.length === 0) return false;
      
      const row = result.rows[0];
      return row.concurrent_requests >= row.max_concurrent || 
             parseFloat(row.tokens_available) < 1;
    } catch (error) {
      logger.error(`Error checking rate limit for ${service}:`, error);
      return false;
    }
  }
  
  /**
   * Get wait time until next available slot (ms)
   */
  async getWaitTime(service: string): Promise<number> {
    const groupName = this.getServiceGroup(service);
    const serviceName = groupName || service;
    
    const limiter = this.limiters.get(serviceName);
    if (!limiter) return 0;
    
    try {
      const result = await this.pool.query(
        'SELECT tokens_available, refill_rate FROM rate_limiters WHERE service_name = $1',
        [serviceName]
      );
      
      if (result.rows.length === 0) return 0;
      
      const row = result.rows[0];
      const tokensNeeded = 1 - parseFloat(row.tokens_available);
      
      if (tokensNeeded <= 0) return 0;
      
      // Calculate time to get enough tokens
      const refillRate = parseFloat(row.refill_rate);
      return Math.ceil((tokensNeeded / refillRate) * 1000);
    } catch (error) {
      logger.error(`Error getting wait time for ${service}:`, error);
      return 1000; // Default wait
    }
  }
  
  /**
   * Reset rate limiter for a service
   */
  async reset(service: string): Promise<void> {
    const limiter = this.limiters.get(service);
    if (!limiter) return;
    
    try {
      await this.pool.query(
        `UPDATE rate_limiters 
         SET tokens_available = bucket_size,
             concurrent_requests = 0,
             last_refill = NOW(),
             updated_at = NOW()
         WHERE service_name = $1`,
        [service]
      );
      
      logger.info(`Rate limiter reset for ${service}`);
    } catch (error) {
      logger.error(`Failed to reset rate limiter for ${service}:`, error);
    }
  }
  
  /**
   * Emergency stop - pause all rate limiters
   */
  async emergencyStop(): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE rate_limiters 
         SET max_concurrent = 0,
             updated_at = NOW()`
      );
      
      logger.warn('Emergency stop: All rate limiters paused');
    } catch (error) {
      logger.error('Failed to execute emergency stop:', error);
    }
  }
  
  /**
   * Resume after emergency stop
   */
  async resume(): Promise<void> {
    for (const [service, limiter] of this.limiters) {
      try {
        await this.pool.query(
          `UPDATE rate_limiters 
           SET max_concurrent = $1,
               updated_at = NOW()
           WHERE service_name = $2`,
          [limiter.config.maxConcurrent, service]
        );
      } catch (error) {
        logger.error(`Failed to resume rate limiter for ${service}:`, error);
      }
    }
    
    logger.info('All rate limiters resumed');
  }
  
  private getServiceGroup(service: string): string | null {
    for (const [group, services] of Object.entries(RATE_LIMIT_GROUPS)) {
      if (services.includes(service)) {
        return group;
      }
    }
    return null;
  }
  
  private async storeMetrics(): Promise<void> {
    try {
      const metrics = await this.getStatus();
      
      for (const [service, status] of Object.entries(metrics)) {
        await this.pool.query(
          `INSERT INTO rate_limit_metrics 
           (service_name, tokens_available, concurrent_requests, max_concurrent, captured_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [service, status.tokensAvailable, status.concurrent, status.maxConcurrent]
        ).catch(() => {}); // Ignore if table doesn't exist
      }
    } catch (error) {
      logger.error('Failed to store rate limit metrics:', error);
    }
  }
  
  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(async () => {
      try {
        await this.storeMetrics();
      } catch (error) {
        logger.error('Failed to collect rate limit metrics:', error);
      }
    }, 60000);
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
