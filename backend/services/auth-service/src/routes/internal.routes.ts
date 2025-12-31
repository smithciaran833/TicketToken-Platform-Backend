/**
 * Internal Routes - For service-to-service communication only
 *
 * These endpoints are protected by S2S authentication and are not
 * accessible to end users.
 */

import { FastifyInstance } from 'fastify';
import { verifyServiceToken } from '../middleware/s2s.middleware';
import { pool } from '../config/database';
import { responseSchemas } from '../validators/response.schemas';

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply S2S authentication to all routes in this group
  fastify.addHook('preHandler', verifyServiceToken);

  /**
   * Validate user permissions for a specific action
   * Called by other services to check if a user can perform an action
   */
  fastify.post('/validate-permissions', {
    schema: { response: responseSchemas.validatePermissions },
  }, async (request, reply) => {
    const { userId, permissions, venueId } = request.body as {
      userId: string;
      permissions: string[];
      venueId?: string;
    };

    try {
      // Get user with permissions
      const userResult = await pool.query(
        `SELECT id, role, permissions, tenant_id
         FROM users
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return reply.send({
          valid: false,
          reason: 'User not found',
        });
      }

      const user = userResult.rows[0];
      const userPermissions: string[] = user.permissions || [];

      // Check if user has all required permissions
      const hasPermissions = permissions.every(perm =>
        userPermissions.includes(perm) ||
        userPermissions.includes('*') ||
        user.role === 'admin' ||
        user.role === 'superadmin'
      );

      // If venue-specific, check venue roles
      let venueRole = null;
      if (venueId) {
        const venueRoleResult = await pool.query(
          `SELECT role FROM user_venue_roles
           WHERE user_id = $1 AND venue_id = $2 AND is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())`,
          [userId, venueId]
        );

        if (venueRoleResult.rows.length > 0) {
          venueRole = venueRoleResult.rows[0].role;
        }
      }

      return reply.send({
        valid: hasPermissions,
        userId,
        role: user.role,
        venueRole,
        tenantId: user.tenant_id,
      });
    } catch (error: any) {
      request.log.error({ error, userId }, 'Failed to validate permissions');
      return reply.status(500).send({
        valid: false,
        reason: 'Internal error',
      });
    }
  });

  /**
   * Bulk validate multiple users (for batch operations)
   */
  fastify.post('/validate-users', {
    schema: { response: responseSchemas.validateUsers },
  }, async (request, reply) => {
    const { userIds } = request.body as { userIds: string[] };

    if (!userIds || userIds.length === 0) {
      return reply.send({ users: [] });
    }

    if (userIds.length > 100) {
      return reply.status(400).send({
        error: 'Maximum 100 users per request',
      });
    }

    try {
      const result = await pool.query(
        `SELECT id, email, role, tenant_id, email_verified, mfa_enabled
         FROM users
         WHERE id = ANY($1) AND deleted_at IS NULL`,
        [userIds]
      );

      return reply.send({
        users: result.rows,
        found: result.rows.length,
        requested: userIds.length,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to validate users');
      return reply.status(500).send({
        error: 'Internal error',
      });
    }
  });

  /**
   * Get user's tenant context (for multi-tenant operations)
   */
  fastify.get('/user-tenant/:userId', {
    schema: { response: responseSchemas.userTenant },
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    try {
      const result = await pool.query(
        `SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug
         FROM users u
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'User not found',
        });
      }

      return reply.send(result.rows[0]);
    } catch (error: any) {
      request.log.error({ error, userId }, 'Failed to get user tenant');
      return reply.status(500).send({
        error: 'Internal error',
      });
    }
  });

  /**
   * Health check for service mesh
   */
  fastify.get('/health', {
    schema: { response: responseSchemas.internalHealth },
  }, async (request, reply) => {
    return reply.send({
      status: 'healthy',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    });
  });
}
