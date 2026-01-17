// Mock dependencies before imports
const mockServiceChecker = { check: jest.fn(), getName: jest.fn() };
const mockDatabaseChecker = { check: jest.fn(), getName: jest.fn() };
const mockRedisChecker = { check: jest.fn(), getName: jest.fn() };

jest.mock('../../../src/checkers/service.checker', () => ({
  ServiceHealthChecker: jest.fn(() => mockServiceChecker),
}));

jest.mock('../../../src/checkers/database.checker', () => ({
  DatabaseHealthChecker: jest.fn(() => mockDatabaseChecker),
}));

jest.mock('../../../src/checkers/redis.checker', () => ({
  RedisHealthChecker: jest.fn(() => mockRedisChecker),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    services: {
      auth: 'http://auth:3001',
      venue: 'http://venue:3002',
      event: 'http://event:3003',
      ticket: 'http://ticket:3004',
      payment: 'http://payment:3005',
      marketplace: 'http://marketplace:3006',
      analytics: 'http://analytics:3007',
      apiGateway: 'http://api-gateway:3000',
    },
    intervals: {
      healthCheck: 30000,
    },
  },
}));

import { ServiceHealthChecker } from '../../../src/checkers/service.checker';
import { DatabaseHealthChecker } from '../../../src/checkers/database.checker';
import { RedisHealthChecker } from '../../../src/checkers/redis.checker';
import { logger } from '../../../src/utils/logger';
import {
  initializeHealthCheckers,
  stopHealthCheckers,
} from '../../../src/checkers/index';

describe('Health Checkers Index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockServiceChecker.check.mockResolvedValue({ status: 'healthy' });
    mockDatabaseChecker.check.mockResolvedValue({ status: 'healthy' });
    mockRedisChecker.check.mockResolvedValue({ status: 'healthy' });
    mockServiceChecker.getName.mockReturnValue('ServiceChecker');
    mockDatabaseChecker.getName.mockReturnValue('DatabaseChecker');
    mockRedisChecker.getName.mockReturnValue('RedisChecker');
  });

  afterEach(() => {
    jest.useRealTimers();
    stopHealthCheckers();
  });

  describe('initializeHealthCheckers', () => {
    it('should run health checks on initialization', async () => {
      await initializeHealthCheckers();

      expect(mockServiceChecker.check).toHaveBeenCalled();
      expect(mockDatabaseChecker.check).toHaveBeenCalled();
      expect(mockRedisChecker.check).toHaveBeenCalled();
    });

    it('should resolve without throwing on success', async () => {
      await expect(initializeHealthCheckers()).resolves.toBeUndefined();
    });

    it('should set up periodic health checks', async () => {
      await initializeHealthCheckers();
      const initialCalls = mockDatabaseChecker.check.mock.calls.length;

      jest.advanceTimersByTime(30000);
      await Promise.resolve(); // Flush promises

      expect(mockDatabaseChecker.check.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it('should run checks at each interval', async () => {
      await initializeHealthCheckers();
      const initialCalls = mockDatabaseChecker.check.mock.calls.length;

      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      const afterFirstInterval = mockDatabaseChecker.check.mock.calls.length;
      expect(afterFirstInterval).toBeGreaterThan(initialCalls);

      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      const afterSecondInterval = mockDatabaseChecker.check.mock.calls.length;
      expect(afterSecondInterval).toBeGreaterThan(afterFirstInterval);
    });

    it('should handle checker failures gracefully during periodic checks', async () => {
      await initializeHealthCheckers();

      mockDatabaseChecker.check.mockRejectedValue(new Error('Check failed'));
      mockDatabaseChecker.getName.mockReturnValue('DatabaseHealthChecker');

      jest.advanceTimersByTime(30000);
      await Promise.resolve(); // Flush the interval callback
      await Promise.resolve(); // Flush the Promise.allSettled
      await Promise.resolve(); // Flush any remaining

      expect(logger.error).toHaveBeenCalledWith(
        'Health check failed for DatabaseHealthChecker:',
        expect.any(Error)
      );
    });

    it('should continue checking other services when one fails', async () => {
      mockServiceChecker.check.mockRejectedValue(new Error('Service down'));

      await initializeHealthCheckers();

      expect(mockDatabaseChecker.check).toHaveBeenCalled();
      expect(mockRedisChecker.check).toHaveBeenCalled();
    });

    it('should use Promise.allSettled for concurrent checks', async () => {
      // All checkers should be called even if some fail
      mockServiceChecker.check.mockRejectedValue(new Error('Fail 1'));
      mockDatabaseChecker.check.mockRejectedValue(new Error('Fail 2'));
      mockRedisChecker.check.mockResolvedValue({ status: 'healthy' });

      await initializeHealthCheckers();

      expect(mockServiceChecker.check).toHaveBeenCalled();
      expect(mockDatabaseChecker.check).toHaveBeenCalled();
      expect(mockRedisChecker.check).toHaveBeenCalled();
    });
  });

  describe('stopHealthCheckers', () => {
    it('should stop periodic health checks', async () => {
      await initializeHealthCheckers();
      const callsAfterInit = mockDatabaseChecker.check.mock.calls.length;

      stopHealthCheckers();
      jest.advanceTimersByTime(90000);

      expect(mockDatabaseChecker.check.mock.calls.length).toBe(callsAfterInit);
    });

    it('should handle being called before initialization', () => {
      expect(() => stopHealthCheckers()).not.toThrow();
    });

    it('should handle being called multiple times', async () => {
      await initializeHealthCheckers();

      expect(() => {
        stopHealthCheckers();
        stopHealthCheckers();
        stopHealthCheckers();
      }).not.toThrow();
    });

    it('should clear the interval timer', async () => {
      await initializeHealthCheckers();
      stopHealthCheckers();

      const callsBefore = mockDatabaseChecker.check.mock.calls.length;
      jest.advanceTimersByTime(60000);
      const callsAfter = mockDatabaseChecker.check.mock.calls.length;

      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe('checker instances', () => {
    it('should call check method on all checkers', async () => {
      await initializeHealthCheckers();

      expect(mockServiceChecker.check).toHaveBeenCalled();
      expect(mockDatabaseChecker.check).toHaveBeenCalled();
      expect(mockRedisChecker.check).toHaveBeenCalled();
    });

    it('should call getName on failed checkers for logging', async () => {
      mockDatabaseChecker.check.mockRejectedValue(new Error('Failed'));

      await initializeHealthCheckers();

      expect(mockDatabaseChecker.getName).toHaveBeenCalled();
    });
  });
});
