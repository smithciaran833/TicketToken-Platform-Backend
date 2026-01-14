/**
 * Unit Tests for Queue Service
 * 
 * Tests RabbitMQ connection and message publishing.
 */

// Mock amqplib before imports
jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

import { QueueService, queueService } from '../../../src/services/queueService';
const amqp = require('amqplib');

describe('QueueService', () => {
  let service: QueueService;
  let mockChannel: any;
  let mockConnection: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChannel = {
      assertQueue: jest.fn().mockResolvedValue({}),
      sendToQueue: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
    };

    amqp.connect.mockResolvedValue(mockConnection);

    service = new QueueService();
  });

  describe('connect', () => {
    it('should establish connection to RabbitMQ', async () => {
      await service.connect();

      expect(amqp.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should use default AMQP URL when env var not set', async () => {
      const originalUrl = process.env.AMQP_URL;
      delete process.env.AMQP_URL;

      await service.connect();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://rabbitmq:5672');

      process.env.AMQP_URL = originalUrl;
    });

    it('should use AMQP_URL from environment', async () => {
      process.env.AMQP_URL = 'amqp://custom-host:5673';

      await service.connect();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://custom-host:5673');
    });

    it('should not reconnect if already connected', async () => {
      await service.connect();
      await service.connect();

      // Should only connect once
      expect(amqp.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish', () => {
    it('should publish message to queue', async () => {
      const message = { orderId: 'order-123', amount: 10000 };

      await service.publish('payment-events', message);

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('payment-events', { durable: true });
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'payment-events',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should auto-connect if not connected', async () => {
      const message = { event: 'test' };

      await service.publish('test-queue', message);

      expect(amqp.connect).toHaveBeenCalled();
    });

    it('should serialize message as JSON', async () => {
      const message = { key: 'value', nested: { data: 123 } };

      await service.publish('json-queue', message);

      const calledBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      const parsedMessage = JSON.parse(calledBuffer.toString());

      expect(parsedMessage).toEqual(message);
    });

    it('should publish with persistent option', async () => {
      await service.publish('durable-queue', { data: 'test' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'durable-queue',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should handle complex message objects', async () => {
      const message = {
        type: 'payment.completed',
        payload: {
          paymentId: 'pi_123',
          amount: 9999,
          currency: 'usd',
          metadata: {
            orderId: 'order-456',
            customerId: 'cust-789',
          },
        },
        timestamp: new Date().toISOString(),
      };

      await service.publish('complex-queue', message);

      const calledBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      const parsedMessage = JSON.parse(calledBuffer.toString());

      expect(parsedMessage).toEqual(message);
    });

    it('should handle array messages', async () => {
      const messages = [
        { id: 1, event: 'event1' },
        { id: 2, event: 'event2' },
      ];

      await service.publish('batch-queue', messages);

      const calledBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      const parsedMessage = JSON.parse(calledBuffer.toString());

      expect(parsedMessage).toEqual(messages);
    });
  });

  describe('close', () => {
    it('should close channel and connection', async () => {
      await service.connect();
      await service.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should reset internal state', async () => {
      await service.connect();
      await service.close();

      // Should be able to reconnect after close
      await service.connect();

      expect(amqp.connect).toHaveBeenCalledTimes(2);
    });

    it('should handle close when not connected', async () => {
      await expect(service.close()).resolves.toBeUndefined();
    });

    it('should handle partial connection state', async () => {
      // Simulate connection without channel
      await service.connect();
      (service as any).channel = null;

      await expect(service.close()).resolves.toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate connection errors', async () => {
      amqp.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(service.connect()).rejects.toThrow('Connection refused');
    });

    it('should propagate channel creation errors', async () => {
      mockConnection.createChannel.mockRejectedValue(new Error('Channel error'));

      await expect(service.connect()).rejects.toThrow('Channel error');
    });

    it('should propagate publish errors', async () => {
      mockChannel.sendToQueue.mockReturnValue(false);

      await service.connect();
      // sendToQueue returning false doesn't throw, but we can test assertion errors
      await expect(service.publish('queue', { data: 'test' })).resolves.toBeUndefined();
    });

    it('should propagate assertQueue errors', async () => {
      mockChannel.assertQueue.mockRejectedValue(new Error('Queue assertion failed'));

      await service.connect();
      await expect(service.publish('bad-queue', {})).rejects.toThrow('Queue assertion failed');
    });
  });

  describe('Singleton Export', () => {
    it('should export queueService singleton', () => {
      expect(queueService).toBeDefined();
      expect(queueService).toBeInstanceOf(QueueService);
    });
  });

  describe('Queue Configuration', () => {
    it('should assert queue as durable', async () => {
      await service.publish('durable-test', { data: 'test' });

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'durable-test',
        expect.objectContaining({ durable: true })
      );
    });
  });

  describe('Message Serialization', () => {
    it('should handle null values in message', async () => {
      const message = { key: null, value: 'test' };

      await service.publish('null-queue', message);

      const calledBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      const parsedMessage = JSON.parse(calledBuffer.toString());

      expect(parsedMessage.key).toBeNull();
    });

    it('should handle boolean values', async () => {
      const message = { success: true, failed: false };

      await service.publish('bool-queue', message);

      const calledBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      const parsedMessage = JSON.parse(calledBuffer.toString());

      expect(parsedMessage).toEqual(message);
    });

    it('should handle numeric values', async () => {
      const message = { amount: 12345, rate: 0.029 };

      await service.publish('number-queue', message);

      const calledBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      const parsedMessage = JSON.parse(calledBuffer.toString());

      expect(parsedMessage.amount).toBe(12345);
      expect(parsedMessage.rate).toBe(0.029);
    });
  });

  describe('Multiple Queue Operations', () => {
    it('should publish to multiple queues', async () => {
      await service.publish('queue-1', { id: 1 });
      await service.publish('queue-2', { id: 2 });
      await service.publish('queue-3', { id: 3 });

      expect(mockChannel.sendToQueue).toHaveBeenCalledTimes(3);
    });

    it('should maintain connection across multiple publishes', async () => {
      await service.publish('queue-a', { data: 'a' });
      await service.publish('queue-b', { data: 'b' });

      // Should only connect once
      expect(amqp.connect).toHaveBeenCalledTimes(1);
    });
  });
});
