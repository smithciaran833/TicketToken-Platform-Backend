import { publishEvent } from '../config/rabbitmq';
import { OrderEvents, OrderEventPayload } from './event-types';
import { logger } from '../utils/logger';
import { validateEventPayloadOrThrow } from './event-validator';
import { getLatestVersion } from './event-versions';
// import { eventStoreService } from '../services/event-store.service';
import { generateTimestampedIdempotencyKey } from '../utils/idempotency-key-generator';
// import { eventSequencerService } from '../services/event-sequencer.service';
import { retry } from '../utils/retry';
// import { DeadLetterQueueService } from '../services/dead-letter-queue.service';
// import { eventMonitoringService } from '../services/event-monitoring.service';

// const dlqService = new DeadLetterQueueService();

export class EventPublisher {
  /**
   * Helper to store event in event store and publish to RabbitMQ
   */
  private async storeAndPublish(
    eventType: OrderEvents,
    payload: any,
    tenantId: string
  ): Promise<void> {
    // Validate payload
    const validatedPayload = validateEventPayloadOrThrow(eventType, payload);
    const version = getLatestVersion(eventType);
    const idempotencyKey = generateTimestampedIdempotencyKey(eventType, payload.orderId);
    const sequenceNumber = 0; // await eventSequencerService.getNextSequence(payload.orderId);
    
    // Store in event store first (for audit trail) - DISABLED (service not implemented)
    // try {
    //   await eventStoreService.storeEvent({
    //     eventType,
    //     version,
    //     aggregateId: payload.orderId,
    //     tenantId,
    //     payload: validatedPayload,
    //   });
    // } catch (error) {
    //   logger.warn('Failed to store event in event store, continuing with publish', {
    //     error,
    //     eventType,
    //     orderId: payload.orderId,
    //   });
    // }
    
    // Publish to event bus with retry logic
    const eventData = {
      version,
      type: eventType,
      idempotencyKey,
      sequenceNumber,
      aggregateId: payload.orderId,
      payload: validatedPayload,
      timestamp: new Date(),
    };
    
    try {
      await retry(
        () => publishEvent(eventType, eventData),
        {
          maxAttempts: 3,
          delayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        }
      );
      
      // Record successful publication - DISABLED (service not implemented)
      // await eventMonitoringService.recordPublished(eventType);
    } catch (error) {
      // All retries failed, add to DLQ - DISABLED (service not implemented)
      logger.error('All publish attempts failed', {
        eventType,
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error,
      });
      
      // await dlqService.addToDLQ({
      //   eventType,
      //   payload: validatedPayload,
      //   error: error instanceof Error ? error.message : String(error),
      //   attemptCount: 3,
      // });
      
      // Record failed publication - DISABLED (service not implemented)
      // await eventMonitoringService.recordFailed(eventType);
      
      // Re-throw to indicate failure
      throw error;
    }
  }

  async publishOrderCreated(payload: OrderEventPayload): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_CREATED, payload, payload.userId);
      logger.info('Order created event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order created event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async publishOrderReserved(payload: OrderEventPayload & { expiresAt: Date }): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_RESERVED, payload, payload.userId);
      logger.info('Order reserved event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order reserved event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async publishOrderConfirmed(payload: OrderEventPayload & { paymentIntentId: string }): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_CONFIRMED, payload, payload.userId);
      logger.info('Order confirmed event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order confirmed event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async publishOrderCancelled(payload: OrderEventPayload & { reason: string; refundAmountCents?: number }): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_CANCELLED, payload, payload.userId);
      logger.info('Order cancelled event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order cancelled event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async publishOrderExpired(payload: OrderEventPayload & { reason: string }): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_EXPIRED, payload, payload.userId);
      logger.info('Order expired event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order expired event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async publishOrderRefunded(payload: OrderEventPayload & { refundAmountCents: number; reason: string }): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_REFUNDED, payload, payload.userId);
      logger.info('Order refunded event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order refunded event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async publishOrderFailed(payload: OrderEventPayload & { error: string }): Promise<void> {
    try {
      await this.storeAndPublish(OrderEvents.ORDER_FAILED, payload, payload.userId);
      logger.info('Order failed event published', { orderId: payload.orderId });
    } catch (error) {
      logger.error('Failed to publish order failed event', { 
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }
}

export const eventPublisher = new EventPublisher();
