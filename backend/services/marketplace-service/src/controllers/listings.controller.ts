import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { logger } from '../utils/logger';

export class ListingsController {
  /**
   * Create listing with policy validation
   */
  async createListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sellerId = (request as any).user.id;
    const { ticketId, price, expiresAt } = request.body as any;

    const trx = await db.transaction();

    try {
      // 1. Verify ticket ownership
      const ticket = await trx('tickets')
        .where({ id: ticketId, owner_id: sellerId })
        .first();

      if (!ticket) {
        await trx.rollback();
        reply.status(403).send({ error: 'You do not own this ticket' });
        return;
      }

      // 2. Check if ticket is already listed
      const existingListing = await trx('marketplace_listings')
        .where({ ticket_id: ticketId, status: 'active' })
        .first();

      if (existingListing) {
        await trx.rollback();
        reply.status(409).send({ error: 'Ticket is already listed' });
        return;
      }

      // 3. Get venue policy
      const policy = await trx('venue_marketplace_policies')
        .where({ venue_id: ticket.venue_id, active: true })
        .first();

      // 4. Validate listing against policy
      if (!this.validateListing(price, policy)) {
        await trx.rollback();
        reply.status(400).send({
          error: 'Listing violates venue policy',
          policy: {
            maxPrice: policy?.maxResalePrice,
            minPrice: policy?.minResalePrice,
            saleWindow: policy?.saleWindowStart
          }
        });
        return;
      }

      // 5. Create listing
      const [listing] = await trx('marketplace_listings')
        .insert({
          ticket_id: ticketId,
          seller_id: sellerId,
          venue_id: ticket.venue_id,
          event_id: ticket.event_id,
          price,
          original_price: ticket.original_price,
          status: 'active',
          expires_at: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
          resale_count: ticket.resale_count || 0,
          created_at: new Date()
        })
        .returning('*');

      // 6. Write to outbox
      await trx('outbox').insert({
        topic: 'marketplace.listing.created',
        payload: JSON.stringify({
          listingId: listing.id,
          ticketId,
          sellerId,
          price,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });

      await trx.commit();

      reply.send({
        success: true,
        listing: {
          id: listing.id,
          ticketId: listing.ticket_id,
          price: listing.price,
          expiresAt: listing.expires_at
        }
      });

    } catch (error) {
      await trx.rollback();
      logger.error('Failed to create listing:', error);
      reply.status(500).send({ error: 'Failed to create listing' });
    }
  }

  /**
   * Validate listing against venue policy
   */
  private validateListing(price: number, policy: any): boolean {
    if (!policy) return true;

    if (policy.maxResalePrice && price > policy.maxResalePrice) {
      return false;
    }

    if (policy.minResalePrice && price < policy.minResalePrice) {
      return false;
    }

    const now = new Date();
    if (policy.saleWindowStart && now < new Date(policy.saleWindowStart)) {
      return false;
    }

    return true;
  }

  /**
   * Cancel listing atomically
   */
  async cancelListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { listingId } = request.params as { listingId: string };
    const sellerId = (request as any).user.id;

    const trx = await db.transaction();

    try {
      // Lock and update in one query
      const updated = await trx('marketplace_listings')
        .where({
          id: listingId,
          seller_id: sellerId,
          status: 'active'
        })
        .update({
          status: 'cancelled',
          cancelled_at: new Date()
        })
        .returning('*');

      if (!updated.length) {
        await trx.rollback();
        reply.status(404).send({ error: 'Listing not found or already sold' });
        return;
      }

      // Write to outbox
      await trx('outbox').insert({
        topic: 'marketplace.listing.cancelled',
        payload: JSON.stringify({
          listingId,
          sellerId,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });

      await trx.commit();

      reply.send({ success: true, message: 'Listing cancelled' });

    } catch (error) {
      await trx.rollback();
      logger.error('Failed to cancel listing:', error);
      reply.status(500).send({ error: 'Failed to cancel listing' });
    }
  }
}

export const listingsController = new ListingsController();
