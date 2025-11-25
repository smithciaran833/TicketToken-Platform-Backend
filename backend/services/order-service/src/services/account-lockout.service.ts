/**
 * Account Lockout Service
 * Manages failed login attempts and account lockouts with exponential backoff
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { securityConfig } from '../config/security.config';

interface LockoutRecord {
  userId: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastAttemptAt: Date;
  lockoutDuration: number; // in minutes
}

export class AccountLockoutService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Record a failed login attempt
   */
  async recordFailedAttempt(userId: string, ip: string): Promise<{
    isLocked: boolean;
    attemptsRemaining: number;
    lockedUntil: Date | null;
  }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current lockout record
      const record = await this.getLockoutRecord(userId, client);

      // Check if already locked
      if (record.lockedUntil && record.lockedUntil > new Date()) {
        await client.query('COMMIT');
        return {
          isLocked: true,
          attemptsRemaining: 0,
          lockedUntil: record.lockedUntil,
        };
      }

      // Increment failed attempts
      const newAttempts = record.failedAttempts + 1;
      const maxAttempts = securityConfig.authentication.lockout.maxFailedAttempts;

      // Calculate lockout duration with exponential backoff
      let lockedUntil: Date | null = null;
      let lockoutDuration = 0;

      if (newAttempts >= maxAttempts) {
        lockoutDuration = this.calculateLockoutDuration(newAttempts - maxAttempts + 1);
        lockedUntil = new Date(Date.now() + lockoutDuration * 60 * 1000);

        logger.warn('Account locked due to failed login attempts', {
          userId,
          ip,
          failedAttempts: newAttempts,
          lockedUntil,
          lockoutDuration,
        });
      }

      // Update lockout record
      await client.query(
        `INSERT INTO account_lockouts (user_id, failed_attempts, locked_until, last_attempt_at, lockout_duration)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (user_id)
         DO UPDATE SET
           failed_attempts = $2,
           locked_until = $3,
           last_attempt_at = NOW(),
           lockout_duration = $4`,
        [userId, newAttempts, lockedUntil, lockoutDuration]
      );

      // Log the failed attempt
      await client.query(
        `INSERT INTO login_attempts (user_id, success, ip_address, attempt_at)
         VALUES ($1, false, $2, NOW())`,
        [userId, ip]
      );

      await client.query('COMMIT');

      return {
        isLocked: lockedUntil !== null,
        attemptsRemaining: Math.max(0, maxAttempts - newAttempts),
        lockedUntil,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error recording failed login attempt', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record a successful login and reset lockout
   */
  async recordSuccessfulLogin(userId: string, ip: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Reset lockout record
      await client.query(
        `UPDATE account_lockouts
         SET failed_attempts = 0, locked_until = NULL, lockout_duration = 0
         WHERE user_id = $1`,
        [userId]
      );

      // Log the successful attempt
      await client.query(
        `INSERT INTO login_attempts (user_id, success, ip_address, attempt_at)
         VALUES ($1, true, $2, NOW())`,
        [userId, ip]
      );

      await client.query('COMMIT');

      logger.info('Successful login recorded', { userId, ip });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error recording successful login', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if account is currently locked
   */
  async isAccountLocked(userId: string): Promise<{
    isLocked: boolean;
    lockedUntil: Date | null;
    failedAttempts: number;
  }> {
    const record = await this.getLockoutRecord(userId);

    const isLocked = record.lockedUntil !== null && record.lockedUntil > new Date();

    return {
      isLocked,
      lockedUntil: isLocked ? record.lockedUntil : null,
      failedAttempts: record.failedAttempts,
    };
  }

  /**
   * Manually unlock an account (admin action)
   */
  async unlockAccount(userId: string, adminId: string): Promise<void> {
    await this.pool.query(
      `UPDATE account_lockouts
       SET failed_attempts = 0, locked_until = NULL, lockout_duration = 0
       WHERE user_id = $1`,
      [userId]
    );

    logger.info('Account manually unlocked', {
      userId,
      unlockedBy: adminId,
    });
  }

  /**
   * Get lockout statistics for monitoring
   */
  async getLockoutStats(timeWindow: number = 24): Promise<{
    totalLocked: number;
    totalAttempts: number;
    failedAttempts: number;
    topIPs: Array<{ ip: string; count: number }>;
  }> {
    const windowStart = new Date(Date.now() - timeWindow * 60 * 60 * 1000);

    const [lockedCount, attemptStats, topIPs] = await Promise.all([
      // Count currently locked accounts
      this.pool.query(
        `SELECT COUNT(*) as count
         FROM account_lockouts
         WHERE locked_until > NOW()`
      ),
      
      // Count login attempts
      this.pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE success = false) as failed
         FROM login_attempts
         WHERE attempt_at > $1`,
        [windowStart]
      ),
      
      // Top IPs with failed attempts
      this.pool.query(
        `SELECT ip_address as ip, COUNT(*) as count
         FROM login_attempts
         WHERE success = false AND attempt_at > $1
         GROUP BY ip_address
         ORDER BY count DESC
         LIMIT 10`,
        [windowStart]
      ),
    ]);

    return {
      totalLocked: parseInt(lockedCount.rows[0].count),
      totalAttempts: parseInt(attemptStats.rows[0].total),
      failedAttempts: parseInt(attemptStats.rows[0].failed),
      topIPs: topIPs.rows,
    };
  }

  /**
   * Clean up old lockout records
   */
  async cleanupOldRecords(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `DELETE FROM login_attempts
       WHERE attempt_at < $1`,
      [cutoffDate]
    );

    logger.info('Cleaned up old login attempt records', {
      deleted: result.rowCount,
      cutoffDate,
    });

    return result.rowCount || 0;
  }

  /**
   * Get lockout record for a user
   */
  private async getLockoutRecord(
    userId: string,
    client?: any
  ): Promise<LockoutRecord> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT user_id, failed_attempts, locked_until, last_attempt_at, lockout_duration
       FROM account_lockouts
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        userId,
        failedAttempts: 0,
        lockedUntil: null,
        lastAttemptAt: new Date(),
        lockoutDuration: 0,
      };
    }

    return {
      userId: result.rows[0].user_id,
      failedAttempts: result.rows[0].failed_attempts,
      lockedUntil: result.rows[0].locked_until,
      lastAttemptAt: result.rows[0].last_attempt_at,
      lockoutDuration: result.rows[0].lockout_duration,
    };
  }

  /**
   * Calculate lockout duration with exponential backoff
   */
  private calculateLockoutDuration(lockoutNumber: number): number {
    const config = securityConfig.authentication.lockout;
    
    if (!config.exponentialBackoff) {
      return config.lockoutDurationMinutes;
    }

    // Exponential backoff: base duration * 2^(lockoutNumber - 1)
    const duration = config.lockoutDurationMinutes * Math.pow(2, lockoutNumber - 1);
    
    // Cap at maximum lockout duration
    return Math.min(duration, config.maxLockoutDurationMinutes);
  }
}

export default AccountLockoutService;
