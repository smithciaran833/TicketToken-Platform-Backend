import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVenueSchema, updateVenueSchema, venueQuerySchema } from '../schemas/venue.schema';
import { NotFoundError, ConflictError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { settingsRoutes } from './settings.controller';
import { integrationRoutes } from './integrations.controller';
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

  // List venues - SECURED (optional auth for filtering)
  fastify.get('/',
    {
      preHandler: [validate(venueQuerySchema)]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to authenticate but don't require it
        let user = null;
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) {
          try {
            // SECURITY: JWT_ACCESS_SECRET must be set in environment
            // Service startup validation ensures this is present
            if (!process.env.JWT_ACCESS_SECRET) {
              logger.error('JWT_ACCESS_SECRET not set - authentication will fail');
              throw new Error('JWT configuration error');
            }
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET) as any;
            user = decoded;
          } catch (e) {
            // Invalid token, proceed without auth
          }
        }

        const query = request.query as any;
        let venues;

        if (query.my_venues && user) {
          // If my_venues flag is set and user is authenticated, show only user's venues
          venues = await venueService.listUserVenues(user.id, query);
        } else {
          // Show public venues only
          venues = await venueService.listVenues(query);
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
      preHandler: [authenticate, addTenantContext, validate(createVenueSchema)]
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
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const venues = await venueService.listUserVenues(userId, {});
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
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        const venue = await venueService.getVenue(venueId, userId);
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
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Check access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        const venue = await venueService.getVenue(venueId, userId);
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
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Check access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        const stats = await venueService.getVenueStats(venueId);
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
      preHandler: [authenticate, addTenantContext, validate(updateVenueSchema)]
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
      preHandler: [authenticate, addTenantContext]
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
  fastify.get('/:venueId/check-access',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        const accessDetails = await venueService.getAccessDetails(venueId, userId);

        return reply.send({
          hasAccess,
          role: accessDetails?.role || null,
          permissions: accessDetails?.permissions || []
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to check access');
        return reply.status(500).send({ error: 'Failed to check access' });
      }
    }
  );

  // Staff management routes - SECURED
  // FIX #3: Properly catch and return 403 for permission errors
  fastify.post('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const requesterId = request.user?.id;
        const body = request.body;

        // FIX #3: Properly handle ownership verification errors
        // Check by statusCode or name instead of instanceof
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

        if (!body.userId) {
          return reply.status(400).send({
            error: 'userId is required to add staff member'
          });
        }

        const staffData = {
          userId: body.userId,
          role: body.role,
          permissions: body.permissions || []
        };

        const staffMember = await venueService.addStaffMember(venueId, staffData, requesterId);

        return reply.status(201).send(staffMember);
      } catch (error: any) {
        // FIX #3: Check by statusCode or name instead of instanceof
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

  fastify.get('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Verify venue access
        await verifyVenueOwnership(request, reply, venueService);

        // Get staff list
        const staff = await venueService.getVenueStaff(venueId, userId);

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


  // Register nested route groups
  await fastify.register(settingsRoutes, { prefix: '/:venueId/settings' });
  await fastify.register(integrationRoutes, { prefix: '/:venueId/integrations' });

  // Import and register other nested routes
  const { complianceRoutes } = await import('./compliance.controller');

  await fastify.register(complianceRoutes, { prefix: '/:venueId/compliance' });
  const { analyticsRoutes } = await import('./analytics.controller');
  await fastify.register(analyticsRoutes, { prefix: '/:venueId/analytics' });
}
