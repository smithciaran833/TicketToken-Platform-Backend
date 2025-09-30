import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { config } from '../config';

interface NotificationPayload {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

class NotificationServiceClass {
  private async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      const response = await fetch(`${additionalServiceUrls.notificationServiceUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Notification service error: ${response.statusText}`);
      }
      
      logger.info(`Notification sent to user ${payload.user_id}: ${payload.type}`);
    } catch (error) {
      logger.error('Error sending notification:', error);
      // Don't throw - notifications should not block main flow
    }
  }
  
  async notifyListingSold(
    listingId: string,
    buyerId: string,
    sellerId: string,
    price: number
  ): Promise<void> {
    try {
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_sold',
        title: 'Your ticket has been sold!',
        body: `Your listing has been purchased for $${price}`,
        data: { listing_id: listingId, buyer_id: buyerId },
        priority: 'high'
      });
      
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'purchase_confirmed',
        title: 'Purchase confirmed!',
        body: `You have successfully purchased a ticket for $${price}`,
        data: { listing_id: listingId, seller_id: sellerId },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending listing sold notifications:', error);
    }
  }
  
  async notifyPriceChange(
    listingId: string,
    watchers: string[],
    oldPrice: number,
    newPrice: number
  ): Promise<void> {
    try {
      const priceDirection = newPrice < oldPrice ? 'decreased' : 'increased';
      const priceDiff = Math.abs(newPrice - oldPrice);
      
      for (const watcherId of watchers) {
        await this.sendNotification({
          user_id: watcherId,
          type: 'price_change',
          title: 'Price alert!',
          body: `A ticket you're watching has ${priceDirection} by $${priceDiff}`,
          data: { 
            listing_id: listingId,
            old_price: oldPrice,
            new_price: newPrice
          },
          priority: 'normal'
        });
      }
    } catch (error) {
      logger.error('Error sending price change notifications:', error);
    }
  }
  
  async notifyDisputeUpdate(
    disputeId: string,
    parties: string[],
    status: string,
    message: string
  ): Promise<void> {
    try {
      for (const userId of parties) {
        await this.sendNotification({
          user_id: userId,
          type: 'dispute_update',
          title: 'Dispute status update',
          body: message,
          data: { 
            dispute_id: disputeId,
            status
          },
          priority: 'high'
        });
      }
    } catch (error) {
      logger.error('Error sending dispute notifications:', error);
    }
  }
  
  async notifyTransferComplete(
    transferId: string,
    buyerId: string,
    sellerId: string,
    ticketId: string
  ): Promise<void> {
    try {
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'transfer_complete',
        title: 'Ticket received!',
        body: 'Your ticket has been successfully transferred to your wallet',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
      
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'payment_received',
        title: 'Payment received!',
        body: 'The payment for your ticket sale has been processed',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending transfer notifications:', error);
    }
  }
  
  async notifyListingExpiring(
    listingId: string,
    sellerId: string,
    hoursRemaining: number
  ): Promise<void> {
    try {
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_expiring',
        title: 'Listing expiring soon',
        body: `Your ticket listing will expire in ${hoursRemaining} hours`,
        data: { 
          listing_id: listingId,
          hours_remaining: hoursRemaining
        },
        priority: 'normal'
      });
    } catch (error) {
      logger.error('Error sending expiry notification:', error);
    }
  }
}

export const NotificationService = NotificationServiceClass;
export const notificationService = new NotificationServiceClass();
