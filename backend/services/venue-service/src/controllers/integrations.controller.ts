import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createIntegrationSchema, updateIntegrationSchema } from '../schemas/integration.schema';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';

interface VenueParams {
  venueId: string;
}

interface IntegrationParams extends VenueParams {
  integrationId: string;
}

interface CreateIntegrationBody {
  type: 'square' | 'stripe' | 'toast' | 'mailchimp' | 'twilio';
  config?: Record<string, any>;
  credentials: Record<string, any>;
}

interface UpdateIntegrationBody {
  config?: Record<string, any>;
  status?: 'active' | 'inactive';
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}

export async function integrationRoutes(fastify: FastifyInstance) {
  const { integrationService, venueService, logger, redis } = (fastify as any).container.cradle;

  // List venue integrations - SECURED
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'List venue integrations',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Use venueService for access checking
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const integrations = await integrationService.listVenueIntegrations(venueId);

        // Mask sensitive credentials
        const sanitized = integrations.map((i: any) => ({
          ...i,
          encrypted_credentials: undefined,
          config: {
            ...i.config,
            apiKey: i.config?.apiKey ? '***' : undefined,
            secretKey: i.config?.secretKey ? '***' : undefined
          }
        }));

        venueOperations.inc({ operation: 'list_integrations', status: 'success' });
        return reply.send(sanitized);
      } catch (error) {
        venueOperations.inc({ operation: 'list_integrations', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to list integrations');
        throw error;
      }
    }
  );

  // Create new integration - SECURED
  fastify.post('/',
    {
      preHandler: [authenticate, addTenantContext, validate(createIntegrationSchema)],
      schema: {
        tags: ['integrations'],
        summary: 'Create venue integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as CreateIntegrationBody;

      try {
        // Check access and get role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to create integrations');
        }

        // Transform data to match service expectations
        const integrationData = {
          type: body.type,
          config: body.config || {},
          encrypted_credentials: body.credentials,
          status: 'active'
        };

        const integration = await integrationService.createIntegration(venueId, integrationData);

        logger.info({ venueId, integrationType: body.type, userId }, 'Integration created');
        venueOperations.inc({ operation: 'create_integration', status: 'success' });

        return reply.status(201).send(integration);
      } catch (error) {
        venueOperations.inc({ operation: 'create_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof ConflictError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to create integration');
        throw error;
      }
    }
  );

  // Get integration by ID - SECURED
  fastify.get('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Get integration details',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check venue access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const integration = await integrationService.getIntegration(integrationId);
        if (!integration) {
          throw new NotFoundError('Integration not found');
        }

        // Verify integration belongs to venue
        if (integration.venue_id !== venueId) {
          throw new ForbiddenError('Integration does not belong to this venue');
        }

        // Mask sensitive credentials
        const sanitized = {
          ...integration,
          encrypted_credentials: undefined,
          config: {
            ...integration.config,
            apiKey: integration.config?.apiKey ? '***' : undefined,
            secretKey: integration.config?.secretKey ? '***' : undefined
          }
        };

        return reply.send(sanitized);
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to get integration');
        throw error;
      }
    }
  );

  // Update integration - SECURED
  fastify.put('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateIntegrationSchema)],
      schema: {
        tags: ['integrations'],
        summary: 'Update integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as UpdateIntegrationBody;

      try {
        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update integrations');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        const updated = await integrationService.updateIntegration(integrationId, body);

        logger.info({ venueId, integrationId, userId }, 'Integration updated');
        venueOperations.inc({ operation: 'update_integration', status: 'success' });

        return reply.send(updated);
      } catch (error) {
        venueOperations.inc({ operation: 'update_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to update integration');
        throw error;
      }
    }
  );

  // Delete integration - SECURED
  fastify.delete('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Delete integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (accessDetails?.role !== 'owner') {
          throw new ForbiddenError('Only venue owner can delete integrations');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        await integrationService.deleteIntegration(integrationId);

        logger.info({ venueId, integrationId, userId }, 'Integration deleted');
        venueOperations.inc({ operation: 'delete_integration', status: 'success' });

        return reply.status(204).send();
      } catch (error) {
        venueOperations.inc({ operation: 'delete_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to delete integration');
        throw error;
      }
    }
  );

  // Test integration connection - SECURED
  fastify.post('/:integrationId/test',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Test integration connection',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check venue access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        const result = await integrationService.testIntegration(integrationId);

        logger.info({ venueId, integrationId, userId }, 'Integration tested');

        return reply.send({
          success: result.success,
          message: result.message
        });
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to test integration');
        throw error;
      }
    }
  );
}

