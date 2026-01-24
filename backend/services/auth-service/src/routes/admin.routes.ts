/**
 * Admin Routes
 *
 * Routes for admin-only operations like tenant management.
 * Part of TODO #9: Tenant Cache Invalidation implementation.
 */

import { FastifyInstance } from 'fastify';
import * as adminController from '../controllers/admin.controller';
import { createAuthMiddleware } from '../middleware/auth.middleware';
import { Container } from '../config/dependencies';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'AdminRoutes' });

/**
 * Require admin role middleware
 */
async function requireAdmin(request: any, reply: any): Promise<void> {
  const user = request.user;

  if (!user) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const allowedRoles = ['admin', 'superadmin'];

  if (!allowedRoles.includes(user.role)) {
    log.warn('Unauthorized admin access attempt', {
      userId: user.id,
      role: user.role,
      path: request.url,
    });

    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }
}

/**
 * Schema for tenant status update
 */
const updateTenantStatusSchema = {
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'suspended', 'inactive'],
        description: 'New tenant status',
      },
    },
  },
  params: {
    type: 'object',
    required: ['tenantId'],
    properties: {
      tenantId: {
        type: 'string',
        format: 'uuid',
        description: 'Tenant ID',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            tenant: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                status: { type: 'string' },
                updatedAt: { type: 'string' },
              },
            },
            previousStatus: { type: 'string' },
            cacheInvalidated: { type: 'boolean' },
          },
        },
        message: { type: 'string' },
      },
    },
  },
};

/**
 * Schema for getting tenant
 */
const getTenantSchema = {
  params: {
    type: 'object',
    required: ['tenantId'],
    properties: {
      tenantId: {
        type: 'string',
        format: 'uuid',
        description: 'Tenant ID',
      },
    },
  },
};

/**
 * Schema for listing tenants
 */
const listTenantsSchema = {
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'suspended', 'inactive'],
        description: 'Filter by status',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Maximum number of results',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Offset for pagination',
      },
    },
  },
};

/**
 * Register admin routes
 */
export async function adminRoutes(
  fastify: FastifyInstance,
  options: { container: Container }
): Promise<void> {
  const { container } = options;

  // Get services for auth middleware
  const jwtService = container.resolve('jwtService');
  const rbacService = container.resolve('rbacService');
  const authMiddleware = createAuthMiddleware(jwtService, rbacService);

  // All admin routes require authentication + admin role
  fastify.addHook('preHandler', async (request, reply) => {
    await authMiddleware.authenticate(request, reply);
    if (!reply.sent) {
      await requireAdmin(request, reply);
    }
  });

  /**
   * @openapi
   * /admin/tenants:
   *   get:
   *     summary: List all tenants
   *     description: Admin-only endpoint to list all tenants with optional status filter
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: status
   *         in: query
   *         schema:
   *           type: string
   *           enum: [active, suspended, inactive]
   *       - name: limit
   *         in: query
   *         schema:
   *           type: integer
   *           default: 50
   *       - name: offset
   *         in: query
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: List of tenants
   */
  fastify.get('/tenants', {
    schema: listTenantsSchema,
  }, adminController.listTenants);

  /**
   * @openapi
   * /admin/tenants/{tenantId}:
   *   get:
   *     summary: Get tenant by ID
   *     description: Admin-only endpoint to get tenant details
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: tenantId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Tenant details
   *       404:
   *         description: Tenant not found
   */
  fastify.get('/tenants/:tenantId', {
    schema: getTenantSchema,
  }, adminController.getTenant);

  /**
   * @openapi
   * /admin/tenants/{tenantId}/status:
   *   put:
   *     summary: Update tenant status
   *     description: |
   *       Admin-only endpoint to update tenant status.
   *       This will invalidate tenant caches across all services.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: tenantId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [status]
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [active, suspended, inactive]
   *     responses:
   *       200:
   *         description: Tenant status updated
   *       400:
   *         description: Invalid status
   *       404:
   *         description: Tenant not found
   */
  fastify.put('/tenants/:tenantId/status', {
    schema: updateTenantStatusSchema,
  }, adminController.updateTenantStatus);

  log.info('Admin routes registered');
}
