import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateSettingsSchema } from '../schemas/settings.schema';
import { SettingsModel, IVenueSettings } from '../models/settings.model';
import { NotFoundError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { auditService } from '@tickettoken/shared';

async function addTenantContext(request: any, reply: any) {
  const tenantId = request.user?.tenant_id;
  if (!tenantId) {
    throw new UnauthorizedError('Missing tenant context');
  }
  request.tenantId = tenantId;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  const { db, venueService, cacheService, logger } = (fastify as any).container.cradle;

  // GET /venues/:venueId/settings
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // Security: Check venue access with tenant context
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        // Security: Verify venue belongs to tenant before fetching settings
        const venue = await db('venues')
          .where({ id: venueId, tenant_id: tenantId })
          .whereNull('deleted_at')
          .first();

        if (!venue) {
          throw new NotFoundError('Venue not found');
        }

        // Use SettingsModel to get settings (returns nested IVenueSettings structure)
        const settingsModel = new SettingsModel(db);
        const settings = await settingsModel.getVenueSettings(venueId);

        return reply.send({
          venue_id: venueId,
          ...settings
        });
      } catch (error: any) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get settings');
        return reply.status(500).send({ error: 'Failed to get settings' });
      }
    }
  );

  // PUT /venues/:venueId/settings
  fastify.put('/',
    {
      preHandler: [authenticate, addTenantContext, validate(updateSettingsSchema)]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const userRole = request.user?.role;
        const tenantId = request.tenantId;
        const body = request.body as Partial<IVenueSettings>;

        // Security: Check venue access with tenant context
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        // Security: Only owner/manager can update settings
        const accessDetails = await venueService.getAccessDetails(venueId, userId, tenantId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update settings');
        }

        // Security: Verify venue belongs to tenant
        const venue = await db('venues')
          .where({ id: venueId, tenant_id: tenantId })
          .whereNull('deleted_at')
          .first();

        if (!venue) {
          throw new NotFoundError('Venue not found');
        }

        // Use SettingsModel for transformation and persistence
        const settingsModel = new SettingsModel(db);

        // Get current settings for audit log
        const previousSettings = await settingsModel.getVenueSettings(venueId);

        // Validate using model's validation method
        const validation = await settingsModel.validateSettings(body as IVenueSettings);
        if (!validation.valid) {
          return reply.status(400).send({
            error: 'Validation failed',
            details: validation.errors
          });
        }

        // Update settings (handles nested-to-flat transformation internally)
        const updatedSettings = await settingsModel.updateVenueSettings(venueId, body);

        // CACHE FIX: Clear venue cache after updating settings (non-blocking)
        // If cache clear fails, log it but don't fail the request
        try {
          await cacheService.clearVenueCache(venueId, tenantId);
          logger.debug({ venueId, tenantId }, 'Cache cleared after settings update');
        } catch (cacheError: any) {
          logger.warn({ cacheError, venueId, tenantId }, 'Failed to clear cache after settings update (non-critical)');
        }

        // Audit log
        await auditService.logAction({
          service: 'venue-service',
          action: 'update_venue_settings',
          actionType: 'CONFIG',
          userId,
          userRole,
          resourceType: 'venue_settings',
          resourceId: venueId,
          previousValue: previousSettings,
          newValue: updatedSettings,
          metadata: {
            sectionsChanged: Object.keys(body),
            role: accessDetails?.role,
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          success: true,
        });

        logger.info({ venueId, userId, tenantId }, 'Settings updated');
        venueOperations.inc({ operation: 'settings_update', status: 'success' });

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
