/**
 * Unit Tests for Ticket Service Queue Listener
 *
 * PHASE 1 FIX: Tests the real RabbitMQ consumer implementation.
 */

// Mock modules before imports
jest.mock('amqplib', () => {
  const mockChannel = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'ticket-service.events' }),
    bindQueue: jest.fn().mockResolvedValue({}),
    prefetch: jest.fn().mockResolvedValue({}),
    consume: jest.fn(),
    cancel: jest.fn().mockResolvedValue({}),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
  };

  const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
    close: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
  };

  return {
    connect: jest.fn().mockResolvedValue(mockConnection),
    __mockChannel: mockChannel,
    __mockConnection: mockConnection,
  };
});

// Mock PaymentEventHandler
const mockHandlePaymentSucceeded = jest.fn().mockResolvedValue(undefined);
const mockHandlePaymentFailed = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/paymentEventHandler', () => ({
  PaymentEventHandler: {
    handlePaymentSucceeded: (...args: any[]) => mockHandlePaymentSucceeded(...args),
    handlePaymentFailed: (...args: any[]) => mockHandlePaymentFailed(...args),
  },
}));

jest.mock('../../src/config', () => ({
  config: {
    rabbitmq: {
      url: 'amqp://localhost:5672',
    },
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
  })),
}));

import { QueueListener } from '../../src/services/queueListener';

const amqplib = require('amqplib');
const mockChannel = amqplib.__mockChannel;
const mockConnection = amqplib.__mockConnection;

describe('Ticket Service Queue Listener', () => {
  let messageHandler: ((msg: any) => Promise<void>) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();

    // Capture the message handler when consume is called
    mockChannel.consume.mockImplementation(async (queue: string, handler: any) => {
      messageHandler = handler;
      return { consumerTag: 'test-consumer-tag' };
    });
  });

  afterEach(async () => {
    await QueueListener.stop();
    messageHandler = null;
  });

  describe('Connection', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await QueueListener.start();

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost:5672');
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert tickettoken_events exchange', async () => {
      await QueueListener.start();

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'tickettoken_events',
        'topic',
        { durable: true }
      );
    });

    it('should assert queue with DLQ binding', async () => {
      await QueueListener.start();

      // Should create DLQ first
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'ticket-service.events.dlq',
        expect.objectContaining({ durable: true })
      );

      // Then create main queue with DLQ reference
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'ticket-service.events',
        expect.objectContaining({
          durable: true,
          arguments: expect.objectContaining({
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': 'ticket-service.events.dlq',
          }),
        })
      );
    });

    it('should bind queue to exchange with routing keys', async () => {
      await QueueListener.start();

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'ticket-service.events',
        'tickettoken_events',
        'payment.completed'
      );
    });

    it('should start consuming messages', async () => {
      await QueueListener.start();

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'ticket-service.events',
        expect.any(Function)
      );
    });

    it('should report connected status correctly', async () => {
      expect(QueueListener.isConnected()).toBe(false);

      await QueueListener.start();

      expect(QueueListener.isConnected()).toBe(true);
    });
  });

  describe('Payment Events', () => {
    beforeEach(async () => {
      await QueueListener.start();
    });

    it('should handle payment.completed event', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-123',
            paymentId: 'payment-456',
          })
        ),
        fields: {
          routingKey: 'payment.completed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith('order-123', 'payment-456');
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });

    it('should handle payment.succeeded routing key', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-123',
            paymentId: 'payment-456',
          })
        ),
        fields: {
          routingKey: 'payment.succeeded',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith('order-123', 'payment-456');
    });

    it('should handle order.paid routing key', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-789',
            paymentId: 'payment-abc',
          })
        ),
        fields: {
          routingKey: 'order.paid',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith('order-789', 'payment-abc');
    });

    it('should handle payment.failed event', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-123',
            reason: 'Card declined',
          })
        ),
        fields: {
          routingKey: 'payment.failed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockHandlePaymentFailed).toHaveBeenCalledWith('order-123', 'Card declined');
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });

    it('should handle alternative field names (order_id, payment_id)', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            order_id: 'order-underscore',
            payment_id: 'payment-underscore',
          })
        ),
        fields: {
          routingKey: 'payment.completed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith(
        'order-underscore',
        'payment-underscore'
      );
    });

    it('should handle nested payload format', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            payload: {
              orderId: 'order-nested',
              paymentId: 'payment-nested',
            },
          })
        ),
        fields: {
          routingKey: 'payment.completed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith('order-nested', 'payment-nested');
    });
  });

  describe('Order Events', () => {
    beforeEach(async () => {
      await QueueListener.start();
    });

    it('should handle order.created event (informational)', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-new',
            eventId: 'event-123',
            userId: 'user-456',
          })
        ),
        fields: {
          routingKey: 'order.created',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      // Should ack but not process further (informational)
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });

    it('should handle order.cancelled event', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-cancelled',
          })
        ),
        fields: {
          routingKey: 'order.cancelled',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await QueueListener.start();
    });

    it('should nack on missing orderId', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            // Missing orderId
            paymentId: 'payment-123',
          })
        ),
        fields: {
          routingKey: 'payment.completed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      // Should nack without requeue (goes to DLQ)
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should nack on handler error', async () => {
      mockHandlePaymentSucceeded.mockRejectedValueOnce(new Error('Database error'));

      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-error',
            paymentId: 'payment-error',
          })
        ),
        fields: {
          routingKey: 'payment.completed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should handle null message gracefully', async () => {
      await messageHandler!(null);

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', async () => {
      const message = {
        content: Buffer.from('not valid json'),
        fields: {
          routingKey: 'payment.completed',
          exchange: 'tickettoken_events',
        },
      };

      await messageHandler!(message);

      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });
  });

  describe('Webhook Mode (Backwards Compatibility)', () => {
    it('should process payment success via webhook method', async () => {
      await QueueListener.processPaymentSuccess('order-webhook', 'payment-webhook');

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith('order-webhook', 'payment-webhook');
    });

    it('should process payment failure via webhook method', async () => {
      await QueueListener.processPaymentFailure('order-webhook', 'Insufficient funds');

      expect(mockHandlePaymentFailed).toHaveBeenCalledWith('order-webhook', 'Insufficient funds');
    });
  });

  describe('Shutdown', () => {
    it('should cancel consumer on stop', async () => {
      await QueueListener.start();

      await QueueListener.stop();

      expect(mockChannel.cancel).toHaveBeenCalledWith('test-consumer-tag');
    });

    it('should close channel and connection on stop', async () => {
      await QueueListener.start();

      await QueueListener.stop();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should report disconnected after stop', async () => {
      await QueueListener.start();
      expect(QueueListener.isConnected()).toBe(true);

      await QueueListener.stop();

      expect(QueueListener.isConnected()).toBe(false);
    });
  });
});
