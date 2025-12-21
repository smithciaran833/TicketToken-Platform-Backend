import { Pool } from 'pg';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';

export class IdempotencyService {
  private pool: Pool;
  private readonly DEFAULT_TTL = 86400; // 24 hours

  constructor() {
    this.pool = getPool();
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
        // For SMS, more restrictive - include hour to prevent spam
        const hour = new Date().getHours();
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
    const result = await this.pool.query(
      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
      [key]
    );

    if (result.rows.length > 0) {
      logger.info(`Idempotency hit (PostgreSQL): ${key}`);
      return result.rows[0].result;
    }

    return null;
  }

  /**
   * Store the result for idempotency
   */
  async store(
    key: string, 
    queueName: string,
    jobType: string,
    result: any, 
    ttlSeconds: number = this.DEFAULT_TTL
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Store in PostgreSQL
    await this.pool.query(
      `INSERT INTO idempotency_keys 
       (key, queue_name, job_type, result, processed_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (key) DO UPDATE 
       SET result = $4, processed_at = NOW()`,
      [key, queueName, jobType, result, expiresAt]
    );

    logger.info(`Idempotency stored: ${key} for ${ttlSeconds}s`);
  }

  /**
   * Clean up expired keys
   */
  async cleanup(): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
    );
    
    logger.info(`Cleaned up ${result.rowCount} expired idempotency keys`);
  }
}
