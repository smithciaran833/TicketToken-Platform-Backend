import { RateLimitModel, IRateLimit } from '../../../src/models/RateLimit';
import Knex from 'knex';

describe('RateLimitModel', () => {
  let mockDb: any;
  let rateLimitModel: RateLimitModel;

  beforeEach(() => {
    // Create a mock Knex instance with chainable query builder
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      del: jest.fn(),
      increment: jest.fn(),
    };

    // Mock the table function to return the mock query builder
    const tableMock = jest.fn(() => mockDb);
    mockDb = Object.assign(tableMock, mockDb);

    rateLimitModel = new RateLimitModel(mockDb as unknown as Knex);
  });

  describe('Constructor', () => {
    it('should initialize with provided db instance', () => {
      const model = new RateLimitModel(mockDb as unknown as Knex);
      expect(model).toBeInstanceOf(RateLimitModel);
    });

    it('should use default db if none provided', () => {
      const model = new RateLimitModel();
      expect(model).toBeInstanceOf(RateLimitModel);
    });
  });

  describe('create', () => {
    it('should insert rate limit and return created record', async () => {
      const rateLimitData: IRateLimit = {
        key: 'user:123:api',
        limit: 100,
        window_seconds: 3600,
        current_count: 0,
        reset_at: new Date(Date.now() + 3600000),
      };

      const expectedRateLimit: IRateLimit = {
        ...rateLimitData,
        id: 'rl-123',
        created_at: new Date(),
      };

      mockDb.returning.mockResolvedValue([expectedRateLimit]);

      const result = await rateLimitModel.create(rateLimitData);

      expect(mockDb).toHaveBeenCalledWith('rate_limits');
      expect(mockDb.insert).toHaveBeenCalledWith(rateLimitData);
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(expectedRateLimit);
    });

    it('should handle rate limit with future reset_at', async () => {
      const futureDate = new Date(Date.now() + 7200000); // 2 hours from now
      const rateLimitData: IRateLimit = {
        key: 'api:endpoint:/users',
        limit: 1000,
        window_seconds: 7200,
        current_count: 50,
        reset_at: futureDate,
      };

      mockDb.returning.mockResolvedValue([{ ...rateLimitData, id: 'rl-456' }]);

      const result = await rateLimitModel.create(rateLimitData);

      expect(mockDb.insert).toHaveBeenCalledWith(rateLimitData);
      expect(result.reset_at).toEqual(futureDate);
    });

    it('should handle rate limit at max count', async () => {
      const rateLimitData: IRateLimit = {
        key: 'tenant:org-123',
        limit: 500,
        window_seconds: 60,
        current_count: 500, // at limit
        reset_at: new Date(Date.now() + 60000),
      };

      mockDb.returning.mockResolvedValue([{ ...rateLimitData, id: 'rl-789' }]);

      const result = await rateLimitModel.create(rateLimitData);

      expect(result.current_count).toBe(500);
      expect(result.limit).toBe(500);
    });
  });

  describe('findByKey', () => {
    it('should return rate limit when found by key', async () => {
      const expectedRateLimit: IRateLimit = {
        id: 'rl-123',
        key: 'user:123:api',
        limit: 100,
        window_seconds: 3600,
        current_count: 45,
        reset_at: new Date(Date.now() + 1800000),
      };

      mockDb.first.mockResolvedValue(expectedRateLimit);

      const result = await rateLimitModel.findByKey('user:123:api');

      expect(mockDb).toHaveBeenCalledWith('rate_limits');
      expect(mockDb.where).toHaveBeenCalledWith({ key: 'user:123:api' });
      expect(mockDb.first).toHaveBeenCalled();
      expect(result).toEqual(expectedRateLimit);
    });

    it('should return null when key not found', async () => {
      mockDb.first.mockResolvedValue(undefined);

      const result = await rateLimitModel.findByKey('nonexistent:key');

      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockDb.first.mockResolvedValue(null);

      const result = await rateLimitModel.findByKey('missing:key');

      expect(result).toBeNull();
    });

    it('should handle complex key formats', async () => {
      const complexKey = 'tenant:org-456:endpoint:/api/v2/users:method:POST';
      mockDb.first.mockResolvedValue(null);

      await rateLimitModel.findByKey(complexKey);

      expect(mockDb.where).toHaveBeenCalledWith({ key: complexKey });
    });
  });

  describe('increment', () => {
    it('should increment current_count when reset_at is in future and return true', async () => {
      mockDb.increment.mockResolvedValue(1);

      const result = await rateLimitModel.increment('user:123:api');

      expect(mockDb).toHaveBeenCalledWith('rate_limits');
      expect(mockDb.where).toHaveBeenCalledWith({ key: 'user:123:api' });
      expect(mockDb.where).toHaveBeenCalledWith('reset_at', '>', expect.any(Date));
      expect(mockDb.increment).toHaveBeenCalledWith('current_count', 1);
      expect(result).toBe(true);
    });

    it('should NOT increment when reset_at has passed (expired) and return false', async () => {
      mockDb.increment.mockResolvedValue(0); // No rows affected

      const result = await rateLimitModel.increment('user:999:api');

      expect(result).toBe(false);
    });

    it('should return false when key does not exist', async () => {
      mockDb.increment.mockResolvedValue(0);

      const result = await rateLimitModel.increment('nonexistent:key');

      expect(result).toBe(false);
    });

    it('should verify reset_at comparison uses current date', async () => {
      const beforeIncrement = new Date();
      mockDb.increment.mockResolvedValue(1);

      await rateLimitModel.increment('user:123:api');

      // Find the where call with reset_at
      const whereCall = mockDb.where.mock.calls.find(
        (call: any[]) => call[0] === 'reset_at'
      );

      expect(whereCall).toBeDefined();
      expect(whereCall[1]).toBe('>');
      expect(whereCall[2]).toBeInstanceOf(Date);
      expect(whereCall[2].getTime()).toBeGreaterThanOrEqual(beforeIncrement.getTime());
    });

    it('should handle multiple increment attempts on same key', async () => {
      mockDb.increment.mockResolvedValue(1);

      const result1 = await rateLimitModel.increment('user:123:api');
      const result2 = await rateLimitModel.increment('user:123:api');
      const result3 = await rateLimitModel.increment('user:123:api');

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
      expect(mockDb.increment).toHaveBeenCalledTimes(3);
    });
  });

  describe('reset', () => {
    it('should reset current_count to 0 and set new reset_at', async () => {
      const beforeReset = new Date();
      mockDb.update.mockResolvedValue(1);

      const result = await rateLimitModel.reset('user:123:api');

      expect(mockDb).toHaveBeenCalledWith('rate_limits');
      expect(mockDb.where).toHaveBeenCalledWith({ key: 'user:123:api' });
      
      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.current_count).toBe(0);
      expect(updateCall.reset_at).toBeInstanceOf(Date);
      
      // Verify reset_at is approximately 1 hour in the future
      const expectedResetTime = beforeReset.getTime() + (1000 * 60 * 60);
      const actualResetTime = updateCall.reset_at.getTime();
      expect(actualResetTime).toBeGreaterThanOrEqual(expectedResetTime - 100);
      expect(actualResetTime).toBeLessThanOrEqual(expectedResetTime + 100);
      
      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockDb.update.mockResolvedValue(0);

      const result = await rateLimitModel.reset('nonexistent:key');

      expect(result).toBe(false);
    });

    it('should set reset_at exactly 1 hour from now', async () => {
      mockDb.update.mockResolvedValue(1);

      await rateLimitModel.reset('user:123:api');

      const updateCall = mockDb.update.mock.calls[0][0];
      const hourInMs = 1000 * 60 * 60;
      const expectedTime = Date.now() + hourInMs;
      const actualTime = updateCall.reset_at.getTime();

      // Allow 1 second tolerance for execution time
      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(1000);
    });

    it('should always reset count to 0 regardless of previous value', async () => {
      mockDb.update.mockResolvedValue(1);

      await rateLimitModel.reset('user:high-count:api');

      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.current_count).toBe(0);
    });

    it('should return true when rate limit is successfully reset', async () => {
      mockDb.update.mockResolvedValue(1);

      const result = await rateLimitModel.reset('user:456:api');

      expect(result).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete rate limit and return true', async () => {
      mockDb.del.mockResolvedValue(1);

      const result = await rateLimitModel.delete('rl-123');

      expect(mockDb).toHaveBeenCalledWith('rate_limits');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'rl-123' });
      expect(mockDb.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when rate limit does not exist', async () => {
      mockDb.del.mockResolvedValue(0);

      const result = await rateLimitModel.delete('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted (edge case)', async () => {
      mockDb.del.mockResolvedValue(2);

      const result = await rateLimitModel.delete('rl-123');

      expect(result).toBe(true);
    });

    it('should delete by id not by key', async () => {
      mockDb.del.mockResolvedValue(1);

      await rateLimitModel.delete('rl-789');

      // Verify it uses id, not key
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'rl-789' });
      expect(mockDb.where).not.toHaveBeenCalledWith({ key: expect.anything() });
    });
  });
});
