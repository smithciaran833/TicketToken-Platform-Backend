/**
 * Unit Tests for Anti-Bot Model
 * Tests bot detection and activity tracking
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-antibot')
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock constants
jest.mock('../../../src/utils/constants', () => ({
  VELOCITY_CHECK_WINDOW_SECONDS: 60,
  BOT_SCORE_THRESHOLD: 0.7
}));

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { AntiBotModel, antiBotModel } from '../../../src/models/anti-bot.model';
import { logger } from '../../../src/utils/logger';

describe('AntiBotModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('recordActivity', () => {
    it('should record user activity', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      await antiBotModel.recordActivity('user-123', 'purchase');
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-antibot',
          user_id: 'user-123',
          action_type: 'purchase',
          timestamp: expect.any(Date)
        })
      );
    });

    it('should record activity with metadata', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      const metadata = {
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0'
      };
      
      await antiBotModel.recordActivity('user-123', 'listing', metadata);
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          metadata: JSON.stringify(metadata)
        })
      );
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(antiBotModel.recordActivity(
        'user-123',
        'purchase'
      )).rejects.toThrow('Insert failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error recording anti-bot activity:', dbError);
    });
  });

  describe('checkVelocity', () => {
    it('should return count of actions within window', async () => {
      mockDbChain.count.mockResolvedValue([{ count: '5' }]);
      
      const result = await antiBotModel.checkVelocity('user-123', 'purchase');
      
      expect(mockDbChain.where).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockDbChain.where).toHaveBeenCalledWith('action_type', 'purchase');
      expect(mockDbChain.where).toHaveBeenCalledWith('timestamp', '>=', expect.any(Date));
      expect(result).toBe(5);
    });

    it('should use custom window seconds', async () => {
      mockDbChain.count.mockResolvedValue([{ count: '10' }]);
      
      const result = await antiBotModel.checkVelocity('user-123', 'listing', 120);
      
      expect(result).toBe(10);
    });

    it('should return 0 on error', async () => {
      mockDbChain.count.mockRejectedValue(new Error('Query failed'));
      
      const result = await antiBotModel.checkVelocity('user-123', 'purchase');
      
      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error checking velocity:', expect.any(Error));
    });

    it('should use default window from constants', async () => {
      mockDbChain.count.mockResolvedValue([{ count: '3' }]);
      
      const result = await antiBotModel.checkVelocity('user-123', 'purchase');
      
      expect(result).toBe(3);
    });
  });

  describe('calculateBotScore', () => {
    it('should return low score for normal user', async () => {
      // Mock recent activity - minimal activity
      mockDbChain.select.mockResolvedValueOnce([
        { action_type: 'purchase', timestamp: new Date() },
        { action_type: 'listing', timestamp: new Date() }
      ]);
      // Mock violations count
      mockDbChain.count.mockResolvedValue([{ count: '0' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.user_id).toBe('user-123');
      expect(result.is_bot).toBe(false);
      expect(result.factors.velocity_score).toBeDefined();
      expect(result.factors.pattern_score).toBeDefined();
      expect(result.factors.reputation_score).toBeDefined();
      expect(result.checked_at).toBeInstanceOf(Date);
    });

    it('should return high score for suspicious activity', async () => {
      // Mock high activity - many repeated actions
      const highActivity = Array(100).fill(null).map(() => ({
        action_type: 'purchase',
        timestamp: new Date()
      }));
      mockDbChain.select.mockResolvedValueOnce(highActivity);
      // Mock violations
      mockDbChain.count.mockResolvedValue([{ count: '10' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.score).toBeGreaterThan(0);
      expect(result.factors.velocity_score).toBeGreaterThan(0);
      expect(result.factors.pattern_score).toBeGreaterThan(0);
    });

    it('should return safe defaults on error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.user_id).toBe('user-123');
      expect(result.score).toBe(0);
      expect(result.is_bot).toBe(false);
      expect(result.factors.velocity_score).toBe(0);
      expect(result.factors.pattern_score).toBe(0);
      expect(result.factors.reputation_score).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error calculating bot score:', expect.any(Error));
    });

    it('should calculate velocity score based on activity count', async () => {
      // 30 activities in an hour = 0.5 velocity score
      const activities = Array(30).fill(null).map(() => ({
        action_type: 'purchase',
        timestamp: new Date()
      }));
      mockDbChain.select.mockResolvedValueOnce(activities);
      mockDbChain.count.mockResolvedValue([{ count: '0' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.factors.velocity_score).toBe(0.5);
    });

    it('should cap velocity score at 1', async () => {
      // More than 60 activities
      const activities = Array(120).fill(null).map(() => ({
        action_type: 'purchase',
        timestamp: new Date()
      }));
      mockDbChain.select.mockResolvedValueOnce(activities);
      mockDbChain.count.mockResolvedValue([{ count: '0' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.factors.velocity_score).toBe(1);
    });

    it('should calculate pattern score for repetitive actions', async () => {
      // 25 repeated purchase actions
      const activities = Array(25).fill(null).map(() => ({
        action_type: 'purchase',
        timestamp: new Date()
      }));
      mockDbChain.select.mockResolvedValueOnce(activities);
      mockDbChain.count.mockResolvedValue([{ count: '0' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      // pattern_score = min(25/20, 1) = 1
      expect(result.factors.pattern_score).toBe(1);
    });

    it('should set pattern score to 0 for low repetition', async () => {
      // Only 5 actions
      const activities = Array(5).fill(null).map((_, i) => ({
        action_type: ['purchase', 'listing', 'view', 'search', 'favorite'][i],
        timestamp: new Date()
      }));
      mockDbChain.select.mockResolvedValueOnce(activities);
      mockDbChain.count.mockResolvedValue([{ count: '0' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.factors.pattern_score).toBe(0);
    });

    it('should calculate reputation score from violations', async () => {
      mockDbChain.select.mockResolvedValueOnce([]);
      // 3 violations = 0.6 reputation score
      mockDbChain.count.mockResolvedValue([{ count: '3' }]);
      
      const result = await antiBotModel.calculateBotScore('user-123');
      
      expect(result.factors.reputation_score).toBe(0.6);
    });
  });

  describe('flagSuspiciousActivity', () => {
    it('should flag low severity activity', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      await antiBotModel.flagSuspiciousActivity(
        'user-123',
        'Unusual browsing pattern',
        'low'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-antibot',
          user_id: 'user-123',
          reason: 'Unusual browsing pattern',
          severity: 'low',
          flagged_at: expect.any(Date)
        })
      );
    });

    it('should flag medium severity activity', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      await antiBotModel.flagSuspiciousActivity(
        'user-123',
        'High purchase velocity',
        'medium'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'medium'
        })
      );
    });

    it('should flag high severity activity', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      await antiBotModel.flagSuspiciousActivity(
        'user-123',
        'Automated purchasing detected',
        'high'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'high',
          reason: 'Automated purchasing detected'
        })
      );
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(antiBotModel.flagSuspiciousActivity(
        'user-123',
        'Suspicious',
        'high'
      )).rejects.toThrow('Insert failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error flagging suspicious activity:', dbError);
    });
  });

  describe('antiBotModel export', () => {
    it('should export singleton instance', () => {
      expect(antiBotModel).toBeInstanceOf(AntiBotModel);
    });
  });
});
