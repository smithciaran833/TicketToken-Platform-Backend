import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { withLock, LockKeys } from '@tickettoken/shared/utils/distributed-lock';

export class BuyController extends EventEmitter {
  async buyListing(req: Request, res: Response): Promise<void> {
    const { listingId } = req.params;
    const buyerId = (req as any).user.id;
    const { offeredPrice } = req.body;

    const lockKey = LockKeys.listing(listingId);
    
    try {
      await withLock(lockKey, 10000, async () => {
        const trx = await db.transaction();

        try {
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

          if (listing.seller_id === buyerId) {
            await trx.rollback();
            res.status(400).json({ error: 'Cannot buy your own listing' });
            return;
          }

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

          await trx('marketplace_listings')
            .where({ id: listingId })
            .update({
              status: 'sold',
              sold_at: new Date(),
              buyer_id: buyerId
            });

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

          await trx.commit();

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

          if (error.code === '23505') {
            res.status(409).json({ error: 'Purchase already in progress' });
          } else if (error.code === '40001') {
            res.status(409).json({ error: 'Concurrent purchase detected, please retry' });
          } else {
            logger.error('Buy transaction failed:', error);
            res.status(500).json({ error: 'Purchase failed' });
          }
        }
      });
    } catch (lockError: any) {
      if (lockError.message.includes('Resource is locked')) {
        res.status(409).json({ 
          error: 'Listing is being purchased by another user',
          message: 'Please try again in a moment'
        });
      } else {
        logger.error('Distributed lock error:', lockError);
        res.status(500).json({ error: 'Purchase failed' });
      }
    }
  }

  private validatePurchase(listing: any, policy: any, offeredPrice?: number): boolean {
    const now = new Date();
    const price = offeredPrice || listing.price;

    if (policy.maxResalePrice && price > policy.maxResalePrice) {
      logger.warn(`Price ${price} exceeds cap ${policy.maxResalePrice}`);
      return false;
    }

    if (policy.minResalePrice && price < policy.minResalePrice) {
      logger.warn(`Price ${price} below minimum ${policy.minResalePrice}`);
      return false;
    }

    if (policy.saleWindowStart && now < new Date(policy.saleWindowStart)) {
      logger.warn('Sale window not yet open');
      return false;
    }

    if (policy.saleWindowEnd && now > new Date(policy.saleWindowEnd)) {
      logger.warn('Sale window has closed');
      return false;
    }

    if (policy.maxResales && listing.resale_count >= policy.maxResales) {
      logger.warn(`Ticket has reached max resales: ${policy.maxResales}`);
      return false;
    }

    return true;
  }

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

  private calculateVenueFee(price: number, policy: any): number {
    const percent = policy.venueFeePercent || 5;
    return Math.round(price * percent / 100);
  }

  private calculatePlatformFee(price: number): number {
    const percent = 2.5;
    return Math.round(price * percent / 100);
  }

  async buyWithRetry(req: Request, res: Response): Promise<void> {
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        await this.buyListing(req, res);
        return;
      } catch (error: any) {
        if ((error.code === '40001' || error.message?.includes('Resource is locked')) 
            && attempts < maxRetries - 1) {
          attempts++;
          const delay = Math.pow(2, attempts) * 100;
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
