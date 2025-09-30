import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export class BuyController extends EventEmitter {
  /**
   * Atomic buy with row locking to prevent double-selling
   */
  async buyListing(req: Request, res: Response): Promise<void> {
    const { listingId } = req.params;
    const buyerId = (req as any).user.id;
    const { offeredPrice } = req.body;

    // Start transaction for atomicity
    const trx = await db.transaction();

    try {
      // 1. Lock the listing row (FOR UPDATE SKIP LOCKED)
      const listing = await trx('marketplace_listings')
        .where({ id: listingId, status: 'active' })
        .forUpdate()
        .skipLocked()
        .first();

      if (!listing) {
        await trx.rollback();
        res.status(409).json({ 
          error: 'Listing unavailable',
          reason: 'Already sold or locked by another buyer'
        });
        return;
      }

      // 2. Verify price caps and policies
      const policy = await this.getVenuePolicy(trx, listing.venue_id);
      
      if (!this.validatePurchase(listing, policy, offeredPrice)) {
        await trx.rollback();
        res.status(400).json({ 
          error: 'Purchase violates venue policy',
          maxPrice: policy.maxResalePrice,
          saleWindow: policy.saleWindow
        });
        return;
      }

      // 3. Check buyer != seller
      if (listing.seller_id === buyerId) {
        await trx.rollback();
        res.status(400).json({ error: 'Cannot buy your own listing' });
        return;
      }

      // 4. Create purchase record
      const [purchase] = await trx('marketplace_purchases')
        .insert({
          listing_id: listingId,
          buyer_id: buyerId,
          seller_id: listing.seller_id,
          ticket_id: listing.ticket_id,
          price: offeredPrice || listing.price,
          venue_fee: this.calculateVenueFee(listing.price, policy),
          platform_fee: this.calculatePlatformFee(listing.price),
          status: 'pending',
          created_at: new Date()
        })
        .returning('*');

      // 5. Update listing status
      await trx('marketplace_listings')
        .where({ id: listingId })
        .update({ 
          status: 'sold',
          sold_at: new Date(),
          buyer_id: buyerId
        });

      // 6. Write to outbox for event emission
      await trx('outbox').insert({
        topic: 'marketplace.ticket.sold',
        payload: JSON.stringify({
          purchaseId: purchase.id,
          listingId,
          buyerId,
          sellerId: listing.seller_id,
          ticketId: listing.ticket_id,
          price: purchase.price,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });

      // 7. Commit transaction
      await trx.commit();

      // 8. Emit event for downstream processing
      this.emit('ticket.sold', {
        purchaseId: purchase.id,
        buyerId,
        sellerId: listing.seller_id,
        price: purchase.price
      });

      logger.info(`Ticket ${listing.ticket_id} sold to ${buyerId} for ${purchase.price}`);

      res.json({
        success: true,
        purchase: {
          id: purchase.id,
          ticketId: listing.ticket_id,
          price: purchase.price,
          venueFee: purchase.venue_fee,
          platformFee: purchase.platform_fee,
          total: purchase.price + purchase.venue_fee + purchase.platform_fee
        }
      });

    } catch (error: any) {
      await trx.rollback();
      
      // Check for specific database errors
      if (error.code === '23505') { // Unique violation
        res.status(409).json({ error: 'Purchase already in progress' });
      } else if (error.code === '40001') { // Serialization failure
        res.status(409).json({ error: 'Concurrent purchase detected, please retry' });
      } else {
        logger.error('Buy transaction failed:', error);
        res.status(500).json({ error: 'Purchase failed' });
      }
    }
  }

  /**
   * Validate purchase against venue policies
   */
  private validatePurchase(listing: any, policy: any, offeredPrice?: number): boolean {
    const now = new Date();
    const price = offeredPrice || listing.price;

    // Check price cap
    if (policy.maxResalePrice && price > policy.maxResalePrice) {
      logger.warn(`Price ${price} exceeds cap ${policy.maxResalePrice}`);
      return false;
    }

    // Check minimum price
    if (policy.minResalePrice && price < policy.minResalePrice) {
      logger.warn(`Price ${price} below minimum ${policy.minResalePrice}`);
      return false;
    }

    // Check sale window
    if (policy.saleWindowStart && now < new Date(policy.saleWindowStart)) {
      logger.warn('Sale window not yet open');
      return false;
    }

    if (policy.saleWindowEnd && now > new Date(policy.saleWindowEnd)) {
      logger.warn('Sale window has closed');
      return false;
    }

    // Check maximum resales
    if (policy.maxResales && listing.resale_count >= policy.maxResales) {
      logger.warn(`Ticket has reached max resales: ${policy.maxResales}`);
      return false;
    }

    return true;
  }

  /**
   * Get venue marketplace policy
   */
  private async getVenuePolicy(trx: any, venueId: string): Promise<any> {
    const policy = await trx('venue_marketplace_policies')
      .where({ venue_id: venueId, active: true })
      .first();

    return policy || {
      maxResalePrice: null,
      minResalePrice: null,
      saleWindowStart: null,
      saleWindowEnd: null,
      maxResales: 3,
      venueFeePercent: 5,
      platformFeePercent: 2.5
    };
  }

  /**
   * Calculate venue fee
   */
  private calculateVenueFee(price: number, policy: any): number {
    const percent = policy.venueFeePercent || 5;
    return Math.round(price * percent / 100);
  }

  /**
   * Calculate platform fee
   */
  private calculatePlatformFee(price: number): number {
    const percent = 2.5; // 2.5% platform fee
    return Math.round(price * percent / 100);
  }

  /**
   * Handle concurrent buy attempts gracefully
   */
  async buyWithRetry(req: Request, res: Response): Promise<void> {
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        await this.buyListing(req, res);
        return;
      } catch (error: any) {
        if (error.code === '40001' && attempts < maxRetries - 1) {
          // Serialization failure - retry with exponential backoff
          attempts++;
          const delay = Math.pow(2, attempts) * 100; // 200ms, 400ms, 800ms
          await new Promise(resolve => setTimeout(resolve, delay));
          logger.info(`Retrying purchase attempt ${attempts} after ${delay}ms`);
        } else {
          throw error;
        }
      }
    }

    res.status(409).json({ 
      error: 'Unable to complete purchase due to high demand',
      message: 'Please try again'
    });
  }
}

export const buyController = new BuyController();
