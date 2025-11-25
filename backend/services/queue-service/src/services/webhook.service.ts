import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Webhook Service
 * Sends webhook notifications to external systems for payment/mint events
 */

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
}

export class WebhookService {
  /**
   * Send webhook to external URL
   */
  async sendWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
    if (!url) {
      logger.warn('Webhook URL not provided');
      return false;
    }

    try {
      logger.info('Sending webhook', {
        event: payload.event,
        url: url.substring(0, 50) + '...',
      });

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TicketToken-Queue-Service/1.0',
        },
        timeout: 10000, // 10 second timeout
      });

      logger.info('Webhook sent successfully', {
        event: payload.event,
        status: response.status,
      });

      return true;
    } catch (error: any) {
      logger.error('Webhook failed', {
        event: payload.event,
        url: url.substring(0, 50) + '...',
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send payment completed webhook
   */
  async sendPaymentCompleted(data: {
    orderId: string;
    userId: string;
    amount: number;
    currency: string;
    paymentIntentId: string;
    webhookUrl?: string;
  }): Promise<boolean> {
    const url = data.webhookUrl || process.env.PAYMENT_WEBHOOK_URL;
    if (!url) return false;

    return this.sendWebhook(url, {
      event: 'payment.completed',
      timestamp: new Date().toISOString(),
      data: {
        orderId: data.orderId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        paymentIntentId: data.paymentIntentId,
      },
    });
  }

  /**
   * Send refund completed webhook
   */
  async sendRefundCompleted(data: {
    orderId: string;
    userId: string;
    amount: number;
    currency: string;
    refundId: string;
    webhookUrl?: string;
  }): Promise<boolean> {
    const url = data.webhookUrl || process.env.REFUND_WEBHOOK_URL;
    if (!url) return false;

    return this.sendWebhook(url, {
      event: 'refund.completed',
      timestamp: new Date().toISOString(),
      data: {
        orderId: data.orderId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        refundId: data.refundId,
      },
    });
  }

  /**
   * Send NFT minted webhook
   */
  async sendNFTMinted(data: {
    ticketId: string;
    orderId: string;
    userId: string;
    mintAddress: string;
    metadataUri: string;
    explorerUrl: string;
    webhookUrl?: string;
  }): Promise<boolean> {
    const url = data.webhookUrl || process.env.NFT_WEBHOOK_URL;
    if (!url) return false;

    return this.sendWebhook(url, {
      event: 'nft.minted',
      timestamp: new Date().toISOString(),
      data: {
        ticketId: data.ticketId,
        orderId: data.orderId,
        userId: data.userId,
        mintAddress: data.mintAddress,
        metadataUri: data.metadataUri,
        explorerUrl: data.explorerUrl,
      },
    });
  }

  /**
   * Send operation failed webhook (for admin alerts)
   */
  async sendOperationFailed(data: {
    operation: string;
    orderId?: string;
    userId?: string;
    error: string;
    webhookUrl?: string;
  }): Promise<boolean> {
    const url = data.webhookUrl || process.env.ADMIN_WEBHOOK_URL;
    if (!url) return false;

    return this.sendWebhook(url, {
      event: 'operation.failed',
      timestamp: new Date().toISOString(),
      data: {
        operation: data.operation,
        orderId: data.orderId,
        userId: data.userId,
        error: data.error,
      },
    });
  }
}

// Export singleton instance
export const webhookService = new WebhookService();
