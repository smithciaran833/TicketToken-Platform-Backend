const mockQuery = jest.fn();
const mockEnd = jest.fn();
const mockPool = {
  query: mockQuery,
  end: mockEnd,
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0,
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { DatabaseHealthChecker } from '../../../src/checkers/database.checker';
import { logger } from '../../../src/logger';

describe('DatabaseHealthChecker', () => {
  let checker: DatabaseHealthChecker;

  beforeEach(() => {
    jest.clearAllMocks();
    checker = new DatabaseHealthChecker();
  });

  describe('getName', () => {
    it('should return correct name', () => {
      expect(checker.getName()).toBe('DatabaseHealthChecker');
    });
  });

  describe('check', () => {
    it('should return healthy status when query succeeds quickly', async () => {
      const mockTimestamp = new Date();
      mockQuery.mockResolvedValue({
        rows: [{ health_check: 1, timestamp: mockTimestamp }],
      });

      const result = await checker.check();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeDefined();
      expect(result.latency).toBeLessThan(1000);
      expect(result.timestamp).toBe(mockTimestamp);
      expect(result.pool).toEqual({
        total: 5,
        idle: 3,
        waiting: 0,
      });
      expect(result.message).toBe('Database responsive');
    });

    it('should return degraded status when latency exceeds 1000ms', async () => {
      mockQuery.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1100));
        return { rows: [{ health_check: 1, timestamp: new Date() }] };
      });

      const result = await checker.check();

      expect(result.status).toBe('degraded');
      expect(result.latency).toBeGreaterThanOrEqual(1000);
      expect(result.message).toBe('Database slow');
    });

    it('should return unhealthy status when query returns empty result', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Invalid health check query result');
    });

    it('should return unhealthy status when health_check value is wrong', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ health_check: 0, timestamp: new Date() }],
      });

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Invalid health check query result');
    });

    it('should return unhealthy status on database error', async () => {
      const dbError = new Error('Connection refused');
      (dbError as any).code = 'ECONNREFUSED';
      mockQuery.mockRejectedValue(dbError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
      expect(result.code).toBe('ECONNREFUSED');
      expect(result.message).toBe('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Database health check failed:',
        expect.any(Error)
      );
    });

    it('should return unhealthy status on timeout', async () => {
      const timeoutError = new Error('Query timeout');
      (timeoutError as any).code = 'ETIMEDOUT';
      mockQuery.mockRejectedValue(timeoutError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.code).toBe('ETIMEDOUT');
    });

    it('should execute correct SQL query', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ health_check: 1, timestamp: new Date() }],
      });

      await checker.check();

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT 1 as health_check, NOW() as timestamp'
      );
    });

    it('should include pool statistics in healthy response', async () => {
      mockPool.totalCount = 10;
      mockPool.idleCount = 7;
      mockPool.waitingCount = 2;

      mockQuery.mockResolvedValue({
        rows: [{ health_check: 1, timestamp: new Date() }],
      });

      const result = await checker.check();

      expect(result.pool).toEqual({
        total: 10,
        idle: 7,
        waiting: 2,
      });
    });

    it('should measure latency accurately', async () => {
      mockQuery.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { rows: [{ health_check: 1, timestamp: new Date() }] };
      });

      const result = await checker.check();

      expect(result.latency).toBeGreaterThanOrEqual(50);
      expect(result.latency).toBeLessThan(200);
    });
  });

  describe('close', () => {
    it('should end the pool connection', async () => {
      mockEnd.mockResolvedValue(undefined);

      await checker.close();

      expect(mockEnd).toHaveBeenCalled();
    });
  });
});
