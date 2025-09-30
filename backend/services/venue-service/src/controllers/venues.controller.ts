import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVenueSchema, updateVenueSchema, venueQuerySchema } from '../schemas/venue.schema';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { settingsRoutes } from './settings.controller';
import { integrationRoutes } from './integrations.controller';

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
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}


// Helper to verify venue ownership
async function verifyVenueOwnership(request: any, reply: any, venueService: any) {
  const { venueId } = request.params;
  const userId = request.user?.id;
  const tenantId = request.tenantId;

  // Check if user has access to this venue
  const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
  if (!hasAccess) {
    throw new ForbiddenError('Access denied to this venue');
  }

  const venue = await venueService.getVenue(venueId, userId);
  if (!venue) {
    throw new NotFoundError('Venue not found');
  }

  request.venue = venue;
}

export async function venueRoutes(fastify: FastifyInstance) {
  const container = (fastify as any).container;
  const { venueService, logger } = container.cradle;

  // List venues - SECURED (optional auth for filtering)
  fastify.get('/',
    {
      preHandler: [authenticate, validate(venueQuerySchema)]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to authenticate but don't require it
        let user = null;
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) {
          try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_production_12345678901234567890');
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

        // Check access first
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        // Get the venue
        const venue = await venueService.getVenue(venueId, userId);
        if (!venue) {
          return reply.status(404).send({ error: 'Venue not found' });
        }

        venueOperations.inc({ operation: 'read', status: 'success' });
        return reply.send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'read', status: 'error' });
        logger.error({ error }, 'Failed to get venue');
        return reply.status(500).send({ error: 'Internal server error' });
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
          totalCapacity: venue.capacity,
          available: venue.capacity,
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
  fastify.delete('/:venueId',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // Verify ownership - only owner can delete
        await verifyVenueOwnership(request, reply, venueService);

        // Additional check - must be owner, not just staff
        const venue = request.venue;
        if (venue.owner_id !== userId) {
          throw new ForbiddenError('Only venue owner can delete venue');
        }

        await venueService.deleteVenue(venueId, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue deleted');
        venueOperations.inc({ operation: 'delete', status: 'success' });

        return reply.status(204).send();
      } catch (error: any) {
        venueOperations.inc({ operation: 'delete', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
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
  fastify.post('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const requesterId = request.user?.id;
        const body = request.body;

        // Verify venue ownership
        try {
          await verifyVenueOwnership(request, reply, venueService);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return reply.status(403).send({ error: error.message });
          }
          if (error instanceof NotFoundError) {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }

        // The test sends {email, role} but we need {userId, role}
        // For the test to work, we need to accept the registered user's ID
        // The test should be sending userId, not email

        if (!body.userId) {
          return reply.status(400).send({
            error: 'userId is required to add staff member'
          });
        }

        // Add staff member with the actual userId
        const staffData = {
          userId: body.userId,
          role: body.role,
          permissions: body.permissions || []
        };

        const staffMember = await venueService.addStaffMember(venueId, staffData, requesterId);

        return reply.status(201).send(staffMember);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to add staff');
        return ErrorResponseBuilder.internal(reply, 'Failed to add staff member');
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
