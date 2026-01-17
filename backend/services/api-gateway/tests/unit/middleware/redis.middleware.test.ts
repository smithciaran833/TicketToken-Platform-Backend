import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

// Define mock logger BEFORE any imports that use it
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'test-password',
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

// Import AFTER mocks are set up
import { setupRedisMiddleware } from '../../../src/middleware/redis.middleware';

describe('redis.middleware', () => {
  let mockServer: any;
  let mockRedis: any;
  let onCloseCallback: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    onCloseCallback = jest.fn();

    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    (Redis as unknown as jest.Mock).mockImplementation(() => mockRedis);

    mockServer = {
      decorate: jest.fn(),
      addHook: jest.fn((event: string, callback: Function) => {
        if (event === 'onClose') {
          onCloseCallback = callback;
        }
      }),
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };
  });

  describe('setupRedisMiddleware', () => {
    it('creates Redis client with correct configuration', async () => {
      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: 'test-password',
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
    });

    it('connects to Redis successfully', async () => {
      await setupRedisMiddleware(mockServer);

      expect(mockRedis.connect).toHaveBeenCalledTimes(1);
      expect(mockRedis.ping).toHaveBeenCalledTimes(1);
    });

    it('decorates server with redis client', async () => {
      await setupRedisMiddleware(mockServer);

      expect(mockServer.decorate).toHaveBeenCalledWith('redis', mockRedis);
    });

    it('adds onClose hook to quit redis connection', async () => {
      await setupRedisMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onClose', expect.any(Function));
    });

    it('closes Redis connection on server close', async () => {
      await setupRedisMiddleware(mockServer);

      await onCloseCallback();

      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });

    it('omits password when not provided in config', async () => {
      const config = require('../../../src/config').config;
      const originalPassword = config.redis.password;
      config.redis.password = undefined;

      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      config.redis.password = originalPassword;
    });

    it('omits password when empty string in config', async () => {
      const config = require('../../../src/config').config;
      const originalPassword = config.redis.password;
      config.redis.password = '   ';

      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      config.redis.password = originalPassword;
    });

    it('uses default host when not provided', async () => {
      const config = require('../../../src/config').config;
      const originalHost = config.redis.host;
      config.redis.host = undefined;

      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
        })
      );

      config.redis.host = originalHost;
    });

    it('uses default port when not provided', async () => {
      const config = require('../../../src/config').config;
      const originalPort = config.redis.port;
      config.redis.port = undefined;

      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 6379,
        })
      );

      config.redis.port = originalPort;
    });

    it('throws error when connection fails', async () => {
      const connectionError = new Error('Connection refused');
      mockRedis.connect.mockRejectedValue(connectionError);

      await expect(setupRedisMiddleware(mockServer)).rejects.toThrow('Connection refused');
    });

    it('throws error when ping fails', async () => {
      const pingError = new Error('Ping timeout');
      mockRedis.ping.mockRejectedValue(pingError);

      await expect(setupRedisMiddleware(mockServer)).rejects.toThrow('Ping timeout');
    });

    it('does not decorate server when connection fails', async () => {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      try {
        await setupRedisMiddleware(mockServer);
      } catch (error) {
        // Expected error
      }

      expect(mockServer.decorate).not.toHaveBeenCalled();
    });

    it('does not add onClose hook when connection fails', async () => {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      try {
        await setupRedisMiddleware(mockServer);
      } catch (error) {
        // Expected error
      }

      expect(mockServer.addHook).not.toHaveBeenCalled();
    });

    it('handles password with special characters', async () => {
      const config = require('../../../src/config').config;
      const originalPassword = config.redis.password;
      config.redis.password = 'p@ssw0rd!#$%';

      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'p@ssw0rd!#$%',
        })
      );

      config.redis.password = originalPassword;
    });

    it('sets correct Redis client options for production', async () => {
      await setupRedisMiddleware(mockServer);

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          connectTimeout: 5000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: true,
        })
      );
    });

    it('logs success message after connection', async () => {
      await setupRedisMiddleware(mockServer);

      expect(mockLogger.info).toHaveBeenCalledWith('Redis connection established successfully');
    });

    it('logs error message when connection fails', async () => {
      const connectionError = new Error('Connection refused');
      mockRedis.connect.mockRejectedValue(connectionError);

      try {
        await setupRedisMiddleware(mockServer);
      } catch (error) {
        // Expected error
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: connectionError },
        'Redis connection failed'
      );
    });

    it('logs close message when server shuts down', async () => {
      await setupRedisMiddleware(mockServer);
      await onCloseCallback();

      expect(mockLogger.info).toHaveBeenCalledWith('Redis connection closed');
    });
  });
});
