import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVenueSchema, updateVenueSchema, venueQuerySchema, addStaffSchema, updateStaffSchema } from '../schemas/venue.schema';
import { NotFoundError, ConflictError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { settingsRoutes } from './settings.controller';
import { integrationRoutes } from './integrations.controller';
import { getRedis } from '../config/redis';
import { idempotency } from '../middleware/idempotency.middleware';
import * as jwt from 'jsonwebtoken';

interface CreateVenueBody {
  name: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

interface UpdateVenueBody {
  name?: string;
  type?: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings?: Record<string, any>;
}

interface VenueParams {
  venueId: string;
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const tenantId = request.user?.tenant_id;
  if (!tenantId) {
    throw new UnauthorizedError('Missing tenant context');
  }
  request.tenantId = tenantId;
}


// Helper to verify venue ownership
// FIXED: Only check access, don't fetch venue (service methods will handle that)
async function verifyVenueOwnership(request: any, reply: any, venueService: any) {
  const { venueId } = request.params;
  const userId = request.user?.id;
  const tenantId = request.tenantId;

  // Check if user has access to this venue
  const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
  if (!hasAccess) {
    throw new ForbiddenError('Access denied to this venue');
  }
}

export async function venueRoutes(fastify: FastifyInstance) {
  const container = (fastify as any).container;
  const { venueService, logger } = container.cradle;
  const redis = getRedis();

  // SECURITY FIX: Rate limiting middleware using Redis
  const createSimpleRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      // Skip rate limiting in tests
      if (process.env.DISABLE_RATE_LIMIT === 'true') {
        return;
      }

      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:venues:${key}:${Date.now() - (Date.now() % windowMs)}`;

      try {
        const current = await redis.incr(redisKey);
        if (current === 1) {
          await redis.expire(redisKey, Math.ceil(windowMs / 1000));
        }

        reply.header('X-RateLimit-Limit', max.toString());
        reply.header('X-RateLimit-Remaining', Math.max(0, max - current).toString());

        if (current > max) {
          reply.header('Retry-After', Math.ceil(windowMs / 1000).toString());
          return reply.status(429).send({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds`
          });
        }
      } catch (error) {
        // Fail open if Redis is unavailable
        fastify.log.warn({ error }, 'Rate limit check failed, allowing request');
      }
    };
  };

  const rateLimiter = createSimpleRateLimiter(100, 60000); // 100 requests per minute
  const writeRateLimiter = createSimpleRateLimiter(20, 60000); // 20 writes per minute

  // List venues - SECURED (authentication required for tenant context)
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext, validate(venueQuerySchema), rateLimiter]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const tenantId = (request as any).tenantId;
        const query = request.query as any;
        let venues;

        if (query.my_venues) {
          // If my_venues flag is set, show only user's venues
          venues = await venueService.listUserVenues(user.id, tenantId, query);
        } else {
          // Show venues for this tenant
          venues = await venueService.listVenues(tenantId, query);
        }

        return reply.send({
          success: true,
          data: venues,
          pagination: {
            limit: query.limit || 20,
            offset: query.offset || 0
          }
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to list venues');
        return ErrorResponseBuilder.internal(reply, 'Failed to list venues');
      }
    }
  );

  // Create venue - SECURED
  fastify.post('/',
    {
      preHandler: [authenticate, addTenantContext, validate(createVenueSchema), idempotency('venue', { required: false }), writeRateLimiter]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const tenantId = (request as any).tenantId;
        const body = request.body as CreateVenueBody;

        const venue = await venueService.createVenue(body, user.id, tenantId, {
          requestId: request.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        });

        logger.info({ venueId: venue.id, userId: user.id, tenantId }, 'Venue created');
        venueOperations.inc({ operation: 'create', status: 'success' });

        return reply.status(201).send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'create', status: 'error' });
        if (error.message?.includes('already exists')) {
          throw new ConflictError(error.message);
        }
        throw error;
      }
    }
  );

  // List user's venues - SECURED
  fastify.get('/user',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const tenantId = request.tenantId;
        // SECURITY FIX: Pass tenantId to service
        const venues = await venueService.listUserVenues(userId, tenantId, {});
        return reply.send(venues);
      } catch (error: any) {
        logger.error({ error, userId: request.user?.id }, 'Failed to list user venues');
        return ErrorResponseBuilder.internal(reply, 'Failed to list user venues');
      }
    }
  );

  // Get venue by ID - SECURED
  fastify.get('/:venueId',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // SECURITY FIX: Pass tenantId to service
        const venue = await venueService.getVenue(venueId, userId, tenantId);
        if (!venue) {
          throw new NotFoundError('Venue');
        }

        venueOperations.inc({ operation: 'read', status: 'success' });
        return reply.send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'read', status: 'error' });
        throw error;
      }
    }
  );

  // Get venue capacity - SECURED (NEW ENDPOINT)
  fastify.get('/:venueId/capacity',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // SECURITY FIX: Pass tenantId to access check
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        // SECURITY FIX: Pass tenantId to service
        const venue = await venueService.getVenue(venueId, userId, tenantId);
        if (!venue) {
          return reply.status(404).send({ error: 'Venue not found' });
        }

        // TODO: Calculate available capacity from active events
        // For now, return total capacity as available
        return reply.send({
          venueId: venue.id,
          venueName: venue.name,
          totalCapacity: venue.max_capacity,
          available: venue.max_capacity,
          reserved: 0,
          utilized: 0
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get venue capacity');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get venue stats - SECURED (NEW ENDPOINT)
  fastify.get('/:venueId/stats',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // SECURITY FIX: Pass tenantId to access check
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        // SECURITY FIX: Pass tenantId to service
        const stats = await venueService.getVenueStats(venueId, tenantId);
        if (!stats) {
          return reply.status(404).send({ error: 'Venue not found' });
        }

        return reply.send(stats);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get venue stats');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update venue - SECURED
  fastify.put('/:venueId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateVenueSchema), writeRateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;
        const body = request.body as UpdateVenueBody;

        // Verify ownership
        await verifyVenueOwnership(request, reply, venueService);

        const updatedVenue = await venueService.updateVenue(venueId, body, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue updated');
        venueOperations.inc({ operation: 'update', status: 'success' });

        return reply.send(updatedVenue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'update', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update venue');
        return ErrorResponseBuilder.internal(reply, 'Failed to update venue');
      }
    }
  );

  // Delete venue - SECURED
  // FIXED: Let service handle ownership check, it already does this
  fastify.delete('/:venueId',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // Service method will check if user is owner
        await venueService.deleteVenue(venueId, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue deleted');
        venueOperations.inc({ operation: 'delete', status: 'success' });

        return reply.status(204).send();
      } catch (error: any) {
        venueOperations.inc({ operation: 'delete', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
        }
        // Check for the generic error from service
        if (error.message === 'Only venue owners can delete venues') {
          return reply.status(403).send({ error: error.message });
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to delete venue');
        return ErrorResponseBuilder.internal(reply, 'Failed to delete venue');
      }
    }
  );

  // Check venue access - SECURED (used by other services)
  // FIXED: Return 200 with hasAccess: false instead of 403 for non-staff/inactive users
  // This endpoint is a query to CHECK access status, not to REQUIRE access
  fastify.get('/:venueId/check-access',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);

        // If no access, return 200 with hasAccess: false (this is a query endpoint)
        if (!hasAccess) {
          return reply.send({
            hasAccess: false,
            role: null,
            permissions: []
          });
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId, tenantId);

        return reply.send({
          hasAccess: true,
          role: accessDetails?.role || null,
          permissions: accessDetails?.permissions || []
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to check access');
        return reply.status(500).send({ error: 'Failed to check access' });
      }
    }
  );

  // =========================================
  // STAFF MANAGEMENT ROUTES
  // =========================================

  // Add staff member - SECURED
  fastify.post('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext, validate(addStaffSchema), writeRateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const requesterId = request.user?.id;
        const body = request.body;

        try {
          await verifyVenueOwnership(request, reply, venueService);
        } catch (error: any) {
          if (error.statusCode === 403 || error.name === 'ForbiddenError') {
            return reply.status(403).send({ error: error.message });
          }
          if (error.statusCode === 404 || error.name === 'NotFoundError') {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }

        const staffData = {
          userId: body.userId,
          role: body.role,
          permissions: body.permissions || []
        };

        const tenantId = request.tenantId;
        const staffMember = await venueService.addStaffMember(venueId, staffData, requesterId, tenantId);

        return reply.status(201).send(staffMember);
      } catch (error: any) {
        if (error.statusCode === 403 || error.name === 'ForbiddenError') {
          return reply.status(403).send({ error: error.message });
        }
        if (error.statusCode === 404 || error.name === 'NotFoundError') {
          return reply.status(404).send({ error: error.message });
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to add staff');
        return reply.status(500).send({ error: 'Failed to add staff member' });
      }
    }
  );

  // List staff members - SECURED
  fastify.get('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        await verifyVenueOwnership(request, reply, venueService);

        const staff = await venueService.getVenueStaff(venueId, userId, tenantId);

        return reply.send(staff);
      } catch (error: any) {
        if (error.statusCode === 403 || error.name === 'ForbiddenError') {
          return reply.status(403).send({ error: error.message });
        }
        if (error.statusCode === 404 || error.name === 'NotFoundError') {
          return reply.status(404).send({ error: error.message });
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get staff');
        return ErrorResponseBuilder.internal(reply, 'Failed to get staff list');
      }
    }
  );

  // Update staff role - SECURED
  fastify.patch('/:venueId/staff/:staffId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateStaffSchema), writeRateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId, staffId } = request.params;
        const requesterId = request.user?.id;
        const { role, permissions } = request.body;

        try {
          await verifyVenueOwnership(request, reply, venueService);
        } catch (error: any) {
          if (error.statusCode === 403 || error.name === 'ForbiddenError') {
            return reply.status(403).send({ error: error.message });
          }
          if (error.statusCode === 404 || error.name === 'NotFoundError') {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }

        const updatedStaff = await venueService.updateStaffRole(venueId, staffId, role, requesterId, permissions);

        logger.info({ venueId, staffId, role, requesterId }, 'Staff role updated');

        return reply.send(updatedStaff);
      } catch (error: any) {
        if (error.statusCode === 403 || error.name === 'ForbiddenError') {
          return reply.status(403).send({ error: error.message });
        }
        if (error.message === 'Staff member not found') {
          return reply.status(404).send({ error: error.message });
        }
        logger.error({ error, venueId: request.params.venueId, staffId: request.params.staffId }, 'Failed to update staff role');
        return reply.status(500).send({ error: 'Failed to update staff role' });
      }
    }
  );

  // Remove staff member - SECURED
  fastify.delete('/:venueId/staff/:staffId',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId, staffId } = request.params;
        const requesterId = request.user?.id;

        try {
          await verifyVenueOwnership(request, reply, venueService);
        } catch (error: any) {
          if (error.statusCode === 403 || error.name === 'ForbiddenError') {
            return reply.status(403).send({ error: error.message });
          }
          if (error.statusCode === 404 || error.name === 'NotFoundError') {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }

        await venueService.removeStaffMember(venueId, staffId, requesterId);

        logger.info({ venueId, staffId, requesterId }, 'Staff member removed');

        return reply.status(204).send();
      } catch (error: any) {
        if (error.statusCode === 403 || error.name === 'ForbiddenError') {
          return reply.status(403).send({ error: error.message });
        }
        if (error.message === 'Staff member not found') {
          return reply.status(404).send({ error: error.message });
        }
        if (error.message === 'Cannot remove yourself') {
          return reply.status(400).send({ error: error.message });
        }
        logger.error({ error, venueId: request.params.venueId, staffId: request.params.staffId }, 'Failed to remove staff');
        return reply.status(500).send({ error: 'Failed to remove staff member' });
      }
    }
  );

  // Register nested route groups
  await fastify.register(settingsRoutes, { prefix: '/:venueId/settings' });
  await fastify.register(integrationRoutes, { prefix: '/:venueId/integrations' });

  // Import and register other nested routes
  const { complianceRoutes } = await import('./compliance.controller');

  await fastify.register(complianceRoutes, { prefix: '/:venueId/compliance' });
  const { analyticsRoutes } = await import('./analytics.controller');
  await fastify.register(analyticsRoutes, { prefix: '/:venueId/analytics' });
}
