/**
 * Comprehensive Unit Tests for src/utils/redis.ts
 *
 * Tests Redis client configuration and connection
 */

// Mock ioredis BEFORE imports
const mockOn = jest.fn();
const mockRedisInstance = {
  on: mockOn,
  connect: jest.fn(),
  disconnect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

const mockRedis = jest.fn(() => mockRedisInstance);

jest.mock('ioredis', () => mockRedis);

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

describe('src/utils/redis.ts - Comprehensive Unit Tests', () => {

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // REDIS CONFIGURATION
  // =============================================================================

  describe('Redis configuration', () => {
    it('should create Redis instance with environment variables', () => {
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'secret';

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6380,
          password: 'secret',
        })
      );
    });

    it('should use default host when not provided', () => {
      delete process.env.REDIS_HOST;

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'redis',
        })
      );
    });

    it('should use default port when not provided', () => {
      delete process.env.REDIS_PORT;

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 6379,
        })
      );
    });

    it('should use undefined password when not provided', () => {
      delete process.env.REDIS_PASSWORD;

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          password: undefined,
        })
      );
    });

    it('should parse port as integer', () => {
      process.env.REDIS_PORT = '6380';

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      expect(typeof config.port).toBe('number');
      expect(config.port).toBe(6380);
    });

    it('should set maxRetriesPerRequest to 3', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetriesPerRequest: 3,
        })
      );
    });

    it('should include retryStrategy function', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        })
      );
    });
  });

  // =============================================================================
  // RETRY STRATEGY
  // =============================================================================

  describe('retryStrategy', () => {
    it('should calculate delay based on attempt number', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      const retryStrategy = config.retryStrategy;

      // First attempt: 1 * 50 = 50ms
      expect(retryStrategy(1)).toBe(50);

      // Second attempt: 2 * 50 = 100ms
      expect(retryStrategy(2)).toBe(100);

      // Fifth attempt: 5 * 50 = 250ms
      expect(retryStrategy(5)).toBe(250);
    });

    it('should cap delay at 2000ms', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      const retryStrategy = config.retryStrategy;

      // 50 * 50 = 2500, but should be capped at 2000
      expect(retryStrategy(50)).toBe(2000);

      // 100 * 50 = 5000, but should be capped at 2000
      expect(retryStrategy(100)).toBe(2000);
    });

    it('should return increasing delays up to cap', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      const retryStrategy = config.retryStrategy;

      const delays: number[] = [1, 2, 5, 10, 20, 40, 50, 100].map(retryStrategy);

      // Check that delays are increasing up to the cap
      for (let i = 0; i < delays.length - 1; i++) {
        if (delays[i] < 2000) {
          expect(delays[i + 1]).toBeGreaterThanOrEqual(delays[i]);
        }
      }

      // All delays should be <= 2000
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(2000);
      });
    });

    it('should handle zero attempts', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      const retryStrategy = config.retryStrategy;

      expect(retryStrategy(0)).toBe(0);
    });

    it('should handle negative attempts', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      const retryStrategy = config.retryStrategy;

      // Math.min with negative should still work
      expect(retryStrategy(-1)).toBe(-50);
    });
  });

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  describe('event handlers', () => {
    it('should register connect event handler', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register error event handler', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should log info message on connect', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      // Find the connect handler
      const connectHandler = mockOn.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];

      expect(connectHandler).toBeDefined();

      // Call the handler
      connectHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('Connected to Redis');
    });

    it('should log error message on error', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      // Find the error handler
      const errorHandler = mockOn.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      // Call the handler with an error
      const testError = new Error('Connection failed');
      errorHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: testError },
        'Redis error'
      );
    });

    it('should handle multiple error events', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const errorHandler = mockOn.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];

      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      errorHandler(error1);
      errorHandler(error2);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenNthCalledWith(
        1,
        { err: error1 },
        'Redis error'
      );
      expect(mockLogger.error).toHaveBeenNthCalledWith(
        2,
        { err: error2 },
        'Redis error'
      );
    });

    it('should handle multiple connect events', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const connectHandler = mockOn.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];

      connectHandler();
      connectHandler();
      connectHandler();

      expect(mockLogger.info).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('exports', () => {
    it('should export Redis instance', () => {
      const redis = jest.isolateModules(() => {
        return require('../../../src/utils/redis').default;
      });

      expect(redis).toBe(mockRedisInstance);
    });

    it('should export the same instance', () => {
      const redis1 = jest.isolateModules(() => {
        return require('../../../src/utils/redis').default;
      });

      // Since we're using isolateModules, each require gets a fresh module
      // So we just verify each returns the mock instance
      expect(redis1).toBe(mockRedisInstance);
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('integration tests', () => {
    it('should create Redis with all configuration options', () => {
      process.env.REDIS_HOST = 'redis.example.com';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'my-secret-password';

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis).toHaveBeenCalledWith({
        host: 'redis.example.com',
        port: 6380,
        password: 'my-secret-password',
        retryStrategy: expect.any(Function),
        maxRetriesPerRequest: 3,
      });
    });

    it('should handle empty string password as undefined', () => {
      process.env.REDIS_PASSWORD = '';

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      // Empty string || undefined evaluates to undefined
      expect(config.password).toBeUndefined();
    });

    it('should parse non-numeric port as NaN', () => {
      process.env.REDIS_PORT = 'invalid';

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      expect(config.port).toBeNaN();
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('edge cases', () => {
    it('should handle whitespace in environment variables', () => {
      process.env.REDIS_HOST = '  localhost  ';
      process.env.REDIS_PORT = '  6379  ';

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      // parseInt handles whitespace
      expect(config.host).toBe('  localhost  ');
      expect(config.port).toBe(6379);
    });

    it('should handle very large retry attempts', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      const calls: any = mockRedis.mock.calls;
      const config = calls[calls.length - 1][0];
      const retryStrategy = config.retryStrategy;

      expect(retryStrategy(1000000)).toBe(2000);
    });

    it('should create instance on module load', () => {
      const callsBefore = mockRedis.mock.calls.length;

      jest.isolateModules(() => {
        require('../../../src/utils/redis');
      });

      expect(mockRedis.mock.calls.length).toBe(callsBefore + 1);
    });
  });

});
