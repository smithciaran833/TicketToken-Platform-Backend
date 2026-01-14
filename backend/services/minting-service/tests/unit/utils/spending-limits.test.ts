/**
 * Unit Tests for utils/spending-limits.ts
 * 
 * Tests spending limit enforcement for SOL transactions.
 * Priority: 🟠 High (12 tests)
 */

// Mock ioredis before imports
const mockRedisGet = jest.fn();
const mockRedisIncrbyfloat = jest.fn();
const mockRedisExpire = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: mockRedisGet,
    incrbyfloat: mockRedisIncrbyfloat,
    expire: mockRedisExpire,
    del: mockRedisDel,
  }));
});

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import {
  checkSpendingLimits,
  recordSpending,
  getCurrentSpending,
  resetSpending,
  SpendingConfig,
} from '../../../src/utils/spending-limits';

// =============================================================================
// Test Suite
// =============================================================================

describe('Spending Limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no spending yet
    mockRedisGet.mockResolvedValue('0');
    mockRedisIncrbyfloat.mockResolvedValue('0.1');
    mockRedisExpire.mockResolvedValue(1);
    mockRedisDel.mockResolvedValue(1);
  });

  // =============================================================================
  // Configuration Tests
  // =============================================================================

  describe('Configuration', () => {
    it('checkSpendingLimits should read limits from config', () => {
      expect(SpendingConfig).toBeDefined();
      expect(SpendingConfig).toHaveProperty('TX_LIMIT_SOL');
      expect(SpendingConfig).toHaveProperty('DAILY_LIMIT_SOL');
      expect(SpendingConfig).toHaveProperty('HOURLY_LIMIT_SOL');
    });
  });

  // =============================================================================
  // checkSpendingLimits Tests
  // =============================================================================

  describe('checkSpendingLimits', () => {
    it('should check daily limit', async () => {
      // Set daily spending to near the limit
      mockRedisGet.mockImplementation((key: string) => {
        if (key.includes('daily')) return Promise.resolve('9.5');
        return Promise.resolve('0');
      });
      
      // Should pass with small amount
      await expect(checkSpendingLimits(0.1)).resolves.not.toThrow();
      
      // Should fail if it would exceed
      await expect(checkSpendingLimits(1.0)).rejects.toThrow('daily limit');
    });

    it('should check monthly/hourly limit', async () => {
      // Set hourly spending to near the limit
      mockRedisGet.mockImplementation((key: string) => {
        if (key.includes('hourly')) return Promise.resolve('1.9');
        return Promise.resolve('0');
      });
      
      // Should fail if hourly limit would be exceeded
      await expect(checkSpendingLimits(0.5)).rejects.toThrow('hourly limit');
    });

    it('should return allowed=true under limit', async () => {
      mockRedisGet.mockResolvedValue('0');
      
      // Should not throw when under limits
      await expect(checkSpendingLimits(0.1)).resolves.not.toThrow();
    });

    it('should return allowed=false over limit', async () => {
      // Try to spend more than per-tx limit
      const overTxLimit = SpendingConfig.TX_LIMIT_SOL + 1;
      
      await expect(checkSpendingLimits(overTxLimit)).rejects.toThrow('per-transaction limit');
    });

    it('should include which limit was exceeded', async () => {
      mockRedisGet.mockImplementation((key: string) => {
        if (key.includes('daily')) return Promise.resolve('100');
        return Promise.resolve('0');
      });
      
      try {
        await checkSpendingLimits(0.1);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/daily limit/i);
      }
    });
  });

  // =============================================================================
  // recordSpending Tests
  // =============================================================================

  describe('recordSpending', () => {
    it('should increment daily counter', async () => {
      await recordSpending(0.1);
      
      expect(mockRedisIncrbyfloat).toHaveBeenCalled();
      const dailyCall = mockRedisIncrbyfloat.mock.calls.find(
        (call: string[]) => call[0].includes('daily')
      );
      expect(dailyCall).toBeDefined();
    });

    it('should increment hourly counter', async () => {
      await recordSpending(0.1);
      
      const hourlyCall = mockRedisIncrbyfloat.mock.calls.find(
        (call: string[]) => call[0].includes('hourly')
      );
      expect(hourlyCall).toBeDefined();
    });

    it('should set TTL on daily counter', async () => {
      await recordSpending(0.1);
      
      const dailyExpireCall = mockRedisExpire.mock.calls.find(
        (call: any[]) => call[0].includes('daily')
      );
      expect(dailyExpireCall).toBeDefined();
      // Should be around 2 days (172800 seconds)
      expect(dailyExpireCall[1]).toBeGreaterThanOrEqual(86400);
    });

    it('should set TTL on hourly counter', async () => {
      await recordSpending(0.1);
      
      const hourlyExpireCall = mockRedisExpire.mock.calls.find(
        (call: any[]) => call[0].includes('hourly')
      );
      expect(hourlyExpireCall).toBeDefined();
      // Should be around 2 hours (7200 seconds)
      expect(hourlyExpireCall[1]).toBeGreaterThanOrEqual(3600);
    });
  });

  // =============================================================================
  // getCurrentSpending Tests
  // =============================================================================

  describe('getCurrentSpending', () => {
    it('should return current daily spending', async () => {
      mockRedisGet.mockImplementation((key: string) => {
        if (key.includes('daily')) return Promise.resolve('5.5');
        return Promise.resolve('0.5');
      });
      
      const status = await getCurrentSpending();
      
      expect(status.daily).toBe(5.5);
    });

    it('should return current hourly spending', async () => {
      mockRedisGet.mockImplementation((key: string) => {
        if (key.includes('hourly')) return Promise.resolve('0.75');
        return Promise.resolve('0');
      });
      
      const status = await getCurrentSpending();
      
      expect(status.hourly).toBe(0.75);
    });

    it('should return limits and remaining amounts', async () => {
      mockRedisGet.mockResolvedValue('2.0');
      
      const status = await getCurrentSpending();
      
      expect(status).toHaveProperty('dailyLimit');
      expect(status).toHaveProperty('hourlyLimit');
      expect(status).toHaveProperty('txLimit');
      expect(status).toHaveProperty('dailyRemaining');
      expect(status).toHaveProperty('hourlyRemaining');
    });
  });

  // =============================================================================
  // resetSpending Tests
  // =============================================================================

  describe('resetSpending', () => {
    it('should reset spending counters', async () => {
      await resetSpending();
      
      expect(mockRedisDel).toHaveBeenCalled();
      // Should delete both daily and hourly keys
      expect(mockRedisDel.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
