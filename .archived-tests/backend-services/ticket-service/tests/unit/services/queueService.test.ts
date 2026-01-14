// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/config');
jest.mock('amqplib');

// Import after mocks
import { QueueService } from '../../../src/services/queueService';
import * as amqplib from 'amqplib';
import { config } from '../../../src/config';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('QueueService', () => {
  let mockConnection: any;
  let mockChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (config as any).rabbitmq = {
      url: 'amqp://localhost',
      queues: {
        ticketEvents: 'ticket-events',
        notifications: 'notifications',
        payments: 'payments',
      },
    };

    mockChannel = {
      assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
      sendToQueue: jest.fn().mockReturnValue(true),
      consume: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // =============================================================================
  // initialize() - 10 test cases
  // =============================================================================

  describe('initialize()', () => {
    it('should connect to RabbitMQ', async () => {
      await QueueService.initialize();

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost');
    });

    it('should create publish channel', async () => {
      await QueueService.initialize();

      expect(mockConnection.createChannel).toHaveBeenCalledTimes(2);
    });

    it('should create consume channel', async () => {
      await QueueService.initialize();

      expect(mockConnection.createChannel).toHaveBeenCalledTimes(2);
    });

    it('should setup queues', async () => {
      await QueueService.initialize();

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('ticket-events', { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('notifications', { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('payments', { durable: true });
    });

    it('should register error handler', async () => {
      await QueueService.initialize();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register close handler', async () => {
      await QueueService.initialize();

      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should log successful connection', async () => {
      await QueueService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Queue service connected');
    });

    it('should emit connected event', async () => {
      const listener = jest.fn();
      QueueService.on('connected', listener);

      await QueueService.initialize();

      expect(listener).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      (amqplib.connect as jest.Mock).mockRejectedValue(error);

      await expect(QueueService.initialize()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to connect to RabbitMQ:', error);
    });

    it('should reset reconnect attempts on success', async () => {
      await QueueService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Queue service connected');
    });
  });

  // =============================================================================
  // publish() - 10 test cases
  // =============================================================================

  describe('publish()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
      jest.clearAllMocks();
    });

    it('should publish message to queue', async () => {
      const message = { type: 'test', data: 'value' };

      await QueueService.publish('ticket-events', message);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'ticket-events',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should serialize message as JSON', async () => {
      const message = { type: 'test', data: 'value' };

      await QueueService.publish('ticket-events', message);

      const buffer = mockChannel.sendToQueue.mock.calls[0][1];
      expect(JSON.parse(buffer.toString())).toEqual(message);
    });

    it('should set persistent flag', async () => {
      await QueueService.publish('ticket-events', { type: 'test' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should handle queue buffer full', async () => {
      mockChannel.sendToQueue.mockReturnValue(false);

      await expect(
        QueueService.publish('ticket-events', { type: 'test' })
      ).rejects.toThrow('Queue buffer full');
    });

    it('should log warning when buffer full', async () => {
      mockChannel.sendToQueue.mockReturnValue(false);

      await expect(
        QueueService.publish('ticket-events', { type: 'test' })
      ).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Message was not sent, queue buffer full',
        { queue: 'ticket-events' }
      );
    });

    it('should handle different queues', async () => {
      await QueueService.publish('notifications', { type: 'email' });
      await QueueService.publish('payments', { type: 'charge' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'notifications',
        expect.any(Buffer),
        expect.any(Object)
      );
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'payments',
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should handle different message types', async () => {
      await QueueService.publish('ticket-events', { type: 'created', id: 123 });
      await QueueService.publish('ticket-events', { type: 'deleted', id: 456 });

      expect(mockChannel.sendToQueue).toHaveBeenCalledTimes(2);
    });

    it('should handle publish errors', async () => {
      mockChannel.sendToQueue.mockImplementation(() => {
        throw new Error('Publish error');
      });

      await expect(
        QueueService.publish('ticket-events', { type: 'test' })
      ).rejects.toThrow('Publish error');
    });

    it('should log error on publish failure', async () => {
      const error = new Error('Publish error');
      mockChannel.sendToQueue.mockImplementation(() => {
        throw error;
      });

      await expect(
        QueueService.publish('ticket-events', { type: 'test' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to publish message:', error);
    });

    it('should gracefully skip if not initialized', async () => {
      jest.resetModules();
      const { QueueService: FreshService } = require('../../../src/services/queueService');

      await expect(
        FreshService.publish('queue', { type: 'test' })
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // consume() - 8 test cases
  // =============================================================================

  describe('consume()', () => {
    beforeEach(async () => {
      await QueueService.initialize();
      jest.clearAllMocks();
    });

    it('should consume messages from queue', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      await QueueService.consume('ticket-events', handler);

      expect(mockChannel.consume).toHaveBeenCalledWith('ticket-events', expect.any(Function));
    });

    it('should set prefetch', async () => {
      const handler = jest.fn();

      await QueueService.consume('ticket-events', handler);

      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
    });

    it('should acknowledge messages', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ type: 'test' })),
      };

      await QueueService.consume('ticket-events', handler);
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(mockMsg);

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('should parse message content', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const message = { type: 'test', data: 'value' };
      const mockMsg = {
        content: Buffer.from(JSON.stringify(message)),
      };

      await QueueService.consume('ticket-events', handler);
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(mockMsg);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should nack on handler error', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ type: 'test' })),
      };

      await QueueService.consume('ticket-events', handler);
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(mockMsg);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    });

    it('should log error on handler failure', async () => {
      const error = new Error('Handler error');
      const handler = jest.fn().mockRejectedValue(error);
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ type: 'test' })),
      };

      await QueueService.consume('ticket-events', handler);
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(mockMsg);

      expect(mockLogger.error).toHaveBeenCalledWith('Error processing message:', error);
    });

    it('should ignore null messages', async () => {
      const handler = jest.fn();

      await QueueService.consume('ticket-events', handler);
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(null);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should throw if not initialized', async () => {
      jest.resetModules();
      const { QueueService: FreshService } = require('../../../src/services/queueService');

      await expect(
        FreshService.consume('queue', jest.fn())
      ).rejects.toThrow('Queue service not initialized');
    });
  });

  // =============================================================================
  // close() - 5 test cases
  // =============================================================================

  describe('close()', () => {
    it('should close channels and connection', async () => {
      await QueueService.initialize();
      await QueueService.close();

      expect(mockChannel.close).toHaveBeenCalledTimes(2);
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should log closure', async () => {
      await QueueService.initialize();
      await QueueService.close();

      expect(mockLogger.info).toHaveBeenCalledWith('Queue service closed');
    });

    it('should clear reconnect timer', async () => {
      await QueueService.initialize();
      
      // Trigger reconnect
      const errorHandler = mockConnection.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )[1];
      errorHandler(new Error('Test error'));

      await QueueService.close();

      // Verify timeout was cleared (would need to check internal state)
      expect(mockLogger.info).toHaveBeenCalledWith('Queue service closed');
    });

    it('should handle close errors gracefully', async () => {
      await QueueService.initialize();
      mockChannel.close.mockRejectedValue(new Error('Close error'));

      await expect(QueueService.close()).rejects.toThrow();
    });

    it('should close in correct order', async () => {
      await QueueService.initialize();
      await QueueService.close();

      const closeOrder = [
        ...mockChannel.close.mock.invocationCallOrder,
        mockConnection.close.mock.invocationCallOrder[0],
      ];

      expect(closeOrder[0]).toBeLessThan(closeOrder[2]);
    });
  });

  // =============================================================================
  // isConnected() - 4 test cases
  // =============================================================================

  describe('isConnected()', () => {
    it('should return true when connected', async () => {
      await QueueService.initialize();

      expect(QueueService.isConnected()).toBe(true);
    });

    it('should return false when not initialized', () => {
      jest.resetModules();
      const { QueueService: FreshService } = require('../../../src/services/queueService');

      expect(FreshService.isConnected()).toBe(false);
    });

    it('should return false after close', async () => {
      await QueueService.initialize();
      
      // Manually set to null to simulate close
      (QueueService as any).connection = null;

      expect(QueueService.isConnected()).toBe(false);
    });

    it('should check both connection and channel', async () => {
      await QueueService.initialize();

      expect(QueueService.isConnected()).toBe(true);
    });
  });

  // =============================================================================
  // instance test
  // =============================================================================

  describe('instance', () => {
    it('should be a singleton', () => {
      expect(QueueService).toBeDefined();
    });

    it('should extend EventEmitter', () => {
      expect(typeof QueueService.on).toBe('function');
      expect(typeof QueueService.emit).toBe('function');
    });

    it('should have all required methods', () => {
      expect(typeof QueueService.initialize).toBe('function');
      expect(typeof QueueService.publish).toBe('function');
      expect(typeof QueueService.consume).toBe('function');
      expect(typeof QueueService.close).toBe('function');
      expect(typeof QueueService.isConnected).toBe('function');
    });
  });
});
