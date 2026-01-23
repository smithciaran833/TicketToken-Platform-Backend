/**
 * Royalty Service - order-service
 *
 * PHASE 5c REFACTORED:
 * Extends BaseServiceClient from @tickettoken/shared for standardized
 * HMAC auth, circuit breaker, retry, and tracing.
 *
 * Handles royalty distributions and reversals for refund scenarios.
 */

import {
  BaseServiceClient,
  RequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';
import { publishEvent } from '../config/rabbitmq';

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

/**
 * Royalty client for order-service
 *
 * Wraps payment-service royalty functionality for refund scenarios.
 */
export class RoyaltyService extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
      serviceName: 'payment-service',
      timeout: 10000,
    });
  }

  /**
   * Get royalty distributions for an order
   */
  async getRoyaltiesForOrder(
    orderId: string,
    ctx?: RequestContext
  ): Promise<RoyaltyDistribution[]> {
    try {
      const context = ctx || { tenantId: 'system' };
      const response = await this.get<{ distributions: RoyaltyDistribution[] }>(
        `/internal/royalties/order/${orderId}`,
        context
      );
      return response.data.distributions || [];
    } catch (error) {
      logger.error('Failed to get royalties for order', { error, orderId });
      return [];
    }
  }

  /**
   * Process royalty reversals for a refund
   */
  async processReversals(
    request: RoyaltyReversalRequest,
    ctx?: RequestContext
  ): Promise<RoyaltyReversalResult> {
    logger.info('Processing royalty reversals', {
      orderId: request.orderId,
      refundId: request.refundId,
      refundAmountCents: request.refundAmountCents,
    });

    try {
      // Get existing royalty distributions
      const distributions = await this.getRoyaltiesForOrder(request.orderId, ctx);

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
      const context = ctx || { tenantId: 'system' };

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
          const reversalResponse = await this.post<{ reversalId: string }>(
            '/internal/royalties/reverse',
            context,
            {
              distributionId: distribution.id,
              orderId: request.orderId,
              refundId: request.refundId,
              reversalAmount,
              reason: request.reason,
            }
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
   */
  async hasRoyalties(orderId: string, ctx?: RequestContext): Promise<boolean> {
    const distributions = await this.getRoyaltiesForOrder(orderId, ctx);
    return distributions.some(d => d.recipientType !== 'platform' && !d.reversedAt);
  }

  /**
   * Get total royalty amount for an order
   */
  async getTotalRoyalties(orderId: string, ctx?: RequestContext): Promise<{
    total: number;
    venue: number;
    artist: number;
    platform: number;
  }> {
    const distributions = await this.getRoyaltiesForOrder(orderId, ctx);

    return {
      total: distributions.reduce((sum, d) => sum + d.amount, 0),
      venue: distributions.filter(d => d.recipientType === 'venue').reduce((sum, d) => sum + d.amount, 0),
      artist: distributions.filter(d => d.recipientType === 'artist').reduce((sum, d) => sum + d.amount, 0),
      platform: distributions.filter(d => d.recipientType === 'platform').reduce((sum, d) => sum + d.amount, 0),
    };
  }
}

export const royaltyService = new RoyaltyService();
