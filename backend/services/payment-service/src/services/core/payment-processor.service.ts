import Stripe from 'stripe';
import { TransactionModel } from '../../models/transaction.model';
import { VenueBalanceModel } from '../../models/venue-balance.model';
import { PaymentRequest, TransactionStatus } from '../../types/payment.types';
import { FeeCalculatorService } from './fee-calculator.service';
import { logger } from '../../utils/logger';
import axios from 'axios';

export class PaymentProcessorService {
  private stripe: Stripe;
  private feeCalculator: FeeCalculatorService;
  private log = logger.child({ component: 'PaymentProcessor' });

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16'
    });
    this.feeCalculator = new FeeCalculatorService();
  }

  async processPayment(request: PaymentRequest): Promise<any> {
    try {
      // Calculate total amount in cents from tickets
      let totalAmountCents = 0;
      const ticketIds: string[] = [];

      for (const ticket of request.tickets) {
        // ticket.price is already in cents
        totalAmountCents += ticket.price * ticket.quantity;
        for (let i = 0; i < ticket.quantity; i++) {
          ticketIds.push(`${ticket.ticketTypeId}_${i}`);
        }
      }

      // Calculate fees (all in cents)
      const fees = await this.feeCalculator.calculateDynamicFees(
        request.venueId,
        totalAmountCents,
        request.tickets.reduce((sum, t) => sum + t.quantity, 0)
      );

      // Create Stripe payment intent (Stripe expects cents)
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: fees.total, // Already in cents
        currency: 'usd',
        payment_method: request.paymentMethod.paymentMethodId || request.paymentMethod.token,
        confirm: true,
        metadata: {
          venueId: request.venueId,
          eventId: request.eventId,
          userId: request.userId,
          ticketIds: ticketIds.join(',')
        }
      });

      // Record transaction (all amounts in cents)
      const transaction = await TransactionModel.create({
        userId: request.userId,
        venueId: request.venueId,
        eventId: request.eventId,
        amount: totalAmountCents,
        platformFee: fees.platform,
        taxAmount: fees.tax,
        totalAmount: fees.total,
        status: this.mapStripeStatus(paymentIntent.status),
        stripePaymentIntentId: paymentIntent.id,
        idempotencyKey: request.idempotencyKey,
        tenantId: request.userId, // Use userId as tenantId for now
        metadata: {
          ticketIds,
          tickets: request.tickets
        }
      });

      // Update venue balance if payment succeeded
      if (paymentIntent.status === 'succeeded') {
        await VenueBalanceModel.updateBalance(
          request.venueId,
          totalAmountCents - fees.platform,
          'available'
        );
      }

      return {
        transactionId: transaction.id,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        fees,
        clientSecret: paymentIntent.client_secret
      };

    } catch (error) {
      this.log.error('Payment processing failed:', error);
      throw error;
    }
  }

  async updatePaymentStatus(
    paymentIntentId: string,
    status: string
  ): Promise<any> {
    const transaction = await TransactionModel.findByPaymentIntentId(paymentIntentId);

    if (!transaction) {
      throw new Error(`Transaction not found for payment intent: ${paymentIntentId}`);
    }

    const mappedStatus = this.mapStripeStatus(status);
    const updatedTransaction = await TransactionModel.updateStatus(
      transaction.id,
      mappedStatus
    );

    // Update venue balance based on status change (amounts are in cents)
    if (status === 'succeeded' && transaction.status !== TransactionStatus.COMPLETED) {
      const totalAmountCents = transaction.amount || 0;
      const platformFeeCents = transaction.platformFee || 0;

      await VenueBalanceModel.updateBalance(
        transaction.venueId,
        totalAmountCents - platformFeeCents,
        'available'
      );
    }

    return updatedTransaction;
  }

  async refundPayment(transactionId: string, amountCents?: number): Promise<any> {
    const transaction = await TransactionModel.findById(transactionId);

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (!transaction.stripePaymentIntentId) {
      throw new Error('No Stripe payment intent associated with this transaction');
    }

    // Check if any tickets have been transferred or used
    if (transaction.metadata?.ticketIds && transaction.metadata.ticketIds.length > 0) {
      try {
        const ticketServiceUrl = process.env.TICKET_SERVICE_URL || 'http://ticket-service:3000';
        const ticketCheckPromises = transaction.metadata.ticketIds.map(async (ticketId: string) => {
          try {
            const response = await axios.get(`${ticketServiceUrl}/internal/tickets/${ticketId}/status`, {
              headers: {
                'x-internal-service': 'payment-service',
                'x-internal-timestamp': Date.now().toString(),
                'x-internal-signature': 'temp-signature'
              },
              timeout: 5000
            });
            return response.data;
          } catch (error) {
            this.log.error(`Failed to check ticket status for ${ticketId}:`, error);
            throw new Error(`Unable to verify ticket status for ticket ${ticketId}`);
          }
        });

        const ticketStatuses = await Promise.all(ticketCheckPromises);

        for (const ticketStatus of ticketStatuses) {
          if (ticketStatus.status === 'TRANSFERRED') {
            throw new Error('Cannot refund: One or more tickets have been transferred to another user');
          }
          if (ticketStatus.status === 'USED') {
            throw new Error('Cannot refund: One or more tickets have already been used');
          }
          if (ticketStatus.nftMinted && ticketStatus.nftTransferred) {
            throw new Error('Cannot refund: NFT has been minted and transferred');
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot refund:')) {
          throw error;
        }
        this.log.error('Error checking ticket status for refund:', error);
        throw new Error('Unable to process refund: Could not verify ticket status');
      }
    }

    // Create refund in Stripe (amount in cents)
    const refund = await this.stripe.refunds.create({
      payment_intent: transaction.stripePaymentIntentId,
      amount: amountCents ? amountCents : undefined
    });

    // Calculate refund details (all in cents)
    const refundAmountCents = amountCents || transaction.amount;
    const isPartial = amountCents && amountCents < transaction.amount;

    await TransactionModel.updateStatus(
      transactionId,
      isPartial ? TransactionStatus.PARTIALLY_REFUNDED : TransactionStatus.REFUNDED
    );

    // Adjust venue balance - pro-rata platform fee refund
    const platformFeeRefundCents = Math.floor(
      (refundAmountCents / transaction.amount) * transaction.platformFee
    );
    const venueRefundCents = refundAmountCents - platformFeeRefundCents;

    await VenueBalanceModel.updateBalance(
      transaction.venueId,
      -venueRefundCents,
      'available'
    );

    // Cancel tickets if full refund
    if (transaction.metadata?.ticketIds && transaction.metadata.ticketIds.length > 0) {
      try {
        const ticketServiceUrl = process.env.TICKET_SERVICE_URL || 'http://ticket-service:3000';
        await axios.post(
          `${ticketServiceUrl}/internal/tickets/cancel-batch`,
          {
            ticketIds: transaction.metadata.ticketIds,
            reason: 'payment_refunded',
            refundId: refund.id
          },
          {
            headers: {
              'x-internal-service': 'payment-service',
              'x-internal-timestamp': Date.now().toString(),
              'x-internal-signature': 'temp-signature'
            },
            timeout: 5000
          }
        );
      } catch (error) {
        this.log.error('Failed to cancel tickets after refund:', error);
      }
    }

    return {
      refundId: refund.id,
      amountCents: refundAmountCents,
      status: refund.status,
      transactionId
    };
  }

  private mapStripeStatus(stripeStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'succeeded': TransactionStatus.COMPLETED,
      'processing': TransactionStatus.PROCESSING,
      'requires_payment_method': TransactionStatus.PENDING,
      'requires_confirmation': TransactionStatus.PENDING,
      'requires_action': TransactionStatus.PENDING,
      'canceled': TransactionStatus.FAILED,
      'failed': TransactionStatus.FAILED
    };

    return statusMap[stripeStatus] || TransactionStatus.PENDING;
  }
}
