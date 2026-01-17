// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/rabbitmq.ts
 */

jest.mock('amqplib');
jest.mock('@tickettoken/shared', () => ({
  QUEUES: {
    SEARCH_SYNC: 'search.sync.queue'
  }
}));

describe('src/config/rabbitmq.ts - Comprehensive Unit Tests', () => {
  let amqp: any;
  let mockConnection: any;
  let mockChannel: any;
  const originalEnv = process.env;
  const originalConsole = console;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    console.log = jest.fn();
    console.error = jest.fn();

    // Mock channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'search.sync.queue' }),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'test-consumer' }),
      ack: jest.fn(),
      nack: jest.fn()
    };

    // Mock connection
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel)
    };

    // Mock amqplib
    amqp = require('amqplib');
    amqp.connect = jest.fn().mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsole.log;
    console.error = originalConsole.error;
  });

  // =============================================================================
  // connectRabbitMQ() - Connection
  // =============================================================================

  describe('connectRabbitMQ() - Connection', () => {
    it('should connect to RabbitMQ with default URL', async () => {
      delete process.env.RABBITMQ_URL;
      delete process.env.AMQP_URL;

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://admin:admin@rabbitmq:5672');
    });

    it('should use RABBITMQ_URL when set', async () => {
      process.env.RABBITMQ_URL = 'amqp://custom:5672';

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://custom:5672');
    });

    it('should use AMQP_URL as fallback', async () => {
      delete process.env.RABBITMQ_URL;
      process.env.AMQP_URL = 'amqp://fallback:5672';

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://fallback:5672');
    });

    it('should prefer RABBITMQ_URL over AMQP_URL', async () => {
      process.env.RABBITMQ_URL = 'amqp://primary:5672';
      process.env.AMQP_URL = 'amqp://fallback:5672';

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://primary:5672');
    });

    it('should create channel', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should log success message', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(console.log).toHaveBeenCalledWith('RabbitMQ connected');
    });
  });

  // =============================================================================
  // connectRabbitMQ() - Exchange Setup
  // =============================================================================

  describe('connectRabbitMQ() - Exchange Setup', () => {
    it('should assert exchange', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'search.sync',
        'topic',
        { durable: true }
      );
    });

    it('should use topic exchange type', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      const call = mockChannel.assertExchange.mock.calls[0];
      expect(call[1]).toBe('topic');
    });

    it('should make exchange durable', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      const call = mockChannel.assertExchange.mock.calls[0];
      expect(call[2].durable).toBe(true);
    });
  });

  // =============================================================================
  // connectRabbitMQ() - Queue Setup
  // =============================================================================

  describe('connectRabbitMQ() - Queue Setup', () => {
    it('should assert queue', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'search.sync.queue',
        { durable: true }
      );
    });

    it('should make queue durable', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      const call = mockChannel.assertQueue.mock.calls[0];
      expect(call[1].durable).toBe(true);
    });

    it('should bind queue to exchange', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'search.sync.queue',
        'search.sync',
        '#'
      );
    });

    it('should bind with wildcard routing key', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      const call = mockChannel.bindQueue.mock.calls[0];
      expect(call[2]).toBe('#');
    });
  });

  // =============================================================================
  // connectRabbitMQ() - Consumer Setup
  // =============================================================================

  describe('connectRabbitMQ() - Consumer Setup', () => {
    it('should start consuming messages', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'search.sync.queue',
        expect.any(Function)
      );
    });

    it('should process message and ack', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      const consumer = mockChannel.consume.mock.calls[0][1];
      const mockMsg = {
        content: Buffer.from('test message')
      };

      await consumer(mockMsg);

      expect(console.log).toHaveBeenCalledWith('Processing message:', 'test message');
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('should nack on processing error', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      // Override console.log to throw
      const originalLog = console.log;
      console.log = jest.fn().mockImplementation(() => {
        throw new Error('Processing failed');
      });

      const consumer = mockChannel.consume.mock.calls[0][1];
      const mockMsg = {
        content: Buffer.from('test message')
      };

      await consumer(mockMsg);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);

      console.log = originalLog;
    });

    it('should handle null message', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      const consumer = mockChannel.consume.mock.calls[0][1];

      await expect(consumer(null)).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // connectRabbitMQ() - Error Handling
  // =============================================================================

  describe('connectRabbitMQ() - Error Handling', () => {
    it('should log error on connection failure', async () => {
      const error = new Error('Connection failed');
      amqp.connect.mockRejectedValueOnce(error);

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(console.error).toHaveBeenCalledWith('RabbitMQ connection failed:', error);
    });

    it('should retry after 5 seconds on failure', async () => {
      amqp.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

      setTimeoutSpy.mockRestore();
    });

    it('should not log success on failure', async () => {
      amqp.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      await connectRabbitMQ();

      expect(console.log).not.toHaveBeenCalledWith('RabbitMQ connected');
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export connectRabbitMQ function', () => {
      const module = require('../../../src/config/rabbitmq');

      expect(module.connectRabbitMQ).toBeDefined();
      expect(typeof module.connectRabbitMQ).toBe('function');
    });

    it('should export channel after connection', async () => {
      const module = require('../../../src/config/rabbitmq');
      
      // Channel is undefined before connection
      expect(module.channel).toBeUndefined();

      // Connect
      await module.connectRabbitMQ();

      // Channel should now be defined
      expect(module.channel).toBeDefined();
    });
  });
});
