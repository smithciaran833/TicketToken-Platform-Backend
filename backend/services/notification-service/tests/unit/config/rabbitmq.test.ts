import { RabbitMQService, rabbitmqService } from '../../../src/config/rabbitmq';
import { env } from '../../../src/config/env';
import { logger } from '../../../src/config/logger';

const amqp = require('amqplib');

jest.mock('amqplib');
jest.mock('../../../src/config/logger');

describe('RabbitMQ Configuration', () => {
  let mockConnection: any;
  let mockChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      prefetch: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);
  });

  describe('RabbitMQService', () => {
    describe('connect()', () => {
      it('should connect to RabbitMQ successfully', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(amqp.connect).toHaveBeenCalledWith(env.RABBITMQ_URL);
        expect(mockConnection.createChannel).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith('RabbitMQ connected and configured');
      });

      it('should require amqps:// in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalUrl = process.env.RABBITMQ_URL;
        
        process.env.NODE_ENV = 'production';
        process.env.RABBITMQ_URL = 'amqp://localhost:5672';
        
        jest.resetModules();
        const { RabbitMQService: Service } = require('../../../src/config/rabbitmq');
        const service = new Service();

        await expect(service.connect()).rejects.toThrow('SECURITY: RabbitMQ must use TLS');

        process.env.NODE_ENV = originalEnv;
        process.env.RABBITMQ_URL = originalUrl;
      });

      it('should allow amqps:// in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalUrl = process.env.RABBITMQ_URL;
        
        process.env.NODE_ENV = 'production';
        process.env.RABBITMQ_URL = 'amqps://localhost:5672';
        
        jest.resetModules();
        const { RabbitMQService: Service } = require('../../../src/config/rabbitmq');
        const service = new Service();

        await service.connect();

        expect(logger.info).toHaveBeenCalledWith('RabbitMQ TLS enabled for production');

        process.env.NODE_ENV = originalEnv;
        process.env.RABBITMQ_URL = originalUrl;
      });

      it('should warn about unencrypted connection in non-production', async () => {
        const originalUrl = process.env.RABBITMQ_URL;
        process.env.RABBITMQ_URL = 'amqp://localhost:5672';
        
        jest.resetModules();
        const { RabbitMQService: Service } = require('../../../src/config/rabbitmq');
        const service = new Service();

        await service.connect();

        expect(logger.warn).toHaveBeenCalledWith('RabbitMQ using unencrypted connection (non-production)');

        process.env.RABBITMQ_URL = originalUrl;
      });

      it('should throw error if connection fails', async () => {
        (amqp.connect as jest.Mock).mockResolvedValue(null);
        
        const service = new RabbitMQService();

        await expect(service.connect()).rejects.toThrow('Failed to establish RabbitMQ connection');
      });

      it('should throw error if channel creation fails', async () => {
        mockConnection.createChannel.mockResolvedValue(null);
        
        const service = new RabbitMQService();

        await expect(service.connect()).rejects.toThrow('Failed to create RabbitMQ channel');
      });

      it('should assert exchange', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(mockChannel.assertExchange).toHaveBeenCalledWith(
          env.RABBITMQ_EXCHANGE,
          'topic',
          { durable: true }
        );
      });

      it('should assert queue', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(mockChannel.assertQueue).toHaveBeenCalledWith(
          env.RABBITMQ_QUEUE,
          { durable: true }
        );
      });

      it('should bind all routing keys', async () => {
        const service = new RabbitMQService();

        await service.connect();

        const expectedKeys = [
          'payment.completed',
          'ticket.purchased',
          'ticket.transferred',
          'event.reminder',
          'event.cancelled',
          'event.updated',
          'user.registered',
          'user.password_reset',
          'venue.announcement',
          'marketing.campaign'
        ];

        expectedKeys.forEach(key => {
          expect(mockChannel.bindQueue).toHaveBeenCalledWith(
            env.RABBITMQ_QUEUE,
            env.RABBITMQ_EXCHANGE,
            key
          );
        });
      });

      it('should set prefetch to 1', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
      });

      it('should setup error handler', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      });

      it('should log error on connection error', async () => {
        const service = new RabbitMQService();

        await service.connect();

        const errorHandler = mockConnection.on.mock.calls.find(
          call => call[0] === 'error'
        )[1];

        const error = new Error('Connection error');
        errorHandler(error);

        expect(logger.error).toHaveBeenCalledWith('RabbitMQ connection error:', error);
      });

      it('should setup close handler', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
      });

      it('should retry on connection close', async () => {
        jest.useFakeTimers();
        
        const service = new RabbitMQService();

        await service.connect();

        const closeHandler = mockConnection.on.mock.calls.find(
          call => call[0] === 'close'
        )[1];

        closeHandler();

        expect(logger.warn).toHaveBeenCalledWith('RabbitMQ connection closed');

        jest.useRealTimers();
      });

      it('should set isConnected to true on success', async () => {
        const service = new RabbitMQService();

        await service.connect();

        expect(service.getConnectionStatus()).toBe(true);
      });
    });

    describe('consume()', () => {
      it('should consume messages from queue', async () => {
        const service = new RabbitMQService();
        await service.connect();

        const callback = jest.fn().mockResolvedValue(undefined);

        await service.consume(callback);

        expect(mockChannel.consume).toHaveBeenCalledWith(
          env.RABBITMQ_QUEUE,
          expect.any(Function)
        );
      });

      it('should throw error if channel not initialized', async () => {
        const service = new RabbitMQService();
        const callback = jest.fn();

        await expect(service.consume(callback)).rejects.toThrow('RabbitMQ channel not initialized');
      });

      it('should ack message on successful processing', async () => {
        const service = new RabbitMQService();
        await service.connect();

        const callback = jest.fn().mockResolvedValue(undefined);
        await service.consume(callback);

        const consumeHandler = mockChannel.consume.mock.calls[0][1];
        const mockMessage = { content: Buffer.from('test') };

        await consumeHandler(mockMessage);

        expect(callback).toHaveBeenCalledWith(mockMessage);
        expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
      });

      it('should nack message on processing error', async () => {
        const service = new RabbitMQService();
        await service.connect();

        const error = new Error('Processing failed');
        const callback = jest.fn().mockRejectedValue(error);
        await service.consume(callback);

        const consumeHandler = mockChannel.consume.mock.calls[0][1];
        const mockMessage = { content: Buffer.from('test') };

        await consumeHandler(mockMessage);

        expect(logger.error).toHaveBeenCalledWith('Error processing message:', error);
        expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, true);
      });

      it('should ignore null messages', async () => {
        const service = new RabbitMQService();
        await service.connect();

        const callback = jest.fn();
        await service.consume(callback);

        const consumeHandler = mockChannel.consume.mock.calls[0][1];

        await consumeHandler(null);

        expect(callback).not.toHaveBeenCalled();
        expect(mockChannel.ack).not.toHaveBeenCalled();
      });
    });

    describe('publish()', () => {
      it('should publish message to exchange', async () => {
        const service = new RabbitMQService();
        await service.connect();

        const data = { test: 'data' };
        await service.publish('test.routing.key', data);

        expect(mockChannel.publish).toHaveBeenCalledWith(
          env.RABBITMQ_EXCHANGE,
          'test.routing.key',
          Buffer.from(JSON.stringify(data)),
          expect.objectContaining({
            persistent: true,
            timestamp: expect.any(Number),
          })
        );
      });

      it('should throw error if channel not initialized', async () => {
        const service = new RabbitMQService();

        await expect(service.publish('test', {})).rejects.toThrow('RabbitMQ channel not initialized');
      });
    });

    describe('close()', () => {
      it('should close channel and connection', async () => {
        const service = new RabbitMQService();
        await service.connect();

        await service.close();

        expect(mockChannel.close).toHaveBeenCalled();
        expect(mockConnection.close).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith('RabbitMQ connection closed');
      });

      it('should set isConnected to false', async () => {
        const service = new RabbitMQService();
        await service.connect();

        await service.close();

        expect(service.getConnectionStatus()).toBe(false);
      });

      it('should handle close errors', async () => {
        const service = new RabbitMQService();
        await service.connect();

        const error = new Error('Close failed');
        mockChannel.close.mockRejectedValue(error);

        await service.close();

        expect(logger.error).toHaveBeenCalledWith('Error closing RabbitMQ connection:', error);
      });

      it('should handle null channel', async () => {
        const service = new RabbitMQService();

        await service.close();

        expect(mockChannel.close).not.toHaveBeenCalled();
      });
    });

    describe('getConnectionStatus()', () => {
      it('should return false initially', () => {
        const service = new RabbitMQService();

        expect(service.getConnectionStatus()).toBe(false);
      });

      it('should return true when connected', async () => {
        const service = new RabbitMQService();
        await service.connect();

        expect(service.getConnectionStatus()).toBe(true);
      });

      it('should return false after close', async () => {
        const service = new RabbitMQService();
        await service.connect();
        await service.close();

        expect(service.getConnectionStatus()).toBe(false);
      });
    });
  });

  describe('rabbitmqService singleton', () => {
    it('should export singleton instance', () => {
      expect(rabbitmqService).toBeInstanceOf(RabbitMQService);
    });
  });
});
