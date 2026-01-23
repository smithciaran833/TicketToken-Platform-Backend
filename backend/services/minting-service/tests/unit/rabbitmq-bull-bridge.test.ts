/**
 * Unit Tests for Minting Service RabbitMQ-Bull Bridge
 *
 * PHASE 1 FIX: Tests the RabbitMQ consumer that bridges to Bull queue.
 */

// Mock modules before imports
jest.mock('amqplib', () => {
  const mockChannel = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'ticket.mint' }),
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

jest.mock('../../src/queues/mintQueue', () => ({
  addMintJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  checkQueueLimits: jest.fn().mockResolvedValue({
    canAccept: true,
    currentSize: 0,
    maxSize: 10000,
    highWaterMark: 5000,
  }),
}));

jest.mock('../../src/utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    createChildLogger: jest.fn().mockReturnValue(mockLogger),
    sanitize: jest.fn((obj) => obj),
    wouldRedact: jest.fn().mockReturnValue(false),
    addSensitiveField: jest.fn(),
  };
});

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
  })),
}));

import {
  rabbitmqConsumer,
  initializeRabbitMQConsumer,
  shutdownRabbitMQConsumer,
} from '../../src/config/rabbitmq';
import { addMintJob } from '../../src/queues/mintQueue';

const amqplib = require('amqplib');
const mockChannel = amqplib.__mockChannel;
const mockConnection = amqplib.__mockConnection;

describe('Minting Service RabbitMQ-Bull Bridge', () => {
  let messageHandler: ((msg: any) => Promise<void>) | null = null;
  let mintSuccessHandler: ((msg: any) => Promise<void>) | null = null;
  let consumerTagCounter = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    consumerTagCounter = 0;

    // Capture the message handler when consume is called based on queue name
    mockChannel.consume.mockImplementation(async (queue: string, handler: any) => {
      consumerTagCounter++;
      if (queue === 'ticket.mint') {
        messageHandler = handler;
      } else if (queue === 'minting.mint-success') {
        mintSuccessHandler = handler;
      }
      return { consumerTag: `test-consumer-tag-${consumerTagCounter}` };
    });
  });

  afterEach(async () => {
    try {
      await shutdownRabbitMQConsumer();
    } catch (e) {
      // Ignore cleanup errors in tests
    }
    messageHandler = null;
    mintSuccessHandler = null;
  });

  describe('Connection', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await initializeRabbitMQConsumer();

      expect(amqplib.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert ticket.mint queue', async () => {
      await initializeRabbitMQConsumer();

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'ticket.mint',
        expect.objectContaining({ durable: true })
      );
    });

    it('should bind queue to events exchange', async () => {
      await initializeRabbitMQConsumer();

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'ticket.mint',
        'events',
        expect.any(String)
      );
    });

    it('should start consuming from the queue', async () => {
      await initializeRabbitMQConsumer();

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'ticket.mint',
        expect.any(Function)
      );
    });

    it('should report connected status correctly', async () => {
      expect(rabbitmqConsumer.isConnected()).toBe(false);

      await initializeRabbitMQConsumer();

      expect(rabbitmqConsumer.isConnected()).toBe(true);
    });
  });

  describe('Message Processing', () => {
    beforeEach(async () => {
      await initializeRabbitMQConsumer();
    });

    it('should bridge RabbitMQ message to Bull queue', async () => {
      expect(messageHandler).toBeTruthy();

      const message = {
        content: Buffer.from(
          JSON.stringify({
            ticketId: 'ticket-123',
            tenantId: 'tenant-456',
            orderId: 'order-789',
            eventId: 'event-abc',
          })
        ),
        fields: {
          routingKey: 'ticket.mint',
        },
      };

      await messageHandler!(message);

      expect(addMintJob).toHaveBeenCalledWith({
        ticketId: 'ticket-123',
        tenantId: 'tenant-456',
        orderId: 'order-789',
        eventId: 'event-abc',
        userId: undefined,
        metadata: undefined,
      });
    });

    it('should acknowledge message after successful Bull job creation', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            ticketId: 'ticket-123',
            tenantId: 'tenant-456',
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(message);

      expect(mockChannel.ack).toHaveBeenCalledWith(message);
    });

    it('should handle blockchain-service message format (orderId)', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 'order-123',
            eventId: 'event-456',
            userId: 'user-789',
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(message);

      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          eventId: 'event-456',
          userId: 'user-789',
        })
      );
    });

    it('should handle wrapped payload format', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            payload: {
              ticketId: 'ticket-wrapped',
              tenantId: 'tenant-wrapped',
            },
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(message);

      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-wrapped',
          tenantId: 'tenant-wrapped',
        })
      );
    });

    it('should handle nested data format', async () => {
      const message = {
        content: Buffer.from(
          JSON.stringify({
            data: {
              ticketId: 'ticket-nested',
              tenantId: 'tenant-nested',
            },
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(message);

      expect(addMintJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-nested',
          tenantId: 'tenant-nested',
        })
      );
    });

    it('should ack invalid messages to prevent requeue loops', async () => {
      const invalidMessage = {
        content: Buffer.from(
          JSON.stringify({
            // Missing required fields
            someUnknownField: 'value',
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(invalidMessage);

      // Should ack invalid messages (not nack) to prevent infinite requeue
      expect(mockChannel.ack).toHaveBeenCalled();
      expect(addMintJob).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await initializeRabbitMQConsumer();
    });

    it('should nack with requeue on queue capacity exceeded', async () => {
      (addMintJob as jest.Mock).mockRejectedValueOnce(
        new Error('Queue capacity exceeded: Queue at maximum capacity')
      );

      const message = {
        content: Buffer.from(
          JSON.stringify({
            ticketId: 'ticket-123',
            tenantId: 'tenant-456',
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(message);

      // Should nack with requeue=true for capacity issues
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('should nack without requeue on other errors', async () => {
      (addMintJob as jest.Mock).mockRejectedValueOnce(new Error('Some other error'));

      const message = {
        content: Buffer.from(
          JSON.stringify({
            ticketId: 'ticket-123',
            tenantId: 'tenant-456',
          })
        ),
        fields: { routingKey: 'ticket.mint' },
      };

      await messageHandler!(message);

      // Should nack with requeue=false for other errors (goes to DLQ)
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should handle null message gracefully', async () => {
      // Should not throw
      await messageHandler!(null);

      expect(addMintJob).not.toHaveBeenCalled();
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });
  });

  describe('Shutdown', () => {
    it('should cancel consumers on shutdown', async () => {
      await initializeRabbitMQConsumer();

      await shutdownRabbitMQConsumer();

      // Multiple consumers are created (main queue, alternative queues, mint.success queue)
      // Verify at least the main consumer tag was cancelled
      expect(mockChannel.cancel).toHaveBeenCalled();
      expect(mockChannel.cancel.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should close channel and connection on shutdown', async () => {
      await initializeRabbitMQConsumer();

      await shutdownRabbitMQConsumer();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should report disconnected after shutdown', async () => {
      await initializeRabbitMQConsumer();
      expect(rabbitmqConsumer.isConnected()).toBe(true);

      await shutdownRabbitMQConsumer();

      expect(rabbitmqConsumer.isConnected()).toBe(false);
    });
  });
});
