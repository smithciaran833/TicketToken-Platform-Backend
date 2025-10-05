# DATABASE AUDIT: queue-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "node-cron": "^4.2.1",
    "nodemailer": "^7.0.5",
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "redis": "^5.8.2",
```

## 2. DATABASE CONFIGURATION FILES
### database.config.ts
```typescript
import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<Pool> {
  if (pool) return pool;
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000
  });
  
  pool.on('connect', () => {
    logger.info('PostgreSQL connected');
  });
  
  pool.on('error', (error) => {
    logger.error('PostgreSQL error:', error);
  });
  
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}
```

### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/queue-service//src/controllers/metrics.controller.ts:46:         FROM queue_metrics
backend/services/queue-service//src/controllers/metrics.controller.ts:73:         FROM queue_metrics
backend/services/queue-service//src/controllers/metrics.controller.ts:86:         FROM dead_letter_jobs
backend/services/queue-service//src/controllers/alerts.controller.ts:15:        SELECT * FROM alert_history
backend/services/queue-service//src/controllers/alerts.controller.ts:47:        `UPDATE alert_history 
backend/services/queue-service//src/services/monitoring.service.ts:298:        `INSERT INTO alert_history (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
backend/services/queue-service//src/services/monitoring.service.ts:399:        `INSERT INTO queue_metrics 
backend/services/queue-service//src/services/monitoring.service.ts:424:       FROM queue_metrics
backend/services/queue-service//src/services/monitoring.service.ts:432:       FROM alert_history
backend/services/queue-service//src/services/idempotency.service.ts:87:      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
backend/services/queue-service//src/services/idempotency.service.ts:121:      `INSERT INTO idempotency_keys 
backend/services/queue-service//src/services/idempotency.service.ts:144:      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
backend/services/queue-service//src/services/recovery.service.ts:15:        `SELECT * FROM critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:46:          `INSERT INTO critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:103:        `UPDATE critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:127:        `UPDATE critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:150:      `SELECT * FROM critical_jobs 
backend/services/queue-service//src/services/rate-limiter.service.ts:240:        `INSERT INTO rate_limit_metrics 

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### monitoring.service.ts
First 100 lines:
```typescript
import * as promClient from 'prom-client';
import twilio from 'twilio';
import { Queue } from 'bull';
import { logger } from '../utils/logger';
import { QueueFactory } from '../queues/factories/queue.factory';
import { getPool } from '../config/database.config';

interface AlertThresholds {
  moneyQueueDepth: number;
  moneyQueueAge: number; // minutes
  commQueueDepth: number;
  backgroundQueueDepth: number;
  failureRate: number; // percentage
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  context: any;
  timestamp: Date;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private twilioClient: any;
  private metrics: any = {};
  private alertCooldowns: Map<string, number> = new Map();
  private thresholds: AlertThresholds;
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Initialize thresholds first
    this.thresholds = {
      moneyQueueDepth: 50,
      moneyQueueAge: 10,
      commQueueDepth: 5000,
      backgroundQueueDepth: 50000,
      failureRate: 10
    };
    
    this.setupMetrics();
    this.setupTwilio();
    this.loadThresholds();
  }
  
  static getInstance(): MonitoringService {
    if (!this.instance) {
      this.instance = new MonitoringService();
    }
    return this.instance;
  }
  
  private setupMetrics() {
    // Create a Registry
    const register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register });
    
    // Queue depth gauge
    this.metrics.queueDepth = new promClient.Gauge({
      name: 'queue_depth',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name', 'status'],
      registers: [register]
    });
    
    // Job processing duration histogram
    this.metrics.jobDuration = new promClient.Histogram({
      name: 'job_processing_duration_seconds',
      help: 'Time taken to process jobs',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register]
    });
    
    // Job completion counter
    this.metrics.jobResults = new promClient.Counter({
      name: 'job_results_total',
      help: 'Job completion results',
      labelNames: ['queue_name', 'job_type', 'result'],
      registers: [register]
    });
    
    // Alert counter
    this.metrics.alertsSent = new promClient.Counter({
      name: 'alerts_sent_total',
      help: 'Number of alerts sent',
      labelNames: ['severity', 'type', 'channel'],
      registers: [register]
    });
    
    // Queue age gauge (oldest job age)
    this.metrics.oldestJobAge = new promClient.Gauge({
      name: 'oldest_job_age_seconds',
      help: 'Age of oldest waiting job',
      labelNames: ['queue_name'],
      registers: [register]
    });
```

### idempotency.service.ts
First 100 lines:
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';

export class IdempotencyService {
  private pool: Pool;
  private redis: Redis;
  private readonly DEFAULT_TTL = 86400; // 24 hours

