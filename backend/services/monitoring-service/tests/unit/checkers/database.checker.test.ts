import { DatabaseChecker } from '../../../src/checkers/database.checker';

describe('DatabaseChecker', () => {
  let checker: DatabaseChecker;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 2,
    };
    checker = new DatabaseChecker(mockPool);
  });

  describe('check', () => {
    it('should return healthy when connection succeeds', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const result = await checker.check();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThan(0);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return unhealthy when connection fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
      expect(result.latency).toBeGreaterThan(0);
    });

    it('should include pool stats in details', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const result = await checker.check();

      expect(result.details).toEqual({
        total: 10,
        idle: 5,
        waiting: 2,
      });
    });

    it('should measure latency accurately', async () => {
      mockPool.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [{ result: 1 }] }), 50))
      );

      const result = await checker.check();

      expect(result.latency).toBeGreaterThanOrEqual(50);
    });
  });
});
