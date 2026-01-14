import { logger } from '../utils/logger';
import { publishEvent } from '../config/rabbitmq';
import { getDatabase } from '../config/database';

/**
 * HIGH: Refund notification service
 * Sends notifications to sellers, creators, and buyers on refund events
 * MEDIUM: Includes refund timeline communication
 */

// MEDIUM: Refund processing timeline configuration
const REFUND_TIMELINE = {
  CARD_REFUND_DAYS: { min: 5, max: 10 },
  BANK_TRANSFER_DAYS: { min: 3, max: 5 },
  WALLET_REFUND_DAYS: { min: 0, max: 1 },
  DEFAULT_DAYS: { min: 5, max: 10 },
};

export interface RefundNotificationData {
  orderId: string;
  refundId: string;
  refundAmountCents: number;
  refundReason: string;
  refundType: 'FULL' | 'PARTIAL' | 'ITEM';
  buyerId: string;
  buyerEmail?: string;
  eventId: string;
  eventName?: string;
  tenantId: string;
  // MEDIUM: Payment method for timeline estimation
  paymentMethod?: 'card' | 'bank_transfer' | 'wallet' | 'other';
  // For resale refunds
  sellerId?: string;
  sellerEmail?: string;
  // For creator royalty reversals
  creatorId?: string;
  creatorName?: string;
  royaltyReversed?: number;
  // For venue royalty reversals
  venueId?: string;
  venueName?: string;
  venueRoyaltyReversed?: number;
}

// MEDIUM: Refund timeline info included in notifications
export interface RefundTimeline {
  estimatedMinDays: number;
  estimatedMaxDays: number;
  estimatedArrivalDate: string;
  message: string;
}

export class RefundNotificationService {
  private db = getDatabase();

  /**
   * MEDIUM: Calculate refund timeline based on payment method
   */
  private calculateTimeline(paymentMethod?: string): RefundTimeline {
    let timeline: { min: number; max: number };

    switch (paymentMethod) {
      case 'card':
        timeline = REFUND_TIMELINE.CARD_REFUND_DAYS;
        break;
      case 'bank_transfer':
        timeline = REFUND_TIMELINE.BANK_TRANSFER_DAYS;
        break;
      case 'wallet':
        timeline = REFUND_TIMELINE.WALLET_REFUND_DAYS;
        break;
      default:
        timeline = REFUND_TIMELINE.DEFAULT_DAYS;
    }

    const now = new Date();
    const estimatedArrival = new Date(now);
    estimatedArrival.setDate(estimatedArrival.getDate() + timeline.max);

    let message: string;
    if (timeline.min === 0 && timeline.max <= 1) {
      message = 'Your refund should appear in your account within 24 hours.';
    } else if (timeline.min === timeline.max) {
      message = `Your refund should appear in your account within ${timeline.min} business days.`;
    } else {
      message = `Your refund should appear in your account within ${timeline.min}-${timeline.max} business days.`;
    }

    return {
      estimatedMinDays: timeline.min,
      estimatedMaxDays: timeline.max,
      estimatedArrivalDate: estimatedArrival.toISOString().split('T')[0],
      message,
    };
  }

  /**
   * Send all notifications for a refund
   */
  async notifyRefund(data: RefundNotificationData): Promise<void> {
    logger.info('Sending refund notifications', {
      orderId: data.orderId,
      refundId: data.refundId,
    });

    const promises: Promise<void>[] = [];

    // Always notify buyer
    promises.push(this.notifyBuyer(data));

    // Notify seller if this was a resale
    if (data.sellerId) {
      promises.push(this.notifySeller(data));
    }

    // Notify creator if royalties were reversed
    if (data.creatorId && data.royaltyReversed && data.royaltyReversed > 0) {
      promises.push(this.notifyCreator(data));
    }

    // Notify venue if royalties were reversed
    if (data.venueId && data.venueRoyaltyReversed && data.venueRoyaltyReversed > 0) {
      promises.push(this.notifyVenue(data));
    }

    await Promise.allSettled(promises);

    logger.info('Refund notifications sent', {
      orderId: data.orderId,
      notificationCount: promises.length,
    });
  }

