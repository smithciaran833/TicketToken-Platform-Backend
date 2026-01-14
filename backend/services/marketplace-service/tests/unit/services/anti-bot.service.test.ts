/**
 * Unit Tests for anti-bot.service.ts
 * Tests velocity checking, bot detection, and rate limiting
 */

import { antiBotService, AntiBotService } from '../../../src/services/anti-bot.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/models/anti-bot.model', () => ({
  antiBotModel: {
    checkVelocity: jest.fn(),
    flagSuspiciousActivity: jest.fn(),
    calculateBotScore: jest.fn(),
    recordActivity: jest.fn(),
  },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../../../src/utils/constants', () => ({
  MAX_PURCHASES_PER_HOUR: 10,
  MAX_LISTINGS_PER_DAY: 20,
  VELOCITY_CHECK_WINDOW_SECONDS: 60,
  BOT_SCORE_THRESHOLD: 0.8,
}));

import { antiBotModel } from '../../../src/models/anti-bot.model';
import { cache } from '../../../src/services/cache-integration';

describe('AntiBotService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkPurchaseVelocity', () => {
    it('should allow purchase when under velocity limit', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockResolvedValue(5);

      const result = await antiBotService.checkPurchaseVelocity('user-123');

      expect(result).toBe(true);
      expect(antiBotModel.checkVelocity).toHaveBeenCalledWith('user-123', 'purchase', 3600);
    });

    it('should deny purchase when at velocity limit', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockResolvedValue(10);

      const result = await antiBotService.checkPurchaseVelocity('user-123');

      expect(result).toBe(false);
      expect(antiBotModel.flagSuspiciousActivity).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Exceeded purchase velocity'),
        'high'
      );
    });

    it('should deny purchase when over velocity limit', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockResolvedValue(15);

      const result = await antiBotService.checkPurchaseVelocity('user-123');

      expect(result).toBe(false);
    });

    it('should allow on error (fail open)', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await antiBotService.checkPurchaseVelocity('user-123');

      expect(result).toBe(true);
    });
  });

  describe('checkListingVelocity', () => {
    it('should allow listing when under velocity limit', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockResolvedValue(10);

      const result = await antiBotService.checkListingVelocity('user-123');

      expect(result).toBe(true);
      expect(antiBotModel.checkVelocity).toHaveBeenCalledWith('user-123', 'listing_created', 86400);
    });

    it('should deny listing when at velocity limit', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockResolvedValue(20);

      const result = await antiBotService.checkListingVelocity('user-123');

      expect(result).toBe(false);
      expect(antiBotModel.flagSuspiciousActivity).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Exceeded listing velocity'),
        'medium'
      );
    });

    it('should allow on error (fail open)', async () => {
      (antiBotModel.checkVelocity as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await antiBotService.checkListingVelocity('user-123');

      expect(result).toBe(true);
    });
  });

  describe('analyzeUserPattern', () => {
    it('should return bot score for user', async () => {
      const mockBotScore = {
        score: 0.3,
        is_bot: false,
        factors: {},
      };
      (antiBotModel.calculateBotScore as jest.Mock).mockResolvedValue(mockBotScore);

      const result = await antiBotService.analyzeUserPattern('user-123');

      expect(result).toEqual(mockBotScore);
    });

    it('should cache bot detection when flagged as bot', async () => {
      const mockBotScore = {
        score: 0.9,
        is_bot: true,
        factors: { rapid_requests: true },
      };
      (antiBotModel.calculateBotScore as jest.Mock).mockResolvedValue(mockBotScore);

      await antiBotService.analyzeUserPattern('user-123');

      expect(cache.set).toHaveBeenCalledWith(
        'bot_detection:user-123',
        JSON.stringify(mockBotScore),
        { ttl: 3600 }
      );
    });

    it('should not cache when not a bot', async () => {
      const mockBotScore = {
        score: 0.3,
        is_bot: false,
        factors: {},
      };
      (antiBotModel.calculateBotScore as jest.Mock).mockResolvedValue(mockBotScore);

      await antiBotService.analyzeUserPattern('user-123');

      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      (antiBotModel.calculateBotScore as jest.Mock).mockRejectedValue(new Error('Error'));

      const result = await antiBotService.analyzeUserPattern('user-123');

      expect(result).toBeNull();
    });
  });

  describe('enforceRateLimit', () => {
    it('should allow first request for action', async () => {
      (cache.get as jest.Mock).mockResolvedValue(null);
      (antiBotModel.recordActivity as jest.Mock).mockResolvedValue(undefined);

      const result = await antiBotService.enforceRateLimit('user-123', 'api_call');

      expect(result).toBe(true);
      expect(cache.set).toHaveBeenCalledWith(
        'rate_limit:user-123:api_call',
        '1',
        { ttl: 60 }
      );
    });

    it('should allow request when under limit', async () => {
      (cache.get as jest.Mock).mockResolvedValue('50');
      (antiBotModel.recordActivity as jest.Mock).mockResolvedValue(undefined);

      const result = await antiBotService.enforceRateLimit('user-123', 'api_call');

      expect(result).toBe(true);
      expect(cache.set).toHaveBeenCalledWith(
        'rate_limit:user-123:api_call',
        '51',
        { ttl: 60 }
      );
    });

    it('should deny request when at limit', async () => {
      (cache.get as jest.Mock).mockResolvedValue('100');

      const result = await antiBotService.enforceRateLimit('user-123', 'api_call');

      expect(result).toBe(false);
    });

    it('should use action-specific limits', async () => {
      (cache.get as jest.Mock).mockResolvedValue('10');

      const result = await antiBotService.enforceRateLimit('user-123', 'purchase_attempt');

      expect(result).toBe(false); // limit is 10 for purchase_attempt
    });

    it('should allow on error (fail open)', async () => {
      (cache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const result = await antiBotService.enforceRateLimit('user-123', 'api_call');

      expect(result).toBe(true);
    });

    it('should record activity on successful rate check', async () => {
      (cache.get as jest.Mock).mockResolvedValue('5');

      await antiBotService.enforceRateLimit('user-123', 'search');

      expect(antiBotModel.recordActivity).toHaveBeenCalledWith('user-123', 'search');
    });
  });

  describe('isUserBlocked', () => {
    it('should return true when user is cached as blocked', async () => {
      (cache.get as jest.Mock).mockResolvedValue('true');

      const result = await antiBotService.isUserBlocked('user-123');

      expect(result).toBe(true);
      expect(antiBotModel.calculateBotScore).not.toHaveBeenCalled();
    });

    it('should check bot score when not cached', async () => {
      (cache.get as jest.Mock).mockResolvedValue(null);
      (antiBotModel.calculateBotScore as jest.Mock).mockResolvedValue({
        score: 0.5,
        is_bot: false,
      });

      const result = await antiBotService.isUserBlocked('user-123');

      expect(result).toBe(false);
      expect(antiBotModel.calculateBotScore).toHaveBeenCalledWith('user-123');
    });

    it('should block user with high bot score', async () => {
      (cache.get as jest.Mock).mockResolvedValue(null);
      (antiBotModel.calculateBotScore as jest.Mock).mockResolvedValue({
        score: 0.9,
        is_bot: true,
      });

      const result = await antiBotService.isUserBlocked('user-123');

      expect(result).toBe(true);
      expect(cache.set).toHaveBeenCalledWith('user_blocked:user-123', 'true', { ttl: 3600 });
    });

    it('should return false on error', async () => {
      (cache.get as jest.Mock).mockRejectedValue(new Error('Error'));

      const result = await antiBotService.isUserBlocked('user-123');

      expect(result).toBe(false);
    });
  });

  describe('Class export', () => {
    it('should export class constructor', () => {
      expect(AntiBotService).toBeDefined();
    });
  });
});
