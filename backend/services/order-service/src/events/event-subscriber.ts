import { getChannel } from '../config/rabbitmq';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { disputeService, DisputeData, DisputeOutcome } from '../services/dispute.service';

// HIGH: Idempotency key prefix and TTL
const IDEMPOTENCY_PREFIX = 'event:processed:';
const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

export class EventSubscriber {
  /**
   * HIGH: Check if event has already been processed (idempotency)
   * Returns true if already processed, false if new
   */
  private async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      const redis = getRedis();
      const key = `${IDEMPOTENCY_PREFIX}${eventId}`;
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check event idempotency', { error, eventId });
      // Fail open - process the event if we can't check
      return false;
    }
  }

  /**
   * HIGH: Mark event as processed with TTL
   */
  private async markEventProcessed(eventId: string): Promise<void> {
    try {
      const redis = getRedis();
      const key = `${IDEMPOTENCY_PREFIX}${eventId}`;
      await redis.setex(key, IDEMPOTENCY_TTL_SECONDS, Date.now().toString());
    } catch (error) {
      logger.error('Failed to mark event as processed', { error, eventId });
      // Don't throw - event was still processed successfully
    }
  }

  async subscribeToPaymentEvents(): Promise<void> {
    try {
      const channel = getChannel();

      // Listen to payment events that affect orders
      channel.consume('order_service_queue', async (msg) => {
        if (!msg) return;

        try {
          const event = JSON.parse(msg.content.toString());
          
          // HIGH: Generate unique event ID for idempotency
          const eventId = event.id || event.payload?.id || msg.properties.messageId || 
            `${event.type}:${event.payload?.orderId || event.payload?.disputeId}:${Date.now()}`;

          // HIGH: Check if event already processed
          if (await this.isEventProcessed(eventId)) {
            logger.info('Skipping duplicate event', { eventId, type: event.type });
            channel.ack(msg);
            return;
          }

          switch (event.type) {
            case 'payment.succeeded':
              await this.handlePaymentSucceeded(event);
              break;
            case 'payment.failed':
              await this.handlePaymentFailed(event);
              break;

            // CRITICAL: Dispute/Chargeback webhook handlers
            case 'dispute.created':
              await this.handleDisputeCreated(event);
              break;
            case 'dispute.updated':
              await this.handleDisputeUpdated(event);
              break;
            case 'dispute.closed':
              await this.handleDisputeClosed(event);
              break;

            default:
              logger.debug('Unhandled event type', { type: event.type });
          }

          // HIGH: Mark event as processed after successful handling
          await this.markEventProcessed(eventId);

          channel.ack(msg);
        } catch (error) {
          logger.error('Failed to process event', {
            error: error instanceof Error ? error.message : error
          });
          channel.nack(msg, false, false); // Don't requeue
        }
      });

      logger.info('Event subscriber initialized with idempotency checks');
    } catch (error) {
      logger.error('Failed to initialize event subscriber', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  private async handlePaymentSucceeded(event: any): Promise<void> {
    logger.info('Payment succeeded event received', {
      orderId: event.payload?.orderId
    });
    // Order confirmation is handled by internal API call from payment service
  }

  private async handlePaymentFailed(event: any): Promise<void> {
    logger.info('Payment failed event received', {
      orderId: event.payload?.orderId
    });
    // Order expiration/cancellation is handled by internal API call from payment service
  }

  /**
   * CRITICAL: Handle dispute.created webhook from Stripe via payment-service
   * Links dispute to order, locks refunds, alerts team
   */
  private async handleDisputeCreated(event: any): Promise<void> {
    logger.warn('Dispute created event received', {
      disputeId: event.payload?.disputeId,
      paymentIntentId: event.payload?.paymentIntentId,
    });

    const disputeData: DisputeData = {
      disputeId: event.payload.disputeId,
      paymentIntentId: event.payload.paymentIntentId,
      amount: event.payload.amount,
      currency: event.payload.currency || 'usd',
      reason: event.payload.reason,
      status: event.payload.status || 'needs_response',
      evidenceDueBy: event.payload.evidenceDueBy
        ? new Date(event.payload.evidenceDueBy)
        : undefined,
      metadata: event.payload.metadata,
    };

    await disputeService.handleDisputeCreated(disputeData);
  }

  /**
   * CRITICAL: Handle dispute.updated webhook from Stripe via payment-service
   */
  private async handleDisputeUpdated(event: any): Promise<void> {
    logger.info('Dispute updated event received', {
      disputeId: event.payload?.disputeId,
      status: event.payload?.status,
    });

    const disputeData: DisputeData = {
      disputeId: event.payload.disputeId,
      paymentIntentId: event.payload.paymentIntentId,
      amount: event.payload.amount,
      currency: event.payload.currency || 'usd',
      reason: event.payload.reason,
      status: event.payload.status,
      metadata: event.payload.metadata,
    };

    await disputeService.handleDisputeUpdated(disputeData);
  }

  /**
   * CRITICAL: Handle dispute.closed webhook from Stripe via payment-service
   * Unlocks refunds if won, handles consequences if lost
   */
  private async handleDisputeClosed(event: any): Promise<void> {
    logger.info('Dispute closed event received', {
      disputeId: event.payload?.disputeId,
      outcome: event.payload?.outcome,
    });

    const disputeData: DisputeData = {
      disputeId: event.payload.disputeId,
      paymentIntentId: event.payload.paymentIntentId,
      amount: event.payload.amount,
      currency: event.payload.currency || 'usd',
      reason: event.payload.reason,
      status: 'closed',
      metadata: event.payload.metadata,
    };

    const outcome: DisputeOutcome = {
      status: event.payload.outcome || 'lost',
      networkReasonCode: event.payload.networkReasonCode,
    };

    await disputeService.handleDisputeClosed(disputeData, outcome);
  }
}

export const eventSubscriber = new EventSubscriber();
