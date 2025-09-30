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
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'completed', 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
      
      if (this.redis) {
        await this.redis.hset(`job:${id}`, 'status', 'completed');
      }
    } else if (this.tier === PERSISTENCE_TIERS.TIER_2 && this.redis) {
      await this.redis.hset(`job:${id}`, 'status', 'completed');
      // Clean up after 5 minutes
      setTimeout(() => {
        this.redis?.del(`job:${id}`);
      }, 300000);
    }
  }

  async markFailed(jobId: string | number, error: Error): Promise<void> {
    const id = String(jobId); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'failed',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
    }
    
    if (this.redis) {
      await this.redis.hset(`job:${id}`, 
        'status', 'failed',
        'error', error.message
      );
    }
  }

  async recoverJobs(): Promise<any[]> {
    // Only Tier 1 can recover from PostgreSQL
    if (this.tier !== PERSISTENCE_TIERS.TIER_1) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT * FROM critical_jobs 
       WHERE status IN ('pending', 'processing')
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY priority DESC, created_at ASC`
    );

    logger.info(`Recovering ${result.rows.length} Tier 1 jobs from PostgreSQL`);

    return result.rows.map(row => ({
      id: row.id,
      queue: row.queue_name,
      name: row.job_type,
      data: row.data,
      opts: {
        priority: row.priority,
        jobId: row.idempotency_key
      }
    }));
  }
}
