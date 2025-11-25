/**
 * Session Manager Service
 * Manages user sessions with idle timeout and absolute timeout enforcement
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { securityConfig } from '../config/security.config';
import * as crypto from 'crypto';

interface Session {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  data: Record<string, any>;
}

export class SessionManagerService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    ipAddress: string,
    userAgent: string,
    data: Record<string, any> = {}
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const config = securityConfig.authentication.session;

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + config.absoluteTimeoutHours * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO sessions (session_id, user_id, created_at, last_activity_at, expires_at, ip_address, user_agent, data)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7)`,
      [sessionId, userId, createdAt, expiresAt, ipAddress, userAgent, JSON.stringify(data)]
    );

    logger.info('Session created', {
      sessionId,
      userId,
      ipAddress,
    });

    return sessionId;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const result = await this.pool.query(
      `SELECT session_id, user_id, created_at, last_activity_at, expires_at, ip_address, user_agent, data
       FROM sessions
       WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  /**
   * Validate and refresh session
   */
  async validateSession(sessionId: string): Promise<{
    valid: boolean;
    session: Session | null;
    reason?: string;
  }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { valid: false, session: null, reason: 'Session not found' };
    }

    const now = new Date();
    const config = securityConfig.authentication.session;

    // Check absolute timeout
    if (session.expiresAt < now) {
      await this.deleteSession(sessionId);
      return { valid: false, session: null, reason: 'Session expired (absolute timeout)' };
    }

    // Check idle timeout
    const idleTimeoutMs = config.idleTimeoutMinutes * 60 * 1000;
    const idleDeadline = new Date(session.lastActivityAt.getTime() + idleTimeoutMs);

    if (idleDeadline < now) {
      await this.deleteSession(sessionId);
      return { valid: false, session: null, reason: 'Session expired (idle timeout)' };
    }

    // Update last activity
    await this.updateLastActivity(sessionId);

    return { valid: true, session };
  }

  /**
   * Update session data
   */
  async updateSessionData(sessionId: string, data: Record<string, any>): Promise<void> {
    await this.pool.query(
      `UPDATE sessions
       SET data = $2, last_activity_at = NOW()
       WHERE session_id = $1`,
      [sessionId, JSON.stringify(data)]
    );
  }

  /**
   * Delete session (logout)
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM sessions WHERE session_id = $1`,
      [sessionId]
    );

    logger.info('Session deleted', { sessionId });
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sessions WHERE user_id = $1`,
      [userId]
    );

    logger.info('All user sessions deleted', {
      userId,
      count: result.rowCount,
    });

    return result.rowCount || 0;
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    const result = await this.pool.query(
      `SELECT session_id, user_id, created_at, last_activity_at, expires_at, ip_address, user_agent, data
       FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_activity_at DESC`,
      [userId]
    );

    return result.rows.map(row => this.rowToSession(row));
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sessions WHERE expires_at < NOW()`
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Expired sessions cleaned up', {
        count: result.rowCount,
      });
    }

    return result.rowCount || 0;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalActiveSessions: number;
    uniqueUsers: number;
    avgSessionDuration: number;
  }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(EXTRACT(EPOCH FROM (last_activity_at - created_at))) as avg_duration
      FROM sessions
      WHERE expires_at > NOW()
    `);

    return {
      totalActiveSessions: parseInt(result.rows[0].total),
      uniqueUsers: parseInt(result.rows[0].unique_users),
      avgSessionDuration: parseFloat(result.rows[0].avg_duration || '0'),
    };
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string): Promise<void> {
    const config = securityConfig.authentication.session;
    const newExpiresAt = new Date(Date.now() + config.absoluteTimeoutHours * 60 * 60 * 1000);

    await this.pool.query(
      `UPDATE sessions
       SET expires_at = $2, last_activity_at = NOW()
       WHERE session_id = $1`,
      [sessionId, newExpiresAt]
    );

    logger.debug('Session extended', { sessionId });
  }

  /**
   * Update last activity timestamp
   */
  private async updateLastActivity(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions
       SET last_activity_at = NOW()
       WHERE session_id = $1`,
      [sessionId]
    );
  }

  /**
   * Generate a secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Convert database row to Session object
   */
  private rowToSession(row: any): Session {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    };
  }
}

export default SessionManagerService;
