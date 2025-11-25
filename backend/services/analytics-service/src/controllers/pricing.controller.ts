import { FastifyRequest, FastifyReply } from 'fastify';
import { dynamicPricingService } from '../services/dynamic-pricing.service';
import { demandTrackerService } from '../services/demand-tracker.service';
import { getDb } from '../config/database';
import { logger } from '../utils/logger';

export class PricingController {
  async getPriceRecommendation(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      const userId = (request as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const db = getDb();
      const eventResult = await db.raw(`SELECT e.price_cents, e.venue_id FROM events e WHERE e.id = ?`, [eventId]);

      if (eventResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      const event = eventResult.rows[0];
      const rules = await dynamicPricingService.getVenuePricingRules(event.venue_id);
      const recommendation = await dynamicPricingService.calculateOptimalPrice(eventId, event.price_cents, rules);

      reply.send({ success: true, data: recommendation });
    } catch (error) {
      logger.error('Error getting price recommendation:', error);
      reply.status(500).send({ error: 'Failed to get price recommendation' });
    }
  }

  async getPendingPriceChanges(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { venueId } = request.params as { venueId: string };
      const userId = (request as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const db = getDb();
      const result = await db.raw(`SELECT ppc.*, e.name as event_name, e.start_time FROM pending_price_changes ppc JOIN events e ON ppc.event_id = e.id WHERE e.venue_id = ? AND ppc.approved_at IS NULL ORDER BY ppc.created_at DESC`, [venueId]);
      reply.send({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error getting pending price changes:', error);
      reply.status(500).send({ error: 'Failed to get pending price changes' });
    }
  }

  async approvePriceChange(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { changeId } = request.params as { changeId: string };
      const userId = (request as any).user?.id;
      const body = request.body as { approved: boolean; reason?: string };

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const db = getDb();
      const result = await db.raw('SELECT * FROM pending_price_changes WHERE id = ?', [changeId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Price change not found' });
      }

      const change = result.rows[0];

      if (body.approved) {
        await dynamicPricingService.applyPriceChange(change.event_id, change.recommended_price, body.reason || 'Manually approved');
        await db.raw(`UPDATE pending_price_changes SET approved_at = NOW(), approved_by = ?, approval_reason = ? WHERE id = ?`, [userId, body.reason, changeId]);
        reply.send({ success: true, message: 'Price change approved and applied' });
      } else {
        await db.raw(`UPDATE pending_price_changes SET rejected_at = NOW(), rejected_by = ?, rejection_reason = ? WHERE id = ?`, [userId, body.reason, changeId]);
        reply.send({ success: true, message: 'Price change rejected' });
      }
    } catch (error) {
      logger.error('Error approving price change:', error);
      reply.status(500).send({ error: 'Failed to approve price change' });
    }
  }

  async getDemandMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      const userId = (request as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const demand = await demandTrackerService.calculateDemand(eventId);
      reply.send({ success: true, data: demand });
    } catch (error) {
      logger.error('Error getting demand metrics:', error);
      reply.status(500).send({ error: 'Failed to get demand metrics' });
    }
  }
}

export const pricingController = new PricingController();
