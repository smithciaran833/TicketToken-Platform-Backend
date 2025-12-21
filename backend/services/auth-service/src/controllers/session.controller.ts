import { FastifyReply } from 'fastify';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../types';

export class SessionController {
  async listSessions(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id;

    try {
      const result = await pool.query(
        `SELECT 
          s.id,
          s.ip_address,
          s.user_agent,
          s.started_at,
          s.ended_at,
          s.revoked_at,
          s.metadata,
          u.id as user_id
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.user_id = $1 
          AND u.tenant_id = $2 
          AND s.ended_at IS NULL
        ORDER BY s.started_at DESC`,
        [userId, tenantId]
      );

      return reply.send({
        success: true,
        sessions: result.rows
      });
    } catch (error) {
      console.error('Failed to list sessions', { error, userId });
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve sessions',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async revokeSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id;
    const { sessionId } = request.params as { sessionId: string };

    try {
      // Verify session belongs to user AND tenant
      const sessionResult = await pool.query(
        `SELECT s.* 
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = $1 
           AND s.user_id = $2 
           AND u.tenant_id = $3 
           AND s.revoked_at IS NULL`,
        [sessionId, userId, tenantId]
      );

      if (sessionResult.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      // Revoke the session
      await pool.query(
        `UPDATE user_sessions 
         SET revoked_at = CURRENT_TIMESTAMP, ended_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [sessionId]
      );

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (
          service, action_type, resource_type, user_id, action,
          resource_id, ip_address, user_agent, metadata, success
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          'auth-service',
          'security',
          'session',
          userId,
          'session_revoked',
          sessionId,
          request.ip,
          request.headers['user-agent'],
          JSON.stringify({
            revoked_session_ip: sessionResult.rows[0].ip_address,
            revoked_session_user_agent: sessionResult.rows[0].user_agent
          }),
          true
        ]
      );

      return reply.send({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error) {
      console.error('Failed to revoke session', { error, userId, sessionId });
      return reply.status(500).send({
        success: false,
        error: 'Failed to revoke session',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async invalidateAllSessions(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id;

    try {
      // First verify user belongs to tenant
      const userCheck = await pool.query(
        `SELECT id FROM users 
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (userCheck.rows.length === 0) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          code: 'FORBIDDEN'
        });
      }

      // End all active sessions for this user
      const result = await pool.query(
        `UPDATE user_sessions 
         SET ended_at = CURRENT_TIMESTAMP, revoked_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 AND ended_at IS NULL
         RETURNING id`,
        [userId]
      );

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (
          service, action_type, resource_type, user_id, action,
          resource_id, ip_address, user_agent, metadata, success, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
        [
          'auth-service',
          'security',
          'session',
          userId,
          'all_sessions_invalidated',
          userId,
          request.ip,
          request.headers['user-agent'],
          JSON.stringify({
            sessions_revoked: result.rowCount,
            kept_current_session: false
          }),
          true
        ]
      );

      return reply.send({
        success: true,
        message: `${result.rowCount} sessions invalidated`,
        sessions_revoked: result.rowCount
      });
    } catch (error) {
      console.error('Failed to invalidate all sessions', { error, userId });
      return reply.status(500).send({
        success: false,
        error: 'Failed to invalidate sessions',
        code: 'INTERNAL_ERROR'
      });
    }
  }
}
