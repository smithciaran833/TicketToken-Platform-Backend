import { FastifyReply } from 'fastify';
import { ValidationError } from '../errors';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { stripHtml } from '../utils/sanitize';

export class ProfileController {
  async getProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id;

    try {
      const result = await pool.query(
        `SELECT
          id,
          email,
          first_name,
          last_name,
          phone,
          email_verified,
          mfa_enabled,
          role,
          tenant_id,
          created_at,
          updated_at,
          last_login_at,
          password_changed_at
        FROM users
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      return reply.send({
        success: true,
        user: result.rows[0]
      });
    } catch (error) {
      console.error('Failed to get profile', { error, userId });
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async updateProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id;
    const updates = request.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    };

    try {
      const allowedUpdates: any = {};

      if (updates.firstName !== undefined) {
        // Strip HTML tags to prevent XSS
        allowedUpdates.first_name = stripHtml(updates.firstName);
      }
      if (updates.lastName !== undefined) {
        // Strip HTML tags to prevent XSS
        allowedUpdates.last_name = stripHtml(updates.lastName);
      }
      if (updates.phone !== undefined) {
        allowedUpdates.phone = updates.phone;
      }
      if (updates.email !== undefined) {
        // Email change requires re-verification
        allowedUpdates.email = updates.email.toLowerCase();
        allowedUpdates.email_verified = false;
      }

      if (Object.keys(allowedUpdates).length === 0) {
        throw new ValidationError(['No valid fields to update']);
      }

      // Build update query
      const fields = Object.keys(allowedUpdates);
      const values = Object.values(allowedUpdates);
      const setClause = fields.map((field, i) => `${field} = $${i + 3}`).join(', ');

      await pool.query(
        `UPDATE users
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2`,
        [userId, tenantId, ...values]
      );

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id,
          ip_address, user_agent, metadata, success, service, action_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          'profile_updated',
          'user',
          userId,
          request.ip,
          request.headers['user-agent'],
          JSON.stringify({ updated_fields: fields }),
          true,
          'auth-service',
          'data'
        ]
      );

      return this.getProfile(request, reply);
    } catch (error) {
      console.error('Failed to update profile', { error, userId });

      if (error instanceof ValidationError) {
        return reply.status(422).send({
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR'
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Failed to update profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }
}