  /**
   * Notify buyer that refund has been processed
   * MEDIUM: Includes refund timeline information
   */
  private async notifyBuyer(data: RefundNotificationData): Promise<void> {
    // MEDIUM: Calculate timeline for buyer
    const timeline = this.calculateTimeline(data.paymentMethod);

    await publishEvent('notification.refund.buyer', {
      eventId: `refund-buyer-${data.refundId}`,
      venueId: data.tenantId,
      data: {
        recipientId: data.buyerId,
        recipientEmail: data.buyerEmail,
        orderId: data.orderId,
        refundId: data.refundId,
        refundAmountCents: data.refundAmountCents,
        refundAmountFormatted: `$${(data.refundAmountCents / 100).toFixed(2)}`,
        refundReason: data.refundReason,
        refundType: data.refundType,
        eventName: data.eventName,
        // MEDIUM: Timeline information
        timeline: {
          estimatedMinDays: timeline.estimatedMinDays,
          estimatedMaxDays: timeline.estimatedMaxDays,
          estimatedArrivalDate: timeline.estimatedArrivalDate,
          message: timeline.message,
        },
        // Human-readable message with timeline
        message: `Your refund of $${(data.refundAmountCents / 100).toFixed(2)} has been processed. ${timeline.message}`,
      },
      timestamp: new Date().toISOString(),
    });

    logger.debug('Buyer refund notification published', {
      buyerId: data.buyerId,
      orderId: data.orderId,
      timeline,
    });
  }

  /**
   * Notify seller that their ticket sale has been refunded
   * MEDIUM: Includes timeline for proceeds reversal
   */
  private async notifySeller(data: RefundNotificationData): Promise<void> {
    // MEDIUM: Sellers typically see reversal within 1-2 days
    const sellerTimeline = {
      estimatedMinDays: 1,
      estimatedMaxDays: 2,
      message: 'The proceeds reversal will appear in your account within 1-2 business days.',
    };

    await publishEvent('notification.refund.seller', {
      eventId: `refund-seller-${data.refundId}`,
      venueId: data.tenantId,
      data: {
        recipientId: data.sellerId,
        recipientEmail: data.sellerEmail,
        orderId: data.orderId,
        refundId: data.refundId,
        refundAmountCents: data.refundAmountCents,
        refundAmountFormatted: `$${(data.refundAmountCents / 100).toFixed(2)}`,
        refundReason: data.refundReason,
        eventName: data.eventName,
        // MEDIUM: Timeline information
        timeline: sellerTimeline,
        // Important: Let seller know their proceeds will be reversed
        message: `Your ticket sale has been refunded. Your proceeds of $${(data.refundAmountCents / 100).toFixed(2)} will be reversed. ${sellerTimeline.message}`,
      },
      timestamp: new Date().toISOString(),
    });

    logger.debug('Seller refund notification published', {
      sellerId: data.sellerId,
      orderId: data.orderId,
    });
  }

  /**
   * Notify creator that royalty has been reversed
   * MEDIUM: Includes timeline for royalty reversal
   */
  private async notifyCreator(data: RefundNotificationData): Promise<void> {
    const royaltyAmount = (data.royaltyReversed || 0).toFixed(2);
    
    // MEDIUM: Royalty reversals typically process within 1-3 days
    const royaltyTimeline = {
      estimatedMinDays: 1,
      estimatedMaxDays: 3,
      message: 'The royalty reversal will be reflected in your next payout cycle.',
    };

    await publishEvent('notification.royalty.creator_reversed', {
      eventId: `royalty-creator-${data.refundId}`,
      venueId: data.tenantId,
      data: {
        recipientId: data.creatorId,
        creatorName: data.creatorName,
        orderId: data.orderId,
        refundId: data.refundId,
        reversedAmountCents: Math.round((data.royaltyReversed || 0) * 100),
        reversedAmountFormatted: `$${royaltyAmount}`,
        refundReason: data.refundReason,
        eventName: data.eventName,
        // MEDIUM: Timeline information
        timeline: royaltyTimeline,
        message: `A royalty payment of $${royaltyAmount} has been reversed due to a refund. ${royaltyTimeline.message}`,
      },
      timestamp: new Date().toISOString(),
    });

    logger.debug('Creator royalty reversal notification published', {
      creatorId: data.creatorId,
      reversedAmount: data.royaltyReversed,
    });
  }

