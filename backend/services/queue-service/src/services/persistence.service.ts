import { Pool } from 'pg';
import { BullJobData } from '../adapters/bull-job-adapter';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { PERSISTENCE_TIERS } from '../config/constants';

export class PersistenceService {
  private tier: string;
  private pool: Pool;

  constructor(tier: string) {
    this.tier = tier;
    this.pool = getPool();
  }

  async saveJob(job: BullJobData): Promise<void> {
    const jobId = String(job.id);
    
    // All tiers now use PostgreSQL (pg-boss handles persistence internally)
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      try {
        // Save to PostgreSQL for Tier 1 (critical jobs) - extra backup
        await this.pool.query(
          `INSERT INTO critical_jobs 
           (id, queue_name, job_type, data, priority, idempotency_key, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (id) DO UPDATE 
           SET updated_at = CURRENT_TIMESTAMP, status = 'pending'`,
          [
            jobId,
            job.name,
            job.name,
            JSON.stringify(job.data),
            5, // default priority
            job.data.idempotencyKey || null
          ]
        );
        
        logger.info(`Tier 1 job saved to PostgreSQL: ${jobId}`);
      } catch (error) {
        logger.error(`Failed to persist Tier 1 job ${jobId}:`, error);
        throw error;
      }
    }
    // Tier 2 & 3: pg-boss handles persistence automatically
  }

  async markComplete(jobId: string | number, result: any): Promise<void> {
    const id = String(jobId);
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'completed', 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
    }
    // Tier 2 & 3: pg-boss tracks completion automatically
  }

  async markFailed(jobId: string | number, error: Error): Promise<void> {
    const id = String(jobId);
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'failed',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
    }
    // Tier 2 & 3: pg-boss tracks failures automatically
  }

  async recoverJobs(): Promise<any[]> {
    // Only Tier 1 can recover from PostgreSQL backup
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
