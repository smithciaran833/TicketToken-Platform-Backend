/**
 * RabbitMQ Configuration Tests
 */

// Setup mocks before any imports
const mockChannel = {
  assertExchange: jest.fn(),
  assertQueue: jest.fn((queue: string, options: any, callback: Function) => {
    callback(null, { queue });
  }),
  bindQueue: jest.fn(),
  publish: jest.fn().mockReturnValue(true),
  close: jest.fn((callback: Function) => callback()),
};

const mockConnection = {
  createChannel: jest.fn((callback: Function) => {
    callback(null, mockChannel);
  }),
  on: jest.fn(),
  close: jest.fn((callback: Function) => callback()),
};

jest.mock('amqplib/callback_api', () => ({
  connect: jest.fn((url: string, callback: Function) => {
    callback(null, mockConnection);
  }),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    rabbitmq: {
      url: 'amqp://localhost:5672',
      exchange: 'test_exchange',
      queue: 'test_queue',
    },
  },
}));

describe('RabbitMQ Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectRabbitMQ', () => {
    it('should connect to RabbitMQ successfully', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');
      const amqp = require('amqplib/callback_api');

      await connectRabbitMQ();

      expect(amqp.connect).toHaveBeenCalledWith(
        'amqp://localhost:5672',
        expect.any(Function)
      );
    });

    it('should create exchange and queue', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test_exchange',
        'topic',
        { durable: true }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test_queue',
        expect.objectContaining({
          durable: true,
          exclusive: false,
          autoDelete: false,
        }),
        expect.any(Function)
      );
    });

    it('should bind queue to exchange', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test_queue',
        'test_exchange',
        '#'
      );
    });

    it('should set up connection event handlers', async () => {
      const { connectRabbitMQ } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('getChannel', () => {
    it('should throw if not initialized', () => {
      jest.resetModules();
      
      jest.mock('amqplib/callback_api', () => ({
        connect: jest.fn(),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { rabbitmq: { url: 'amqp://localhost:5672', exchange: 'test', queue: 'test' } },
      }));

      const { getChannel } = require('../../../src/config/rabbitmq');

      expect(() => getChannel()).toThrow('RabbitMQ channel not initialized');
    });

    it('should return channel after connection', async () => {
      jest.resetModules();
      
      jest.mock('amqplib/callback_api', () => ({
        connect: jest.fn((url: string, callback: Function) => {
          callback(null, mockConnection);
        }),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { rabbitmq: { url: 'amqp://localhost:5672', exchange: 'test_exchange', queue: 'test_queue' } },
      }));

      const { connectRabbitMQ, getChannel } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();
      const channel = getChannel();

      expect(channel).toBeDefined();
    });
  });

  describe('publishEvent', () => {
    it('should publish event to exchange', async () => {
      jest.resetModules();
      
      jest.mock('amqplib/callback_api', () => ({
        connect: jest.fn((url: string, callback: Function) => {
          callback(null, mockConnection);
        }),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { rabbitmq: { url: 'amqp://localhost:5672', exchange: 'test_exchange', queue: 'test_queue' } },
      }));

      const { connectRabbitMQ, publishEvent } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();
      await publishEvent('test.event', { data: 'test' });

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test_exchange',
        'test.event',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should serialize data as JSON', async () => {
      jest.resetModules();
      
      jest.mock('amqplib/callback_api', () => ({
        connect: jest.fn((url: string, callback: Function) => {
          callback(null, mockConnection);
        }),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { rabbitmq: { url: 'amqp://localhost:5672', exchange: 'test_exchange', queue: 'test_queue' } },
      }));

      const { connectRabbitMQ, publishEvent } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();
      const testData = { key: 'value', num: 123 };
      await publishEvent('test.event', testData);

      const publishCall = mockChannel.publish.mock.calls[0];
      const buffer = publishCall[2];
      expect(JSON.parse(buffer.toString())).toEqual(testData);
    });
  });

  describe('closeRabbitMQ', () => {
    it('should close channel and connection', async () => {
      jest.resetModules();
      
      jest.mock('amqplib/callback_api', () => ({
        connect: jest.fn((url: string, callback: Function) => {
          callback(null, mockConnection);
        }),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { rabbitmq: { url: 'amqp://localhost:5672', exchange: 'test_exchange', queue: 'test_queue' } },
      }));

      const { connectRabbitMQ, closeRabbitMQ } = require('../../../src/config/rabbitmq');

      await connectRabbitMQ();
      await closeRabbitMQ();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });
});
