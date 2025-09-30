import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateSettingsSchema } from '../schemas/settings.schema';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';

interface VenueParams {
  venueId: string;
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  const { db, venueService, logger } = (fastify as any).container.cradle;

  // Get venue settings - SECURED
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Use venueService for access check
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const settings = await db('venue_settings')
          .where({ venue_id: venueId })
          .first();

        if (!settings) {
          // Return defaults if no settings exist
          return reply.send({
            general: {
              timezone: 'UTC',
              currency: 'USD',
              language: 'en'
            },
            ticketing: {
              allowRefunds: true,
              refundWindow: 24,
              maxTicketsPerOrder: 10
            }
          });
        }

        // Map database columns to expected format
        return reply.send({
          general: {
            timezone: 'UTC',
            currency: settings.accepted_currencies?.[0] || 'USD',
            language: 'en'
          },
          ticketing: {
            allowRefunds: settings.ticket_resale_allowed,
            refundWindow: 24,
            maxTicketsPerOrder: settings.max_tickets_per_order,
            allowPrintAtHome: settings.allow_print_at_home,
            allowMobileTickets: settings.allow_mobile_tickets,
            requireIdVerification: settings.require_id_verification,
            ticketTransferAllowed: settings.ticket_transfer_allowed
          },
          fees: {
            serviceFeePercentage: settings.service_fee_percentage,
            facilityFeeAmount: settings.facility_fee_amount,
            processingFeePercentage: settings.processing_fee_percentage
          },
          payment: {
            methods: settings.payment_methods,
            acceptedCurrencies: settings.accepted_currencies,
            payoutFrequency: settings.payout_frequency,
            minimumPayoutAmount: settings.minimum_payout_amount
          }
        });
      } catch (error: any) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get settings');
        return reply.status(500).send({ error: 'Failed to get settings' });
      }
    }
  );

  // Update venue settings - SECURED
  fastify.put('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const body = request.body as any;

        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update settings');
        }

        // Map request to database columns
        const updates: any = {};
        
        if (body.general) {
          if (body.general.currency) {
            updates.accepted_currencies = [body.general.currency];
          }
        }
        
        if (body.ticketing) {
          if (body.ticketing.maxTicketsPerOrder !== undefined) {
            updates.max_tickets_per_order = body.ticketing.maxTicketsPerOrder;
          }
          if (body.ticketing.allowRefunds !== undefined) {
            updates.ticket_resale_allowed = body.ticketing.allowRefunds;
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          
          await db('venue_settings')
            .where({ venue_id: venueId })
            .update(updates);
        }

        logger.info({ venueId, userId }, 'Settings updated');
        venueOperations.inc({ operation: 'settings_update', status: 'success' });

        return reply.send({ success: true, message: 'Settings updated' });
      } catch (error: any) {
        venueOperations.inc({ operation: 'settings_update', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update settings');
        return reply.status(500).send({ error: 'Failed to update settings' });
      }
    }
  );
}
