import { AuthenticatedHandler } from '../types';
import { EventScheduleModel } from '../models';
import { logger } from '../utils/logger';

export const getCustomerProfile: AuthenticatedHandler = async (request, reply) => {
  try {
    const { customerId } = request.params as { customerId: string };
    const { db } = request.container.cradle;

    // Get customer's ticket purchase history from event_pricing
    // Note: This is a simplified version - in reality you'd join with actual
    // ticket purchases from the ticket-service
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
      .limit(10);

    // Enrich with schedule info
    const enrichedPurchases = await Promise.all(
      purchases.map(async (purchase: any) => {
        const schedules = await scheduleModel.findByEventId(purchase.event_id);
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
  } catch (error) {
    logger.error({ error, customerId: (request.params as any).customerId }, 'Customer profile error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get customer profile'
    });
  }
};
