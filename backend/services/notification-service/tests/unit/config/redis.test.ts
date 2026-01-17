/**
 * Redis Configuration Tests
 */

// Mock logger first
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../../../src/config/logger', () => ({
  logger: mockLogger,
}));

// Mock metrics service
const mockMetricsService = {
  setGauge: jest.fn(),
  incrementCounter: jest.fn(),
};
jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: mockMetricsService,
}));

// Create mock Redis instance
const mockRedisInstance = {
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
  info: jest.fn().mockResolvedValue('connected_clients:5\r\nblocked_clients:0\r\nused_memory:1000000\r\nused_memory_peak:2000000'),
  on: jest.fn(),
  once: jest.fn(),
};

// Mock ioredis constructor - capture config
let capturedRedisConfig: any = null;
const RedisMock = jest.fn((config) => {
  capturedRedisConfig = config;
  return mockRedisInstance;
});

jest.mock('ioredis', () => RedisMock);

// NOW import the redis module
import {
  redis,
  redisClient,
  redisPubSub,
  connectRedis,
  closeRedisConnections,
  isRedisConnected,
  getRedisStats,
  createRedisClient,
  redisHealthMonitor,
} from '../../../src/config/redis';

describe('Redis Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mock implementations
    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockRedisInstance.quit.mockResolvedValue('OK');
    mockRedisInstance.info.mockResolvedValue('connected_clients:5\r\nblocked_clients:0\r\nused_memory:1000000\r\nused_memory_peak:2000000');
  });

  afterEach(() => {
    redisHealthMonitor.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Redis Connection Configuration', () => {
    it('should create Redis client with correct configuration', () => {
      expect(RedisMock).toHaveBeenCalled();
      expect(capturedRedisConfig).toBeDefined();
      expect(capturedRedisConfig.host).toBeDefined();
      expect(capturedRedisConfig.port).toBeDefined();
      expect(capturedRedisConfig.maxRetriesPerRequest).toBe(3);
      expect(capturedRedisConfig.enableReadyCheck).toBe(true);
      expect(capturedRedisConfig.enableOfflineQueue).toBe(true);
    });

    it('should configure connection timeouts', () => {
      expect(capturedRedisConfig.connectTimeout).toBeDefined();
      expect(capturedRedisConfig.commandTimeout).toBeDefined();
    });

    it('should configure keep alive', () => {
      expect(capturedRedisConfig.keepAlive).toBe(30000);
    });
  });

  describe('Retry Strategy', () => {
    it('should implement exponential backoff', () => {
      const delay1 = capturedRedisConfig.retryStrategy(1);
      const delay2 = capturedRedisConfig.retryStrategy(2);
      const delay3 = capturedRedisConfig.retryStrategy(3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should cap retry delay at max retry time', () => {
      const delay = capturedRedisConfig.retryStrategy(2000);

      // Should be capped at 60000ms (default max)
      expect(delay).toBeLessThanOrEqual(60000);
    });

    it('should stop retrying after 20 attempts', () => {
      const result = capturedRedisConfig.retryStrategy(21);

      expect(result).toBeNull();
    });

    it('should log retry attempts', () => {
      capturedRedisConfig.retryStrategy(5);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis retry attempt'),
        expect.anything()
      );
    });
  });

  describe('Reconnect on Error', () => {
    it('should reconnect on READONLY errors', () => {
      const error = new Error('READONLY You can\'t write against a read only replica');

      const result = capturedRedisConfig.reconnectOnError(error);

      expect(result).toBe(true);
    });

    it('should not reconnect on other errors', () => {
      const error = new Error('Connection refused');

      const result = capturedRedisConfig.reconnectOnError(error);

      expect(result).toBe(false);
    });
  });

  describe('connectRedis()', () => {
    it('should setup event handlers', async () => {
      // Simulate ready event
      mockRedisInstance.once.mockImplementation((event, callback) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await connectRedis();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should connect successfully', async () => {
      mockRedisInstance.once.mockImplementation((event, callback) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await connectRedis();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Redis connected successfully',
        expect.any(Object)
      );
    });

    it('should start health monitor after connection', async () => {
      mockRedisInstance.once.mockImplementation((event, callback) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await connectRedis();

      expect(mockLogger.info).toHaveBeenCalledWith('Redis health monitor started');
    });
  });

  describe('closeRedisConnections()', () => {
    it('should quit connections gracefully', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');

      await closeRedisConnections();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Redis connections closed');
    });

    it('should force disconnect on graceful close failure', async () => {
      mockRedisInstance.quit.mockRejectedValue(new Error('Quit failed'));

      await closeRedisConnections();

      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error closing Redis connections',
        expect.any(Object)
      );
    });
  });

  describe('isRedisConnected()', () => {
    it('should return true when connected', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      const result = await isRedisConnected();

      expect(result).toBe(true);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should return false when not connected', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Not connected'));

      const result = await isRedisConnected();

      expect(result).toBe(false);
    });
  });

  describe('getRedisStats()', () => {
    it('should return Redis statistics', async () => {
      mockRedisInstance.info.mockResolvedValue('connected_clients:5\r\nblocked_clients:2\r\nused_memory:1000000\r\nused_memory_peak:2000000');

      const stats = await getRedisStats();

      expect(stats).toEqual({
        connected: true,
        clients: 5,
        blockedClients: 2,
        memoryUsed: 1000000,
        memoryPeak: 2000000,
      });
    });

    it('should handle connection errors', async () => {
      mockRedisInstance.info.mockRejectedValue(new Error('Connection error'));

      const stats = await getRedisStats();

      expect(stats).toEqual({
        connected: false,
        clients: 0,
        blockedClients: 0,
        memoryUsed: 0,
        memoryPeak: 0,
      });
    });

    it('should handle malformed info response', async () => {
      mockRedisInstance.info.mockResolvedValue('invalid response');

      const stats = await getRedisStats();

      expect(stats.connected).toBe(true);
      expect(stats.clients).toBe(0);
    });
  });

  describe('createRedisClient()', () => {
    it('should create client with default configuration', () => {
      const client = createRedisClient();

      expect(RedisMock).toHaveBeenCalled();
      expect(client).toBe(mockRedisInstance);
    });

    it('should create client with custom configuration', () => {
      const customOptions = {
        host: 'custom-host',
        port: 6380,
      };

      const client = createRedisClient(customOptions);

      expect(client).toBe(mockRedisInstance);
    });

    it('should setup error handler for custom client', () => {
      const client = createRedisClient();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('RedisHealthMonitor', () => {
    it('should start health monitoring', () => {
      redisHealthMonitor.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Redis health monitor started');
    });

    it('should stop health monitoring', () => {
      redisHealthMonitor.start();
      redisHealthMonitor.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Redis health monitor stopped');
    });

    it('should check health and update metrics on success', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      const result = await redisHealthMonitor.checkHealth();

      expect(result).toBe(true);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('redis_health', 1);
    });

    it('should check health and update metrics on failure', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Health check failed'));

      const result = await redisHealthMonitor.checkHealth();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis health check failed',
        expect.any(Object)
      );
      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('redis_health', 0);
    });

    it('should return health status', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      await redisHealthMonitor.checkHealth();

      expect(redisHealthMonitor.getHealthStatus()).toBe(true);
    });

    it('should perform periodic health checks', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      redisHealthMonitor.start();

      await jest.advanceTimersByTimeAsync(30000);

      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });
  });

  describe('Exported Instances', () => {
    it('should export redis client', () => {
      expect(redis).toBe(mockRedisInstance);
    });

    it('should export redisClient alias', () => {
      expect(redisClient).toBe(mockRedisInstance);
    });

    it('should export redisPubSub client', () => {
      expect(redisPubSub).toBe(mockRedisInstance);
    });

    it('should create two Redis instances (main + pubsub)', () => {
      expect(RedisMock).toHaveBeenCalledTimes(2);
    });
  });
});
