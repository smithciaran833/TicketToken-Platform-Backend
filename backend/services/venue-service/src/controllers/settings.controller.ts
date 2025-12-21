import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateSettingsSchema } from '../schemas/settings.schema';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { auditService } from '@tickettoken/shared';

interface VenueParams {
  venueId: string;
}

async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  const { db, venueService, logger } = (fastify as any).container.cradle;

  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const settings = await db('venue_settings')
          .where({ venue_id: venueId })
          .first();

        if (!settings) {
          throw new NotFoundError('Settings not found');
        }

        return reply.send(settings);
      } catch (error: any) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get settings');
        return reply.status(500).send({ error: 'Failed to get settings' });
      }
    }
  );

  fastify.put('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const userRole = request.user?.role;
        const body = request.body as any;

        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update settings');
        }

        // Validate inputs
        if (body.max_tickets_per_order !== undefined && body.max_tickets_per_order < 0) {
          return reply.status(400).send({ error: 'max_tickets_per_order must be non-negative' });
        }
        if (body.service_fee_percentage !== undefined && (body.service_fee_percentage < 0 || body.service_fee_percentage > 100)) {
          return reply.status(400).send({ error: 'service_fee_percentage must be between 0 and 100' });
        }

        const currentSettings = await db('venue_settings')
          .where({ venue_id: venueId })
          .first();

        if (!currentSettings) {
          throw new NotFoundError('Settings not found');
        }

        const updates: any = { ...body };
        updates.updated_at = new Date();

        await db('venue_settings')
          .where({ venue_id: venueId })
          .update(updates);

        await auditService.logAction({
          service: 'venue-service',
          action: 'update_venue_settings',
          actionType: 'CONFIG',
          userId,
          userRole,
          resourceType: 'venue_settings',
          resourceId: venueId,
          previousValue: currentSettings,
          newValue: updates,
          metadata: {
            settingsChanged: Object.keys(body),
            role: accessDetails?.role,
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          success: true,
        });

        logger.info({ venueId, userId }, 'Settings updated');
        venueOperations.inc({ operation: 'settings_update', status: 'success' });

        const updatedSettings = await db('venue_settings')
          .where({ venue_id: venueId })
          .first();

        return reply.send(updatedSettings);
      } catch (error: any) {
        venueOperations.inc({ operation: 'settings_update', status: 'error' });

        await auditService.logAction({
          service: 'venue-service',
          action: 'update_venue_settings',
          actionType: 'CONFIG',
          userId: request.user?.id || 'unknown',
          resourceType: 'venue_settings',
          resourceId: request.params.venueId,
          metadata: { attemptedChanges: request.body },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update settings');
        return reply.status(500).send({ error: 'Failed to update settings' });
      }
    }
  );
}
