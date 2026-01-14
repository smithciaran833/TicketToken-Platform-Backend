/**
 * Unit Tests for src/services/queueService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    rabbitmq: {
      url: 'amqp://localhost:5672',
      queues: {
        nftMinting: 'nft-minting',
        ticketEvents: 'ticket-events',
      },
    },
  },
}));

const mockChannel = {
  assertQueue: jest.fn().mockResolvedValue({}),
  sendToQueue: jest.fn().mockReturnValue(true),
  prefetch: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue({}),
  ack: jest.fn(),
  nack: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection),
}));

import { QueueService } from '../../../src/services/queueService';

describe('services/queueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize()', () => {
    it('connects to RabbitMQ', async () => {
      const amqplib = require('amqplib');

      await QueueService.initialize();

      expect(amqplib.connect).toHaveBeenCalled();
    });

    it('creates publish and consume channels', async () => {
      await QueueService.initialize();

      expect(mockConnection.createChannel).toHaveBeenCalledTimes(2);
    });

    it('sets up queues with DLQ', async () => {
      await QueueService.initialize();

      // Should create DLQ for each queue
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        expect.stringContaining('.dlq'),
        expect.objectContaining({ durable: true })
      );
    });

    it('registers connection event handlers', async () => {
      await QueueService.initialize();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('publish()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
    });

    it('sends message to queue', async () => {
      const message = { type: 'test', data: { id: 1 } };

      await QueueService.publish('test-queue', message);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('serializes message to JSON buffer', async () => {
      const message = { type: 'test', data: { id: 1 } };

      await QueueService.publish('test-queue', message);

      const callArgs = mockChannel.sendToQueue.mock.calls[0];
      const buffer = callArgs[1];
      const parsed = JSON.parse(buffer.toString());

      expect(parsed).toEqual(message);
    });

    it('throws when buffer is full', async () => {
      mockChannel.sendToQueue.mockReturnValueOnce(false);

      await expect(
        QueueService.publish('test-queue', { data: 'test' })
      ).rejects.toThrow('Queue buffer full');
    });
  });

  describe('consume()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
    });

    it('sets prefetch to 1', async () => {
      await QueueService.consume('test-queue', async () => {});

      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
    });

    it('registers consumer on queue', async () => {
      const handler = jest.fn();

      await QueueService.consume('test-queue', handler);

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Function)
      );
    });

    it('acks message on successful processing', async () => {
      let messageHandler: Function;
      mockChannel.consume.mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({});
      });

      const handler = jest.fn().mockResolvedValue(undefined);
      await QueueService.consume('test-queue', handler);

      // Simulate message arrival
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ data: 'test' })),
        properties: { messageId: 'msg-1' },
        fields: { deliveryTag: 1 },
      };

      await messageHandler!(mockMsg);

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('nacks message after max retries', async () => {
      let messageHandler: Function;
      mockChannel.consume.mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({});
      });

      const handler = jest.fn().mockRejectedValue(new Error('Processing failed'));
      await QueueService.consume('test-queue', handler);

      const mockMsg = {
        content: Buffer.from(JSON.stringify({ data: 'test' })),
        properties: { messageId: 'retry-test-msg' },
        fields: { deliveryTag: 1 },
      };

      // Simulate multiple failures (3 retries = max)
      for (let i = 0; i < 3; i++) {
        await messageHandler!(mockMsg);
      }

      // After 3 retries, should nack without requeue (send to DLQ)
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    });
  });

  describe('consumeDLQ()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
    });

    it('consumes from DLQ queue', async () => {
      await QueueService.consumeDLQ('test-queue', async () => {});

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue.dlq',
        expect.any(Function)
      );
    });
  });

  describe('close()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
    });

    it('closes channels and connection', async () => {
      await QueueService.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('isConnected()', () => {
    it('returns true when connected', async () => {
      await QueueService.initialize();

      expect(QueueService.isConnected()).toBe(true);
    });
  });

  describe('publishTenantScoped()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
    });

    it('publishes to tenant-specific queue', async () => {
      await QueueService.publishTenantScoped('events', 'tenant-123', { type: 'test' });

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'events.tenant.tenant-123',
        { durable: true }
      );

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'events.tenant.tenant-123',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('adds tenant metadata to message', async () => {
      await QueueService.publishTenantScoped('events', 'tenant-123', { type: 'test' });

      const callArgs = mockChannel.sendToQueue.mock.calls[0];
      const buffer = callArgs[1];
      const parsed = JSON.parse(buffer.toString());

      expect(parsed._meta.tenantId).toBe('tenant-123');
      expect(parsed._meta.publishedAt).toBeDefined();
    });
  });

  describe('consumeTenantScoped()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
    });

    it('consumes from tenant-specific queue', async () => {
      await QueueService.consumeTenantScoped('events', 'tenant-123', async () => {});

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'events.tenant.tenant-123',
        expect.any(Function)
      );
    });
  });
});
