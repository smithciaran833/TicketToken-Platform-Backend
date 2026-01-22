import { AuthenticatedHandler } from '../types';
import { EventScheduleModel } from '../models';
import { logger } from '../utils/logger';
import { createProblemError } from '../middleware/error-handler';

export const getCustomerProfile: AuthenticatedHandler = async (request, reply) => {
  try {
    const { customerId } = request.params as { customerId: string };
    const { db } = request.container.cradle;
    
    // CRITICAL FIX: Enforce tenant isolation
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    // Get customer's ticket purchase history from event_pricing
    // HIGH PRIORITY FIX for Issue #9: Use customerId parameter in query
    // TODO: In production, this should call ticket-service instead of querying event_pricing directly
    const scheduleModel = new EventScheduleModel(db);
    
    const purchases = await db('event_pricing')
      .join('events', 'event_pricing.event_id', 'events.id')
      .select(
        'events.name as event_name',
        'events.id as event_id',
        'event_pricing.name as tier_name',
        'event_pricing.base_price'
      )
      .where('event_pricing.is_active', true)
      .where('events.tenant_id', tenantId)
      // HIGH PRIORITY FIX for Issue #9: Filter by customer/user ID
      // Note: This is mock - real implementation would query ticket-service
      .where('events.created_by', customerId)
      .limit(10);

    // Enrich with schedule info
    const enrichedPurchases = await Promise.all(
      purchases.map(async (purchase: any) => {
        const schedules = await scheduleModel.findByEventId(purchase.event_id, tenantId);
        return {
          event_name: purchase.event_name,
          starts_at: schedules[0]?.starts_at,
          tier_name: purchase.tier_name,
          price: purchase.base_price
        };
      })
    );

    return reply.send({
      success: true,
      customerId,
      profile: {
        total_purchases: enrichedPurchases.length,
        recent_purchases: enrichedPurchases,
        note: 'This is mock data - real purchase history comes from ticket-service'
      }
    });
  } catch (error: any) {
    logger.error({ error, customerId: (request.params as any).customerId }, 'Customer profile error');
    
    // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
    if (error.statusCode && error.code) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get customer profile');
  }
};
