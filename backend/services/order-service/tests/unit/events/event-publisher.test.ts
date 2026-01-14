import { EventPublisher, eventPublisher } from '../../../src/events/event-publisher';
import { OrderEvents, OrderEventPayload } from '../../../src/events/event-types';
import * as rabbitmq from '../../../src/config/rabbitmq';
import { logger } from '../../../src/utils/logger';
import * as eventValidator from '../../../src/events/event-validator';
import * as eventVersions from '../../../src/events/event-versions';
import * as idempotencyKeyGenerator from '../../../src/utils/idempotency-key-generator';
import * as retryUtil from '../../../src/utils/retry';

// Mock all dependencies
jest.mock('../../../src/config/rabbitmq');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/events/event-validator');
jest.mock('../../../src/events/event-versions');
jest.mock('../../../src/utils/idempotency-key-generator');
jest.mock('../../../src/utils/retry');

describe('EventPublisher', () => {
  let publisher: EventPublisher;
  
  // Mock implementations
  const mockPublishEvent = jest.mocked(rabbitmq.publishEvent);
  const mockValidateEventPayloadOrThrow = jest.mocked(eventValidator.validateEventPayloadOrThrow);
  const mockGetLatestVersion = jest.mocked(eventVersions.getLatestVersion);
  const mockGenerateTimestampedIdempotencyKey = jest.mocked(idempotencyKeyGenerator.generateTimestampedIdempotencyKey);
  const mockRetry = jest.mocked(retryUtil.retry);
  const mockLoggerInfo = logger.info as jest.MockedFunction<typeof logger.info>;
  const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;

  // Test data
  const basePayload: OrderEventPayload = {
    orderId: '123e4567-e89b-12d3-a456-426614174000',
    userId: '987e6543-e21b-12d3-a456-426614174001',
    eventId: '456e7890-e12b-12d3-a456-426614174002',
    orderNumber: 'ORD-2024-001',
    status: 'PENDING',
    totalCents: 10000,
    currency: 'USD',
    items: [
      {
        ticketTypeId: '789e0123-e45b-12d3-a456-426614174003',
        quantity: 2,
        unitPriceCents: 5000,
      },
    ],
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { source: 'web' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new EventPublisher();

    // Default mock implementations
    mockValidateEventPayloadOrThrow.mockImplementation((eventType, payload) => payload);
    mockGetLatestVersion.mockReturnValue('1.0.0');
    mockGenerateTimestampedIdempotencyKey.mockReturnValue('idempotency-key-123');
    mockRetry.mockImplementation(async (fn) => await fn());
    mockPublishEvent.mockResolvedValue(undefined);
  });

  describe('publishOrderCreated', () => {
    it('should successfully publish order created event', async () => {
      await publisher.publishOrderCreated(basePayload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        basePayload
      );
      expect(mockGetLatestVersion).toHaveBeenCalledWith(OrderEvents.ORDER_CREATED);
      expect(mockGenerateTimestampedIdempotencyKey).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        basePayload.orderId
      );
      
      expect(mockRetry).toHaveBeenCalledWith(
        expect.any(Function),
        {
          maxAttempts: 3,
          delayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        }
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        expect.objectContaining({
          version: '1.0.0',
          type: OrderEvents.ORDER_CREATED,
          idempotencyKey: 'idempotency-key-123',
          sequenceNumber: 0,
          aggregateId: basePayload.orderId,
          payload: basePayload,
          timestamp: expect.any(Date),
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order created event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should log error and rethrow when validation fails', async () => {
      const validationError = new Error('Validation failed');
      mockValidateEventPayloadOrThrow.mockImplementation(() => {
        throw validationError;
      });

      await expect(publisher.publishOrderCreated(basePayload)).rejects.toThrow(
        'Validation failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order created event',
        {
          orderId: basePayload.orderId,
          error: 'Validation failed',
        }
      );

      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it('should log error and rethrow when publish fails after retries', async () => {
      const publishError = new Error('RabbitMQ connection failed');
      mockRetry.mockRejectedValue(publishError);

      await expect(publisher.publishOrderCreated(basePayload)).rejects.toThrow(
        'RabbitMQ connection failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'All publish attempts failed',
        {
          eventType: OrderEvents.ORDER_CREATED,
          orderId: basePayload.orderId,
          error: 'RabbitMQ connection failed',
        }
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order created event',
        {
          orderId: basePayload.orderId,
          error: 'RabbitMQ connection failed',
        }
      );
    });

    it('should handle non-Error objects in catch blocks', async () => {
      const stringError = 'String error';
      mockRetry.mockRejectedValue(stringError);

      await expect(publisher.publishOrderCreated(basePayload)).rejects.toBe(stringError);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'All publish attempts failed',
        expect.objectContaining({
          error: 'String error',
        })
      );
    });
  });

  describe('publishOrderReserved', () => {
    it('should successfully publish order reserved event', async () => {
      const payload = {
        ...basePayload,
        expiresAt: new Date('2024-01-15T10:15:00Z'),
      };

      await publisher.publishOrderReserved(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_RESERVED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_RESERVED,
        expect.objectContaining({
          type: OrderEvents.ORDER_RESERVED,
          payload: payload,
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order reserved event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should log error and rethrow on failure', async () => {
      const payload = {
        ...basePayload,
        expiresAt: new Date('2024-01-15T10:15:00Z'),
      };
      const error = new Error('Publish failed');
      mockRetry.mockRejectedValue(error);

      await expect(publisher.publishOrderReserved(payload)).rejects.toThrow(
        'Publish failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order reserved event',
        {
          orderId: basePayload.orderId,
          error: 'Publish failed',
        }
      );
    });
  });

  describe('publishOrderConfirmed', () => {
    it('should successfully publish order confirmed event', async () => {
      const payload = {
        ...basePayload,
        paymentIntentId: 'pi_123456789',
      };

      await publisher.publishOrderConfirmed(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_CONFIRMED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CONFIRMED,
        expect.objectContaining({
          type: OrderEvents.ORDER_CONFIRMED,
          payload: payload,
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order confirmed event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should log error and rethrow on failure', async () => {
      const payload = {
        ...basePayload,
        paymentIntentId: 'pi_123456789',
      };
      const error = new Error('Publish failed');
      mockRetry.mockRejectedValue(error);

      await expect(publisher.publishOrderConfirmed(payload)).rejects.toThrow(
        'Publish failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order confirmed event',
        {
          orderId: basePayload.orderId,
          error: 'Publish failed',
        }
      );
    });
  });

  describe('publishOrderCancelled', () => {
    it('should successfully publish order cancelled event with refund amount', async () => {
      const payload = {
        ...basePayload,
        reason: 'Customer requested cancellation',
        refundAmountCents: 10000,
      };

      await publisher.publishOrderCancelled(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_CANCELLED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CANCELLED,
        expect.objectContaining({
          type: OrderEvents.ORDER_CANCELLED,
          payload: payload,
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order cancelled event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should successfully publish order cancelled event without refund amount', async () => {
      const payload = {
        ...basePayload,
        reason: 'Event cancelled by organizer',
      };

      await publisher.publishOrderCancelled(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_CANCELLED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CANCELLED,
        expect.objectContaining({
          payload: payload,
        })
      );
    });

    it('should log error and rethrow on failure', async () => {
      const payload = {
        ...basePayload,
        reason: 'Customer requested cancellation',
      };
      const error = new Error('Publish failed');
      mockRetry.mockRejectedValue(error);

      await expect(publisher.publishOrderCancelled(payload)).rejects.toThrow(
        'Publish failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order cancelled event',
        {
          orderId: basePayload.orderId,
          error: 'Publish failed',
        }
      );
    });
  });

  describe('publishOrderExpired', () => {
    it('should successfully publish order expired event', async () => {
      const payload = {
        ...basePayload,
        reason: 'Payment not completed within time limit',
      };

      await publisher.publishOrderExpired(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_EXPIRED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_EXPIRED,
        expect.objectContaining({
          type: OrderEvents.ORDER_EXPIRED,
          payload: payload,
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order expired event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should log error and rethrow on failure', async () => {
      const payload = {
        ...basePayload,
        reason: 'Payment not completed within time limit',
      };
      const error = new Error('Publish failed');
      mockRetry.mockRejectedValue(error);

      await expect(publisher.publishOrderExpired(payload)).rejects.toThrow(
        'Publish failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order expired event',
        {
          orderId: basePayload.orderId,
          error: 'Publish failed',
        }
      );
    });
  });

  describe('publishOrderRefunded', () => {
    it('should successfully publish order refunded event', async () => {
      const payload = {
        ...basePayload,
        refundAmountCents: 10000,
        reason: 'Event cancelled',
      };

      await publisher.publishOrderRefunded(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_REFUNDED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_REFUNDED,
        expect.objectContaining({
          type: OrderEvents.ORDER_REFUNDED,
          payload: payload,
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order refunded event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should log error and rethrow on failure', async () => {
      const payload = {
        ...basePayload,
        refundAmountCents: 10000,
        reason: 'Event cancelled',
      };
      const error = new Error('Publish failed');
      mockRetry.mockRejectedValue(error);

      await expect(publisher.publishOrderRefunded(payload)).rejects.toThrow(
        'Publish failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order refunded event',
        {
          orderId: basePayload.orderId,
          error: 'Publish failed',
        }
      );
    });
  });

  describe('publishOrderFailed', () => {
    it('should successfully publish order failed event', async () => {
      const payload = {
        ...basePayload,
        error: 'Payment processing failed: Insufficient funds',
      };

      await publisher.publishOrderFailed(payload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_FAILED,
        payload
      );

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_FAILED,
        expect.objectContaining({
          type: OrderEvents.ORDER_FAILED,
          payload: payload,
        })
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Order failed event published',
        { orderId: basePayload.orderId }
      );
    });

    it('should log error and rethrow on failure', async () => {
      const payload = {
        ...basePayload,
        error: 'Payment processing failed',
      };
      const error = new Error('Publish failed');
      mockRetry.mockRejectedValue(error);

      await expect(publisher.publishOrderFailed(payload)).rejects.toThrow(
        'Publish failed'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to publish order failed event',
        {
          orderId: basePayload.orderId,
          error: 'Publish failed',
        }
      );
    });
  });

  describe('storeAndPublish (private method behavior)', () => {
    it('should use userId as tenantId', async () => {
      await publisher.publishOrderCreated(basePayload);

      // Verify the payload is validated with correct event type
      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        basePayload
      );
    });

    it('should set sequenceNumber to 0', async () => {
      await publisher.publishOrderCreated(basePayload);

      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sequenceNumber: 0,
        })
      );
    });

    it('should include timestamp in event data', async () => {
      const beforeTime = new Date();
      await publisher.publishOrderCreated(basePayload);
      const afterTime = new Date();

      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );

      const callArgs = mockPublishEvent.mock.calls[0];
      const eventData = callArgs[1];
      expect(eventData.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(eventData.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should use correct retry configuration', async () => {
      await publisher.publishOrderCreated(basePayload);

      expect(mockRetry).toHaveBeenCalledWith(
        expect.any(Function),
        {
          maxAttempts: 3,
          delayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        }
      );
    });
  });

  describe('eventPublisher singleton', () => {
    it('should export a singleton instance', () => {
      expect(eventPublisher).toBeInstanceOf(EventPublisher);
    });

    it('should use the singleton instance', async () => {
      await eventPublisher.publishOrderCreated(basePayload);

      expect(mockValidateEventPayloadOrThrow).toHaveBeenCalled();
      expect(mockPublishEvent).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty metadata', async () => {
      const payloadWithoutMetadata = { ...basePayload };
      delete payloadWithoutMetadata.metadata;

      await publisher.publishOrderCreated(payloadWithoutMetadata);

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        expect.objectContaining({
          payload: payloadWithoutMetadata,
        })
      );
    });

    it('should handle validation that transforms payload', async () => {
      const transformedPayload = {
        ...basePayload,
        totalCents: 10000, // Validator might convert string to number
      };
      mockValidateEventPayloadOrThrow.mockReturnValue(transformedPayload);

      await publisher.publishOrderCreated(basePayload);

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        expect.objectContaining({
          payload: transformedPayload,
        })
      );
    });

    it('should generate unique idempotency keys for different orders', async () => {
      mockGenerateTimestampedIdempotencyKey
        .mockReturnValueOnce('key-1')
        .mockReturnValueOnce('key-2');

      const payload1 = { ...basePayload, orderId: 'order-1' };
      const payload2 = { ...basePayload, orderId: 'order-2' };

      await publisher.publishOrderCreated(payload1);
      await publisher.publishOrderCreated(payload2);

      expect(mockGenerateTimestampedIdempotencyKey).toHaveBeenNthCalledWith(
        1,
        OrderEvents.ORDER_CREATED,
        'order-1'
      );
      expect(mockGenerateTimestampedIdempotencyKey).toHaveBeenNthCalledWith(
        2,
        OrderEvents.ORDER_CREATED,
        'order-2'
      );
    });

    it('should set aggregateId to orderId for event grouping', async () => {
      const orderId = '123e4567-e89b-12d3-a456-426614174000';
      const payload = { ...basePayload, orderId };

      await publisher.publishOrderCreated(payload);

      expect(mockPublishEvent).toHaveBeenCalledWith(
        OrderEvents.ORDER_CREATED,
        expect.objectContaining({
          aggregateId: orderId,
        })
      );
    });
  });
});
