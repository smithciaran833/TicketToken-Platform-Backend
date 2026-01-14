import { EventSubscriber, eventSubscriber } from '../../../src/events/event-subscriber';
import * as rabbitmq from '../../../src/config/rabbitmq';
import * as redisConfig from '../../../src/config/redis';
import { logger } from '../../../src/utils/logger';
import { disputeService } from '../../../src/services/dispute.service';

// Mock dependencies
jest.mock('../../../src/config/rabbitmq');
jest.mock('../../../src/config/redis');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/services/dispute.service', () => ({
  disputeService: {
    handleDisputeCreated: jest.fn(),
    handleDisputeUpdated: jest.fn(),
    handleDisputeClosed: jest.fn(),
  },
}));

describe('EventSubscriber', () => {
  let subscriber: EventSubscriber;
  let mockChannel: any;
  let mockRedis: any;
  let mockMessage: any;

  const mockGetChannel = jest.mocked(rabbitmq.getChannel);
  const mockGetRedis = jest.mocked(redisConfig.getRedis);
  const mockDisputeService = jest.mocked(disputeService);
  const mockLogger = {
    info: logger.info as jest.MockedFunction<typeof logger.info>,
    warn: logger.warn as jest.MockedFunction<typeof logger.warn>,
    error: logger.error as jest.MockedFunction<typeof logger.error>,
    debug: logger.debug as jest.MockedFunction<typeof logger.debug>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    subscriber = new EventSubscriber();

    // Mock Redis
    mockRedis = {
      exists: jest.fn().mockResolvedValue(0),
      setex: jest.fn().mockResolvedValue('OK'),
    };
    mockGetRedis.mockReturnValue(mockRedis as any);

    // Mock RabbitMQ Channel
    mockChannel = {
      consume: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
    };
    mockGetChannel.mockReturnValue(mockChannel);

    // Mock message
    mockMessage = {
      content: Buffer.from(JSON.stringify({
        type: 'payment.succeeded',
        id: 'evt_123',
        payload: { orderId: 'order-123' },
      })),
      properties: {
        messageId: 'msg_123',
      },
    };
  });

  describe('subscribeToPaymentEvents', () => {
    it('should initialize event subscriber and start consuming', async () => {
      await subscriber.subscribeToPaymentEvents();

      expect(mockGetChannel).toHaveBeenCalled();
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'order_service_queue',
        expect.any(Function)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Event subscriber initialized with idempotency checks'
      );
    });

    it('should handle null messages gracefully', async () => {
      mockChannel.consume.mockImplementation(async (queue: string, callback: Function) => {
        await callback(null);
      });

      await subscriber.subscribeToPaymentEvents();

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should log error when initialization fails', async () => {
      const error = new Error('Channel not available');
      mockGetChannel.mockImplementation(() => {
        throw error;
      });

      await subscriber.subscribeToPaymentEvents();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize event subscriber',
        { error: 'Channel not available' }
      );
    });
  });

  describe('event processing with idempotency', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should process new event and mark as processed', async () => {
      mockRedis.exists.mockResolvedValue(0); // Event not processed yet

      await consumeCallback(mockMessage);

      expect(mockRedis.exists).toHaveBeenCalledWith('event:processed:evt_123');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'event:processed:evt_123',
        86400,
        expect.any(String)
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should skip duplicate event', async () => {
      mockRedis.exists.mockResolvedValue(1); // Event already processed

      await consumeCallback(mockMessage);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Skipping duplicate event',
        { eventId: 'evt_123', type: 'payment.succeeded' }
      );
      expect(mockRedis.setex).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should process event if idempotency check fails', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));

      await consumeCallback(mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to check event idempotency',
        expect.objectContaining({
          eventId: 'evt_123',
        })
      );
      // Should still process the event
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should continue if marking event as processed fails', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis write failed'));

      await consumeCallback(mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to mark event as processed',
        expect.objectContaining({
          eventId: 'evt_123',
        })
      );
      // Should still ack the message
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should generate event ID from event.id', async () => {
      const messageWithId = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'payment.succeeded',
          id: 'evt_custom_123',
          payload: { orderId: 'order-123' },
        })),
      };

      await consumeCallback(messageWithId);

      expect(mockRedis.exists).toHaveBeenCalledWith('event:processed:evt_custom_123');
    });

    it('should generate event ID from payload.id if event.id missing', async () => {
      const messageWithPayloadId = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'payment.succeeded',
          payload: { id: 'payload_123', orderId: 'order-123' },
        })),
      };

      await consumeCallback(messageWithPayloadId);

      expect(mockRedis.exists).toHaveBeenCalledWith('event:processed:payload_123');
    });

    it('should generate event ID from messageId if event.id and payload.id missing', async () => {
      const messageWithMessageId = {
        content: Buffer.from(JSON.stringify({
          type: 'payment.succeeded',
          payload: { orderId: 'order-123' },
        })),
        properties: { messageId: 'msg_456' },
      };

      await consumeCallback(messageWithMessageId);

      expect(mockRedis.exists).toHaveBeenCalledWith('event:processed:msg_456');
    });

    it('should generate fallback event ID with timestamp', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const messageWithNoId = {
        content: Buffer.from(JSON.stringify({
          type: 'payment.succeeded',
          payload: { orderId: 'order-123' },
        })),
        properties: {},
      };

      await consumeCallback(messageWithNoId);

      expect(mockRedis.exists).toHaveBeenCalledWith(
        `event:processed:payment.succeeded:order-123:${now}`
      );

      jest.restoreAllMocks();
    });
  });

  describe('payment.succeeded event', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should handle payment succeeded event', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'payment.succeeded',
          id: 'evt_123',
          payload: { orderId: 'order-123' },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Payment succeeded event received',
        { orderId: 'order-123' }
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });
  });

  describe('payment.failed event', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should handle payment failed event', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'payment.failed',
          id: 'evt_456',
          payload: { orderId: 'order-456' },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Payment failed event received',
        { orderId: 'order-456' }
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });
  });

  describe('dispute.created event', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should handle dispute created event', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.created',
          id: 'evt_dispute_123',
          payload: {
            disputeId: 'dp_123',
            paymentIntentId: 'pi_123',
            amount: 10000,
            currency: 'usd',
            reason: 'fraudulent',
            status: 'needs_response',
            evidenceDueBy: '2024-02-01T00:00:00Z',
            metadata: { orderId: 'order-123' },
          },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Dispute created event received',
        {
          disputeId: 'dp_123',
          paymentIntentId: 'pi_123',
        }
      );

      expect(mockDisputeService.handleDisputeCreated).toHaveBeenCalledWith({
        disputeId: 'dp_123',
        paymentIntentId: 'pi_123',
        amount: 10000,
        currency: 'usd',
        reason: 'fraudulent',
        status: 'needs_response',
        evidenceDueBy: new Date('2024-02-01T00:00:00Z'),
        metadata: { orderId: 'order-123' },
      });

      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });

    it('should handle dispute created event with defaults', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.created',
          id: 'evt_dispute_456',
          payload: {
            disputeId: 'dp_456',
            paymentIntentId: 'pi_456',
            amount: 5000,
            reason: 'product_not_received',
          },
        })),
      };

      await consumeCallback(message);

      expect(mockDisputeService.handleDisputeCreated).toHaveBeenCalledWith({
        disputeId: 'dp_456',
        paymentIntentId: 'pi_456',
        amount: 5000,
        currency: 'usd', // Default
        reason: 'product_not_received',
        status: 'needs_response', // Default
        evidenceDueBy: undefined,
        metadata: undefined,
      });
    });
  });

  describe('dispute.updated event', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should handle dispute updated event', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.updated',
          id: 'evt_dispute_update_123',
          payload: {
            disputeId: 'dp_123',
            paymentIntentId: 'pi_123',
            amount: 10000,
            currency: 'eur',
            reason: 'fraudulent',
            status: 'under_review',
            metadata: { note: 'Evidence submitted' },
          },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Dispute updated event received',
        {
          disputeId: 'dp_123',
          status: 'under_review',
        }
      );

      expect(mockDisputeService.handleDisputeUpdated).toHaveBeenCalledWith({
        disputeId: 'dp_123',
        paymentIntentId: 'pi_123',
        amount: 10000,
        currency: 'eur',
        reason: 'fraudulent',
        status: 'under_review',
        metadata: { note: 'Evidence submitted' },
      });

      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });
  });

  describe('dispute.closed event', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should handle dispute closed event with outcome', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.closed',
          id: 'evt_dispute_closed_123',
          payload: {
            disputeId: 'dp_123',
            paymentIntentId: 'pi_123',
            amount: 10000,
            currency: 'usd',
            reason: 'fraudulent',
            outcome: 'won',
            networkReasonCode: '4853',
            metadata: { result: 'favorable' },
          },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Dispute closed event received',
        {
          disputeId: 'dp_123',
          outcome: 'won',
        }
      );

      expect(mockDisputeService.handleDisputeClosed).toHaveBeenCalledWith(
        {
          disputeId: 'dp_123',
          paymentIntentId: 'pi_123',
          amount: 10000,
          currency: 'usd',
          reason: 'fraudulent',
          status: 'closed',
          metadata: { result: 'favorable' },
        },
        {
          status: 'won',
          networkReasonCode: '4853',
        }
      );

      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });

    it('should handle dispute closed event with default outcome', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.closed',
          id: 'evt_dispute_closed_456',
          payload: {
            disputeId: 'dp_456',
            paymentIntentId: 'pi_456',
            amount: 5000,
            reason: 'general',
          },
        })),
      };

      await consumeCallback(message);

      expect(mockDisputeService.handleDisputeClosed).toHaveBeenCalledWith(
        expect.objectContaining({
          disputeId: 'dp_456',
          status: 'closed',
        }),
        {
          status: 'lost', // Default
          networkReasonCode: undefined,
        }
      );
    });
  });

  describe('unhandled event types', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should log debug message for unhandled event types', async () => {
      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'unknown.event',
          id: 'evt_unknown',
          payload: {},
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Unhandled event type',
        { type: 'unknown.event' }
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });
  });

  describe('error handling', () => {
    let consumeCallback: Function;

    beforeEach(async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        consumeCallback = callback;
      });
      await subscriber.subscribeToPaymentEvents();
    });

    it('should nack message on processing error', async () => {
      const error = new Error('Processing failed');
      mockDisputeService.handleDisputeCreated.mockRejectedValue(error);

      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.created',
          id: 'evt_error',
          payload: {
            disputeId: 'dp_error',
            paymentIntentId: 'pi_error',
            amount: 1000,
            reason: 'test',
          },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process event',
        { error: 'Processing failed' }
      );
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects in catch block', async () => {
      mockDisputeService.handleDisputeCreated.mockRejectedValue('String error');

      const message = {
        ...mockMessage,
        content: Buffer.from(JSON.stringify({
          type: 'dispute.created',
          id: 'evt_string_error',
          payload: {
            disputeId: 'dp_error',
            paymentIntentId: 'pi_error',
            amount: 1000,
            reason: 'test',
          },
        })),
      };

      await consumeCallback(message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process event',
        { error: 'String error' }
      );
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should handle JSON parse errors', async () => {
      const invalidMessage = {
        content: Buffer.from('invalid json'),
        properties: { messageId: 'msg_invalid' },
      };

      await consumeCallback(invalidMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process event',
        expect.objectContaining({
          error: expect.stringContaining('JSON'),
        })
      );
      expect(mockChannel.nack).toHaveBeenCalledWith(invalidMessage, false, false);
    });
  });

  describe('eventSubscriber singleton', () => {
    it('should export a singleton instance', () => {
      expect(eventSubscriber).toBeInstanceOf(EventSubscriber);
    });

    it('should use the singleton instance', async () => {
      mockChannel.consume.mockImplementation((queue: string, callback: Function) => {
        // Don't execute callback
      });

      await eventSubscriber.subscribeToPaymentEvents();

      expect(mockGetChannel).toHaveBeenCalled();
      expect(mockChannel.consume).toHaveBeenCalled();
    });
  });
});