  constructor() {
    this.pool = getPool();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 4 // Separate DB for idempotency
    });
  }

  /**
   * Generate idempotency key based on job type and data
   */
  generateKey(jobType: string, data: any): string {
    switch(jobType) {
      case 'payment-process':
        // For payments, use venue, user, event, and amount
        return `payment-${data.venueId}-${data.userId}-${data.eventId}-${data.amount}`;
      
      case 'refund-process':
        return `refund-${data.transactionId}`;
      
      case 'nft-mint':
        return `nft-${data.eventId}-${data.seatId || data.ticketId}`;
      
      case 'payout-process':
        return `payout-${data.venueId}-${data.period || data.payoutId}`;
      
      case 'send-email':
        // For emails, include date to allow daily sends
        const date = new Date().toISOString().split('T')[0];
        return `email-${data.template}-${data.to}-${date}`;
      
      case 'send-sms':

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        // For SMS, more restrictive

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        const hour = new Date().getHours();

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        return `sms-${data.to}-${data.template}-${hour}`;

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
      
      default:
        // Generic hash for unknown types
        const hash = crypto.createHash('sha256');
        hash.update(jobType);
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
    }
  }

  /**
   * Check if a job with this key was already processed
   */
  async check(key: string): Promise<any | null> {
    // Check Redis first (fast)
    const cached = await this.redis.get(`idem:${key}`);
    if (cached) {
      logger.info(`Idempotency hit (Redis): ${key}`);
      return JSON.parse(cached);
    }

    // Check PostgreSQL (persistent)
    const result = await this.pool.query(
      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
      [key]
    );

    if (result.rows.length > 0) {
      logger.info(`Idempotency hit (PostgreSQL): ${key}`);
      
      // Cache in Redis for next time
      await this.redis.setex(
        `idem:${key}`,
        3600, // 1 hour cache
        JSON.stringify(result.rows[0].result)
      );
      
```

### recovery.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { JOB_TYPES, QUEUE_NAMES } from '../config/constants';

export class RecoveryService {
  private pool = getPool();

  async recoverPendingJobs(): Promise<void> {
    try {
      logger.info('Starting job recovery process...');

      // Recover critical jobs from PostgreSQL
      const result = await this.pool.query(
        `SELECT * FROM critical_jobs 
         WHERE status IN ('pending', 'processing')
         AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY priority DESC, created_at ASC`
      );

      if (result.rows.length === 0) {
        logger.info('No jobs to recover');
        return;
      }

      logger.info(`Found ${result.rows.length} jobs to recover`);

      for (const row of result.rows) {
        try {
          await this.recoverJob(row);
        } catch (error) {
          logger.error(`Failed to recover job ${row.id}:`, error);
        }
      }

      logger.info('Job recovery completed');
    } catch (error) {
      logger.error('Recovery process failed:', error);
    }
  }

  private async recoverJob(jobData: any): Promise<void> {
    const queue = this.determineQueue(jobData.queue_name);
    
    if (!queue) {
      logger.warn(`Unknown queue for job ${jobData.id}: ${jobData.queue_name}`);
      return;
    }

    // Re-add the job to the queue
    const job = await queue.add(
      jobData.job_type,
      jobData.data,
      {
        jobId: jobData.id, // Use same ID
        priority: jobData.priority,
        attempts: 10 - jobData.attempts // Remaining attempts
      }
    );

    logger.info(`Recovered job ${job.id} to ${jobData.queue_name}`);
  }

  private determineQueue(queueName: string) {
    if (queueName === QUEUE_NAMES.MONEY) {
      return QueueFactory.getQueue('money');
    } else if (queueName === QUEUE_NAMES.COMMUNICATION) {
      return QueueFactory.getQueue('communication');
    } else if (queueName === QUEUE_NAMES.BACKGROUND) {
      return QueueFactory.getQueue('background');
    }
    return null;
  }
}
```

### persistence.service.ts
First 100 lines:
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Job } from 'bull';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { PERSISTENCE_TIERS } from '../config/constants';

export class PersistenceService {
  private tier: string;
  private pool: Pool;
  private redis?: Redis;

  constructor(tier: string) {
    this.tier = tier;
    this.pool = getPool();
    
    // Setup Redis with appropriate persistence
    if (tier === PERSISTENCE_TIERS.TIER_1) {
      // Tier 1: Redis with AOF (Append Only File)
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 1,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        enableOfflineQueue: true
      });
    } else if (tier === PERSISTENCE_TIERS.TIER_2) {
      // Tier 2: Redis with RDB snapshots
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 2,
        retryStrategy: (times) => Math.min(times * 100, 5000)
      });
    }
    // Tier 3: No special Redis setup needed (memory only)
  }

  async saveJob(job: Job): Promise<void> {
    const jobId = String(job.id); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      try {
        // Save to PostgreSQL for Tier 1 (critical jobs)
        await this.pool.query(
          `INSERT INTO critical_jobs 
           (id, queue_name, job_type, data, priority, idempotency_key, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (id) DO UPDATE 
           SET updated_at = CURRENT_TIMESTAMP, status = 'pending'`,
          [
            jobId,
            job.queue.name,
            job.name,
            JSON.stringify(job.data),
            job.opts.priority || 5,
            job.data.idempotencyKey || null
          ]
        );
        
        logger.info(`Tier 1 job saved to PostgreSQL: ${jobId}`);
        
        // Also save to Redis for fast access
        if (this.redis) {
          await this.redis.hset(
            `job:${jobId}`,
            'queue', job.queue.name,
            'type', job.name,
            'data', JSON.stringify(job.data),
            'status', 'pending',
            'timestamp', Date.now().toString()
          );
        }
      } catch (error) {
        logger.error(`Failed to persist Tier 1 job ${jobId}:`, error);
        throw error; // Don't process if can't persist
      }
    } else if (this.tier === PERSISTENCE_TIERS.TIER_2 && this.redis) {
      // Tier 2: Save to Redis only
      await this.redis.hset(
        `job:${jobId}`,
        'queue', job.queue.name,
        'type', job.name,
        'data', JSON.stringify(job.data),
        'status', 'pending'
      );
      
      // Trigger RDB snapshot periodically
      const keyCount = await this.redis.dbsize();
      if (keyCount % 100 === 0) {
        await this.redis.bgsave();
        logger.debug('Tier 2 RDB snapshot triggered');
      }
    }
    // Tier 3: No persistence needed
  }

  async markComplete(jobId: string | number, result: any): Promise<void> {
    const id = String(jobId); // Convert to string
    
```

### rate-limiter.service.ts
First 100 lines:
```typescript
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
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

