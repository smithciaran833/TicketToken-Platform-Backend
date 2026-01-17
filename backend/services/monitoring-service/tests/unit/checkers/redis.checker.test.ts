const mockPing = jest.fn();
const mockInfo = jest.fn();
const mockSet = jest.fn();
const mockGet = jest.fn();
const mockDel = jest.fn();
const mockConnect = jest.fn();
const mockQuit = jest.fn();

const mockRedisClient = {
  ping: mockPing,
  info: mockInfo,
  set: mockSet,
  get: mockGet,
  del: mockDel,
  connect: mockConnect,
  quit: mockQuit,
  status: 'ready',
};

jest.mock('ioredis', () => {
  return jest.fn(() => mockRedisClient);
});

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { RedisHealthChecker } from '../../../src/checkers/redis.checker';
import { logger } from '../../../src/logger';

describe('RedisHealthChecker', () => {
  let checker: RedisHealthChecker;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.status = 'ready';
    mockPing.mockResolvedValue('PONG');
    mockInfo.mockResolvedValue('redis_version:7.0.0\r\nuptime_in_seconds:86400\r\n');
    mockSet.mockResolvedValue('OK');
    mockDel.mockResolvedValue(1);
    checker = new RedisHealthChecker();
  });

  describe('getName', () => {
    it('should return correct name', () => {
      expect(checker.getName()).toBe('RedisHealthChecker');
    });
  });

  describe('check', () => {
    it('should return healthy status when Redis responds quickly', async () => {
      const testTimestamp = Date.now().toString();
      mockGet.mockResolvedValue(testTimestamp);
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      const result = await checker.check();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeDefined();
      expect(result.version).toBe('7.0.0');
      expect(result.uptime).toBe('86400s');
      expect(result.message).toBe('Redis responsive');
    });

    it('should return degraded status when latency exceeds 500ms', async () => {
      mockPing.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 600));
        return 'PONG';
      });
      mockGet.mockImplementation(async () => Date.now().toString());
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      const result = await checker.check();

      expect(result.status).toBe('degraded');
      expect(result.latency).toBeGreaterThanOrEqual(500);
      expect(result.message).toBe('Redis slow');
    });

    it('should return unhealthy status on invalid PING response', async () => {
      mockPing.mockResolvedValue('WRONG');

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Invalid PING response');
      expect(result.response).toBe('WRONG');
    });

    it('should return degraded status when SET/GET test fails', async () => {
      mockGet.mockResolvedValue('wrong_value');

      const result = await checker.check();

      expect(result.status).toBe('degraded');
      expect(result.warning).toBe('SET/GET test failed');
    });

    it('should return unhealthy status on connection error', async () => {
      const connError = new Error('Connection refused');
      (connError as any).code = 'ECONNREFUSED';
      mockPing.mockRejectedValue(connError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
      expect(result.code).toBe('ECONNREFUSED');
      expect(result.message).toBe('Redis connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Redis health check failed:',
        expect.any(Error)
      );
    });

    it('should connect if client is not ready', async () => {
      mockRedisClient.status = 'wait';
      mockConnect.mockResolvedValue(undefined);
      mockGet.mockImplementation(async () => Date.now().toString());
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      await checker.check();

      expect(mockConnect).toHaveBeenCalled();
    });

    it('should not connect if client is already ready', async () => {
      mockRedisClient.status = 'ready';
      mockGet.mockImplementation(async () => Date.now().toString());
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      await checker.check();

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should parse memory info correctly', async () => {
      mockInfo.mockImplementation(async (section) => {
        if (section === 'memory') {
          return 'used_memory_human:512.50M\r\n';
        }
        return 'redis_version:7.0.0\r\nuptime_in_seconds:86400\r\n';
      });
      mockGet.mockImplementation(async () => Date.now().toString());
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      const result = await checker.check();

      expect(result.memory).toBe('512.50M');
    });

    it('should clean up test key after check', async () => {
      mockGet.mockImplementation(async () => Date.now().toString());
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      await checker.check();

      expect(mockDel).toHaveBeenCalledWith('__health_check__');
    });

    it('should set test key with 60 second expiry', async () => {
      mockGet.mockImplementation(async () => Date.now().toString());
      mockSet.mockImplementation(async (key, value) => {
        mockGet.mockResolvedValue(value);
        return 'OK';
      });

      await checker.check();

      expect(mockSet).toHaveBeenCalledWith(
        '__health_check__',
        expect.any(String),
        'EX',
        60
      );
    });
  });

  describe('close', () => {
    it('should quit the Redis connection', async () => {
      mockQuit.mockResolvedValue('OK');

      await checker.close();

      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
