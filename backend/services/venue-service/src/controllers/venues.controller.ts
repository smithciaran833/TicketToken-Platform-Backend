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
// SECURITY FIX (C1, C2): Import serializers to prevent data leakage
import { serializeVenue, serializeVenues } from '../serializers/venue.serializer';
import { serializeStaff, serializeStaffList } from '../serializers/staff.serializer';

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

interface StaffParams extends VenueParams {
  staffId: string;
}

interface VenueQueryParams {
  my_venues?: boolean;
  limit?: number;
  offset?: number;
  status?: string;
}

interface AddStaffBody {
  userId: string;
  role: string;
  permissions?: string[];
}

interface UpdateStaffBody {
  role?: string;
  permissions?: string[];
}

/**
 * TYPE SAFETY (M1): Typed request with user and tenant context
 * Used by authenticated routes after middleware adds user/tenant
 */
interface AuthenticatedVenueRequest extends FastifyRequest {
  user: { id: string; tenant_id: string; email: string };
  tenantId: string;
}

// Helper middleware for tenant context
async function addTenantContext(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = (request as AuthenticatedVenueRequest).user;
  if (!user?.tenant_id) {
    throw new UnauthorizedError('Missing tenant context');
  }
  (request as AuthenticatedVenueRequest).tenantId = user.tenant_id;
}


// Helper to verify venue ownership
// FIXED: Only check access, don't fetch venue (service methods will handle that)
async function verifyVenueOwnership(
  request: FastifyRequest<{ Params: VenueParams }>,
  reply: FastifyReply,
  venueService: { checkVenueAccess: (venueId: string, userId: string, tenantId: string) => Promise<boolean> }
): Promise<void> {
  const { venueId } = request.params;
  const userId = (request as AuthenticatedVenueRequest).user?.id;
  const tenantId = (request as AuthenticatedVenueRequest).tenantId;

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

        // SECURITY FIX (C1): Serialize venues to prevent data leakage
        return reply.send({
          success: true,
          data: serializeVenues(venues),
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

        // SECURITY FIX (C1): Serialize venue to prevent data leakage
        return reply.status(201).send(serializeVenue(venue));
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
        // SECURITY FIX (C1): Serialize venues to prevent data leakage
        return reply.send(serializeVenues(venues));
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
        // SECURITY FIX (C1): Serialize venue to prevent data leakage
        return reply.send(serializeVenue(venue));
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

        /**
         * TODO: Calculate available capacity from active events
         *
         * WHAT: Query event-service for active/upcoming events at this venue
         *       Sum tickets sold per event, subtract from max_capacity
         *       Return breakdown by event and overall availability
         *
         * CALCULATION:
         *   available = max_capacity - SUM(tickets_sold for active events)
         *   reserved = SUM(tickets in 'reserved' status, not yet paid)
         *   utilized = SUM(tickets in 'sold' or 'scanned' status)
         *
         * WHY NOT DONE: Requires cross-service call to event-service
         *               Need to define what "active event" means (today? this week?)
         *               Capacity may vary by event (different stage setups)
         *
         * IMPACT: Currently returns total capacity as available
         *         Overbooking prevention relies on event-service validation
         *
         * EFFORT: ~4 hours
         *         - Add event-service HTTP client call
         *         - Aggregate ticket counts per event
         *         - Handle concurrent events scenario
         *
         * PRIORITY: Medium - useful for venue dashboard, not critical for booking
         */
        return reply.send({
          venueId: venue.id,
          venueName: venue.name,
          totalCapacity: venue.max_capacity,
          available: venue.max_capacity, // MOCK: actual calculation pending
          reserved: 0,
          utilized: 0
        });
      } catch (error: unknown) {
        const err = error as Error;
        logger.error({
          error: err.message,
          stack: err.stack,
          venueId: (request.params as VenueParams).venueId
        }, 'Failed to get venue capacity');
        return reply.status(500).send({
          error: 'Failed to get venue capacity',
          message: err.message
        });
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
      } catch (error: unknown) {
        const err = error as Error;
        logger.error({
          error: err.message,
          stack: err.stack,
          venueId: (request.params as VenueParams).venueId
        }, 'Failed to get venue stats');
        return reply.status(500).send({
          error: 'Failed to get venue stats',
          message: err.message
        });
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

        // SECURITY FIX (C1): Serialize venue to prevent data leakage
        return reply.send(serializeVenue(updatedVenue));
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
      } catch (error: unknown) {
        const err = error as Error;
        logger.error({
          error: err.message,
          stack: err.stack,
          venueId: (request.params as VenueParams).venueId
        }, 'Failed to check access');
        return reply.status(500).send({
          error: 'Failed to check venue access',
          message: err.message
        });
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

        // SECURITY FIX (C2): Serialize staff to prevent data leakage (pin_code, hourly_rate, etc.)
        return reply.status(201).send(serializeStaff(staffMember));
      } catch (error: any) {
        if (error.statusCode === 403 || error.name === 'ForbiddenError') {
          return reply.status(403).send({ error: error.message });
        }
        if (error.statusCode === 404 || error.name === 'NotFoundError') {
          return reply.status(404).send({ error: error.message });
        }
        logger.error({
          error: error.message,
          stack: error.stack,
          venueId: (request.params as VenueParams).venueId
        }, 'Failed to add staff');
        return reply.status(500).send({
          error: 'Failed to add staff member',
          message: error.message
        });
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

        // SECURITY FIX (C2): Serialize staff list to prevent data leakage (pin_code, hourly_rate, etc.)
        return reply.send(serializeStaffList(staff));
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

        // SECURITY FIX (C2): Serialize staff to prevent data leakage
        return reply.send(serializeStaff(updatedStaff));
      } catch (error: any) {
        if (error.statusCode === 403 || error.name === 'ForbiddenError') {
          return reply.status(403).send({ error: error.message });
        }
        if (error.message === 'Staff member not found') {
          return reply.status(404).send({ error: error.message });
        }
        logger.error({
          error: error.message,
          stack: error.stack,
          venueId: (request.params as StaffParams).venueId,
          staffId: (request.params as StaffParams).staffId
        }, 'Failed to update staff role');
        return reply.status(500).send({
          error: 'Failed to update staff role',
          message: error.message
        });
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
        logger.error({
          error: error.message,
          stack: error.stack,
          venueId: (request.params as StaffParams).venueId,
          staffId: (request.params as StaffParams).staffId
        }, 'Failed to remove staff');
        return reply.status(500).send({
          error: 'Failed to remove staff member',
          message: error.message
        });
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
