/**
 * Admin Controller
 *
 * Handles admin-only operations like tenant management.
 * Part of TODO #9: Tenant Cache Invalidation implementation.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantService, TenantStatus } from '../services/tenant.service';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'AdminController' });

/**
 * Request type for updating tenant status
 */
interface UpdateTenantStatusRequest {
  Params: {
    tenantId: string;
  };
  Body: {
    status: TenantStatus;
  };
}

/**
 * Request type for listing tenants
 */
interface ListTenantsRequest {
  Querystring: {
    status?: TenantStatus;
    limit?: number;
    offset?: number;
  };
}

/**
 * Request type for getting a single tenant
 */
interface GetTenantRequest {
  Params: {
    tenantId: string;
  };
}

/**
 * Update tenant status
 *
 * PUT /admin/tenants/:tenantId/status
 */
export async function updateTenantStatus(
  request: FastifyRequest<UpdateTenantStatusRequest>,
  reply: FastifyReply
): Promise<void> {
  const { tenantId } = request.params;
  const { status } = request.body;
  const user = (request as any).user;

  if (!user?.id) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  log.info('Admin updating tenant status', {
    tenantId,
    newStatus: status,
    adminId: user.id,
  });

  try {
    const result = await tenantService.updateTenantStatus(tenantId, status, user.id);

    return reply.status(200).send({
      success: true,
      data: {
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          status: result.tenant.status,
          updatedAt: result.tenant.updated_at,
        },
        previousStatus: result.oldStatus,
        cacheInvalidated: result.cacheInvalidated,
      },
      message: `Tenant status updated from '${result.oldStatus}' to '${result.newStatus}'`,
    });
  } catch (error: any) {
    log.error('Failed to update tenant status', { tenantId, error: error.message });

    if (error.statusCode === 404) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Tenant not found',
      });
    }

    if (error.message?.includes('Invalid status')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to update tenant status',
    });
  }
}

/**
 * Get tenant by ID
 *
 * GET /admin/tenants/:tenantId
 */
export async function getTenant(
  request: FastifyRequest<GetTenantRequest>,
  reply: FastifyReply
): Promise<void> {
  const { tenantId } = request.params;

  try {
    const tenant = await tenantService.getTenant(tenantId);

    if (!tenant) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Tenant not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          createdAt: tenant.created_at,
          updatedAt: tenant.updated_at,
        },
      },
    });
  } catch (error: any) {
    log.error('Failed to get tenant', { tenantId, error: error.message });

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to get tenant',
    });
  }
}

/**
 * List all tenants
 *
 * GET /admin/tenants
 */
export async function listTenants(
  request: FastifyRequest<ListTenantsRequest>,
  reply: FastifyReply
): Promise<void> {
  const { status, limit = 50, offset = 0 } = request.query;

  try {
    const tenants = await tenantService.listTenants({
      status,
      limit: Math.min(limit, 100), // Cap at 100
      offset,
    });

    return reply.status(200).send({
      success: true,
      data: {
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })),
        pagination: {
          limit,
          offset,
          count: tenants.length,
        },
      },
    });
  } catch (error: any) {
    log.error('Failed to list tenants', { error: error.message });

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to list tenants',
    });
  }
}
