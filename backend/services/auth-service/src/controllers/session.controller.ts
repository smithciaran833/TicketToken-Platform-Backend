import { FastifyReply } from 'fastify';
import { db } from '../config/database';
import { AuthenticatedRequest } from '../types';

export class SessionController {
  async listSessions(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id;

    try {
      const sessions = await db('user_sessions')
        .where({ user_id: userId })
        .whereIn('user_id', function() {
          this.select('id').from('users').where({ tenant_id: tenantId });
        })
        .whereNull('revoked_at')
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'desc')
        .select(
          'id',
          'ip_address',
          'user_agent',
          'created_at',
          'expires_at',
          db.raw('CASE WHEN session_token = ? THEN true ELSE false END as is_current', [request.headers.authorization?.replace('Bearer ', '')])
        );

      return reply.send({
        success: true,
        data: sessions
      });
    } catch (error) {
      // Optional: add logging if needed
      // console.error('Failed to list sessions', { error, userId });
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
      const session = await db('user_sessions')
        .where({ id: sessionId, user_id: userId })
        .whereIn('user_id', function() {
          this.select('id').from('users').where({ tenant_id: tenantId });
        })
        .whereNull('revoked_at')
        .first();

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      // Revoke the session
      await db('user_sessions')
        .where({ id: sessionId })
        .update({ revoked_at: new Date() });

      // Audit log
      await db('audit_logs').insert({
        user_id: userId,
        action: 'session_revoked',
        resource_type: 'session',
        resource_id: sessionId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        metadata: {
          revoked_session_ip: session.ip_address,
          revoked_session_user_agent: session.user_agent
        },
        status: 'success'
      });

      return reply.send({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error) {
      // Optional: add logging if needed
      // console.error('Failed to revoke session', { error, userId, sessionId });
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
    const currentToken = request.headers.authorization?.replace('Bearer ', '');

    try {
      // Revoke all sessions except current (with tenant validation)
      const result = await db('user_sessions')
        .where({ user_id: userId })
        .whereIn('user_id', function() {
          this.select('id').from('users').where({ tenant_id: tenantId });
        })
        .whereNull('revoked_at')
        .whereNot('session_token', currentToken)
        .update({ revoked_at: new Date() });

      // Audit log
      await db('audit_logs').insert({
        user_id: userId,
        action: 'all_sessions_invalidated',
        resource_type: 'session',
        resource_id: userId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        metadata: {
          sessions_revoked: result,
          kept_current_session: true
        },
        status: 'success'
      });

      return reply.send({
        success: true,
        message: `${result} sessions invalidated`,
        sessions_revoked: result
      });
    } catch (error) {
      // Optional: add logging if needed
      // console.error('Failed to invalidate all sessions', { error, userId });
      return reply.status(500).send({
        success: false,
        error: 'Failed to invalidate sessions',
        code: 'INTERNAL_ERROR'
      });
    }
  }
}