  /**
   * Notify venue that royalty has been reversed
   * MEDIUM: Includes timeline for royalty reversal
   */
  private async notifyVenue(data: RefundNotificationData): Promise<void> {
    const royaltyAmount = (data.venueRoyaltyReversed || 0).toFixed(2);

    // MEDIUM: Venue royalty reversals typically process within 1-3 days
    const royaltyTimeline = {
      estimatedMinDays: 1,
      estimatedMaxDays: 3,
      message: 'The royalty reversal will be reflected in your next payout cycle.',
    };

    await publishEvent('notification.royalty.venue_reversed', {
      eventId: `royalty-venue-${data.refundId}`,
      venueId: data.venueId || data.tenantId,
      data: {
        recipientId: data.venueId,
        venueName: data.venueName,
        orderId: data.orderId,
        refundId: data.refundId,
        reversedAmountCents: Math.round((data.venueRoyaltyReversed || 0) * 100),
        reversedAmountFormatted: `$${royaltyAmount}`,
        refundReason: data.refundReason,
        eventName: data.eventName,
        // MEDIUM: Timeline information
        timeline: royaltyTimeline,
        message: `A royalty payment of $${royaltyAmount} has been reversed due to a refund. ${royaltyTimeline.message}`,
      },
      timestamp: new Date().toISOString(),
    });

    logger.debug('Venue royalty reversal notification published', {
      venueId: data.venueId,
      reversedAmount: data.venueRoyaltyReversed,
    });
  }

  /**
   * Get seller info for an order (if it was a resale)
   */
  async getSellerInfo(orderId: string): Promise<{
    sellerId?: string;
    sellerEmail?: string;
  } | null> {
    try {
      // Check if order was from marketplace (resale)
      const result = await this.db.query(
        `SELECT seller_id, seller_email
         FROM marketplace_transactions
         WHERE order_id = $1`,
        [orderId]
      );

      if (result.rows.length > 0) {
        return {
          sellerId: result.rows[0].seller_id,
          sellerEmail: result.rows[0].seller_email,
        };
      }

      return null;
    } catch (error) {
      // Table might not exist or order wasn't a resale
      logger.debug('Could not get seller info (may not be resale)', { orderId });
      return null;
    }
  }

  /**
   * Get event and creator info for notifications
   */
  async getEventInfo(eventId: string): Promise<{
    eventName?: string;
    creatorId?: string;
    creatorName?: string;
    venueId?: string;
    venueName?: string;
  }> {
    try {
      const result = await this.db.query(
        `SELECT e.name as event_name, e.creator_id, e.venue_id,
                u.display_name as creator_name, v.name as venue_name
         FROM events e
         LEFT JOIN users u ON e.creator_id = u.id
         LEFT JOIN venues v ON e.venue_id = v.id
         WHERE e.id = $1`,
        [eventId]
      );

      if (result.rows.length > 0) {
        return {
          eventName: result.rows[0].event_name,
          creatorId: result.rows[0].creator_id,
          creatorName: result.rows[0].creator_name,
          venueId: result.rows[0].venue_id,
          venueName: result.rows[0].venue_name,
        };
      }

      return {};
    } catch (error) {
      logger.debug('Could not get event info', { eventId, error });
      return {};
    }
  }

  /**
   * MEDIUM: Get payment method for an order (for timeline calculation)
   */
  async getPaymentMethod(orderId: string): Promise<string | undefined> {
    try {
      const result = await this.db.query(
        `SELECT payment_method FROM orders WHERE id = $1`,
        [orderId]
      );

      return result.rows[0]?.payment_method;
    } catch (error) {
      logger.debug('Could not get payment method', { orderId, error });
      return undefined;
    }
  }
}

export const refundNotificationService = new RefundNotificationService();
