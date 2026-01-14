import { logger } from '../utils/logger';
import { createSecureServiceClient, executeWithRetry, getServiceUrl } from '../utils/http-client.util';
import { AxiosInstance } from 'axios';
import { publishEvent } from '../config/rabbitmq';

/**
 * HIGH: Royalty handling service for order-service
 * Wraps payment-service royalty functionality for refund scenarios
 * 
 * On refunds:
 * - Query royalty distributions for the order
 * - Request royalty reversals from payment-service
 * - Notify creators/venues of reversed royalties
 */

const PAYMENT_SERVICE_URL = getServiceUrl('payment-service', 'http://tickettoken-payment:3006');

export interface RoyaltyDistribution {
  id: string;
  transactionId: string;
  recipientType: 'venue' | 'artist' | 'platform';
  recipientId: string;
  amount: number;
  percentage: number;
  createdAt: Date;
  reversedAt?: Date;
  reversalId?: string;
}

export interface RoyaltyReversalRequest {
  orderId: string;
  refundId: string;
  refundAmountCents: number;
  refundPercentage: number; // For partial refunds
  reason: string;
}

export interface RoyaltyReversalResult {
  success: boolean;
  reversals: Array<{
    recipientType: string;
    recipientId: string;
    originalAmount: number;
    reversedAmount: number;
    reversalId: string;
  }>;
  totalReversed: number;
  errors?: string[];
}

interface RequestContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
}

export class RoyaltyService {
  private client: AxiosInstance;

  constructor() {
    this.client = createSecureServiceClient({
      baseUrl: PAYMENT_SERVICE_URL,
      serviceName: 'payment-service',
      timeout: 10000,
    });
  }

  /**
   * Get royalty distributions for an order
   */
  async getRoyaltiesForOrder(
    orderId: string,
    context?: RequestContext
  ): Promise<RoyaltyDistribution[]> {
    try {
      const response = await executeWithRetry(
        () => this.client.get(`/internal/royalties/order/${orderId}`, { context } as any),
        2,
        'payment-service'
      );
      return response.data.distributions || [];
    } catch (error) {
      logger.error('Failed to get royalties for order', { error, orderId });
      return [];
    }
  }

  /**
   * Process royalty reversals for a refund
   * Called when a refund is processed
   */
  async processReversals(
    request: RoyaltyReversalRequest,
    context?: RequestContext
  ): Promise<RoyaltyReversalResult> {
    logger.info('Processing royalty reversals', {
      orderId: request.orderId,
      refundId: request.refundId,
      refundAmountCents: request.refundAmountCents,
    });

    try {
      // Get existing royalty distributions
      const distributions = await this.getRoyaltiesForOrder(request.orderId, context);

      if (distributions.length === 0) {
        logger.info('No royalties to reverse for order', { orderId: request.orderId });
        return {
          success: true,
          reversals: [],
          totalReversed: 0,
        };
      }

      // Calculate reversal amounts (proportional to refund percentage)
      const reversalPercentage = request.refundPercentage / 100;
      const reversals: RoyaltyReversalResult['reversals'] = [];
      let totalReversed = 0;
      const errors: string[] = [];

      for (const distribution of distributions) {
        // Skip already reversed distributions
        if (distribution.reversedAt) {
          continue;
        }

        // Skip platform fees (usually not reversed)
        if (distribution.recipientType === 'platform') {
          continue;
        }

        const reversalAmount = Math.round(distribution.amount * reversalPercentage * 100) / 100;

        if (reversalAmount <= 0) {
          continue;
        }

        try {
          // Request reversal from payment service
          const reversalResponse = await executeWithRetry(
            () => this.client.post('/internal/royalties/reverse', {
              distributionId: distribution.id,
              orderId: request.orderId,
              refundId: request.refundId,
              reversalAmount,
              reason: request.reason,
            }, { context } as any),
            2,
            'payment-service'
          );

          reversals.push({
            recipientType: distribution.recipientType,
            recipientId: distribution.recipientId,
            originalAmount: distribution.amount,
            reversedAmount: reversalAmount,
            reversalId: reversalResponse.data.reversalId,
          });

          totalReversed += reversalAmount;

          // Notify the recipient about the reversal
          await this.notifyRecipient(distribution, reversalAmount, request);

        } catch (error) {
          const errorMsg = `Failed to reverse royalty for ${distribution.recipientType}: ${(error as Error).message}`;
          logger.error(errorMsg, { distributionId: distribution.id });
          errors.push(errorMsg);
        }
      }

      logger.info('Royalty reversals completed', {
        orderId: request.orderId,
        totalReversed,
        reversalCount: reversals.length,
        errorCount: errors.length,
      });

      return {
        success: errors.length === 0,
        reversals,
        totalReversed,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      logger.error('Failed to process royalty reversals', { error, request });
      return {
        success: false,
        reversals: [],
        totalReversed: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Notify recipient (venue/artist) about royalty reversal
   */
  private async notifyRecipient(
    distribution: RoyaltyDistribution,
    reversalAmount: number,
    request: RoyaltyReversalRequest
  ): Promise<void> {
    const eventType = distribution.recipientType === 'venue' 
      ? 'notification.venue.royalty_reversed'
      : 'notification.artist.royalty_reversed';

    await publishEvent(eventType, {
      recipientType: distribution.recipientType,
      recipientId: distribution.recipientId,
      orderId: request.orderId,
      refundId: request.refundId,
      originalAmount: distribution.amount,
      reversedAmount: reversalAmount,
      reason: request.reason,
      timestamp: new Date().toISOString(),
    });

    logger.info('Royalty reversal notification sent', {
      recipientType: distribution.recipientType,
      recipientId: distribution.recipientId,
      reversalAmount,
    });
  }

  /**
   * Check if order has royalties that would need reversal
   * Useful for refund eligibility checks
   */
  async hasRoyalties(orderId: string, context?: RequestContext): Promise<boolean> {
    const distributions = await this.getRoyaltiesForOrder(orderId, context);
    return distributions.some(d => d.recipientType !== 'platform' && !d.reversedAt);
  }

  /**
   * Get total royalty amount for an order
   */
  async getTotalRoyalties(orderId: string, context?: RequestContext): Promise<{
    total: number;
    venue: number;
    artist: number;
    platform: number;
  }> {
    const distributions = await this.getRoyaltiesForOrder(orderId, context);

    return {
      total: distributions.reduce((sum, d) => sum + d.amount, 0),
      venue: distributions.filter(d => d.recipientType === 'venue').reduce((sum, d) => sum + d.amount, 0),
      artist: distributions.filter(d => d.recipientType === 'artist').reduce((sum, d) => sum + d.amount, 0),
      platform: distributions.filter(d => d.recipientType === 'platform').reduce((sum, d) => sum + d.amount, 0),
    };
  }
}

export const royaltyService = new RoyaltyService();
