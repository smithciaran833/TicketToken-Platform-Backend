// =============================================================================
// MOCKS
// =============================================================================

const mockChannel = {
  assertQueue: jest.fn(),
  sendToQueue: jest.fn(),
  close: jest.fn(),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn(),
};

const mockAmqp = {
  connect: jest.fn().mockResolvedValue(mockConnection),
};

jest.mock('amqplib', () => mockAmqp);

// =============================================================================
// TEST SUITE
// =============================================================================

import { QueueService, queueService } from '../../../src/services/queueService';

describe('QueueService', () => {
  let service: QueueService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    service = new QueueService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // connect() - 5 test cases
  // ===========================================================================

  describe('connect()', () => {
    it('should connect to RabbitMQ with default URL', async () => {
      delete process.env.AMQP_URL;

      await service.connect();

      expect(mockAmqp.connect).toHaveBeenCalledWith('amqp://rabbitmq:5672');
    });

    it('should connect to RabbitMQ with env var URL', async () => {
      process.env.AMQP_URL = 'amqp://custom-host:5673';

      await service.connect();

      expect(mockAmqp.connect).toHaveBeenCalledWith('amqp://custom-host:5673');
    });

    it('should create channel after connection', async () => {
      await service.connect();

      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      await service.connect();
      await service.connect();

      expect(mockAmqp.connect).toHaveBeenCalledTimes(1);
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);
    });

    it('should store connection and channel', async () => {
      await service.connect();

      expect((service as any).connection).toBe(mockConnection);
      expect((service as any).channel).toBe(mockChannel);
    });
  });

  // ===========================================================================
  // publish() - 8 test cases
  // ===========================================================================

  describe('publish()', () => {
    it('should connect if not already connected', async () => {
      await service.publish('test-queue', { data: 'test' });

      expect(mockAmqp.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert queue with durable option', async () => {
      await service.publish('payment-queue', { id: 123 });

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('payment-queue', { durable: true });
    });

    it('should serialize message to JSON', async () => {
      const message = { userId: 'user-123', amount: 100 };

      await service.publish('order-queue', message);

      const expectedBuffer = Buffer.from(JSON.stringify(message));
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'order-queue',
        expectedBuffer,
        { persistent: true }
      );
    });

    it('should send message with persistent flag', async () => {
      await service.publish('test-queue', { data: 'test' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should handle complex message objects', async () => {
      const complexMessage = {
        id: 'order-123',
        items: [{ id: 1 }, { id: 2 }],
        metadata: { timestamp: Date.now() },
      };

      await service.publish('complex-queue', complexMessage);

      expect(mockChannel.sendToQueue).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      await service.connect();
      mockAmqp.connect.mockClear();

      await service.publish('test-queue', { data: 'test' });

      expect(mockAmqp.connect).not.toHaveBeenCalled();
    });

    it('should publish to correct queue', async () => {
      await service.publish('specific-queue', { test: 'data' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'specific-queue',
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should handle publishing multiple messages', async () => {
      await service.publish('queue-1', { msg: 1 });
      await service.publish('queue-2', { msg: 2 });

      expect(mockChannel.sendToQueue).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // close() - 5 test cases
  // ===========================================================================

  describe('close()', () => {
    it('should close channel and connection', async () => {
      await service.connect();
      await service.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should set channel to null after close', async () => {
      await service.connect();
      await service.close();

      expect((service as any).channel).toBeNull();
    });

    it('should set connection to null after close', async () => {
      await service.connect();
      await service.close();

      expect((service as any).connection).toBeNull();
    });

    it('should handle close when not connected', async () => {
      await expect(service.close()).resolves.not.toThrow();

      expect(mockChannel.close).not.toHaveBeenCalled();
      expect(mockConnection.close).not.toHaveBeenCalled();
    });

    it('should allow reconnection after close', async () => {
      await service.connect();
      await service.close();

      mockAmqp.connect.mockClear();
      await service.connect();

      expect(mockAmqp.connect).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Exported Instance - 2 test cases
  // ===========================================================================

  describe('Exported Instance', () => {
    it('should export queueService instance', () => {
      expect(queueService).toBeInstanceOf(QueueService);
    });

    it('should be a singleton instance', () => {
      const { queueService: instance1 } = require('../../../src/services/queueService');
      const { queueService: instance2 } = require('../../../src/services/queueService');

      expect(instance1).toBe(instance2);
    });
  });
});
