/**
 * Unit Tests for Blacklist Model
 * Tests marketplace blacklist database operations
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-blacklist')
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

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { BlacklistModel, blacklistModel } from '../../../src/models/blacklist.model';
import { logger } from '../../../src/utils/logger';

describe('BlacklistModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('addToBlacklist', () => {
    it('should add user to blacklist', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await blacklistModel.addToBlacklist(
        { user_id: 'user-123' },
        'Fraudulent activity',
        'admin-456'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-blacklist',
          user_id: 'user-123',
          reason: 'Fraudulent activity',
          banned_by: 'admin-456',
          banned_at: expect.any(Date),
          is_active: true
        })
      );
      expect(result.id).toBe('test-uuid-blacklist');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Added to blacklist'));
    });

    it('should add wallet address to blacklist', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await blacklistModel.addToBlacklist(
        { wallet_address: 'wallet123abc' },
        'Suspicious wallet',
        'admin-456'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet_address: 'wallet123abc'
        })
      );
      expect(result.wallet_address).toBe('wallet123abc');
    });

    it('should add with expiration duration', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await blacklistModel.addToBlacklist(
        { user_id: 'user-123' },
        'Temporary ban',
        'admin-456',
        30 // 30 days
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expect.any(Date)
        })
      );
      expect(result.expires_at).toBeDefined();
    });

    it('should add permanent ban without expiration', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await blacklistModel.addToBlacklist(
        { user_id: 'user-123' },
        'Permanent ban',
        'admin-456'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({
          expires_at: expect.any(Date)
        })
      );
      expect(result.expires_at).toBeUndefined();
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(blacklistModel.addToBlacklist(
        { user_id: 'user-123' },
        'Reason',
        'admin-456'
      )).rejects.toThrow('Insert failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error adding to blacklist:', dbError);
    });
  });

  describe('removeFromBlacklist', () => {
    it('should remove user from blacklist by user_id', async () => {
      mockDbChain.update.mockResolvedValue(1);
      
      await blacklistModel.removeFromBlacklist({ user_id: 'user-123' });
      
      expect(mockDbChain.where).toHaveBeenCalledWith('is_active', true);
      expect(mockDbChain.where).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockDbChain.update).toHaveBeenCalledWith({ is_active: false });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Removed from blacklist'));
    });

    it('should remove wallet from blacklist', async () => {
      mockDbChain.update.mockResolvedValue(1);
      
      await blacklistModel.removeFromBlacklist({ wallet_address: 'wallet123' });
      
      expect(mockDbChain.where).toHaveBeenCalledWith('wallet_address', 'wallet123');
      expect(mockDbChain.update).toHaveBeenCalledWith({ is_active: false });
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Update failed');
      mockDbChain.update.mockRejectedValue(dbError);
      
      await expect(blacklistModel.removeFromBlacklist(
        { user_id: 'user-123' }
      )).rejects.toThrow('Update failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error removing from blacklist:', dbError);
    });
  });

  describe('isBlacklisted', () => {
    it('should return true for active blacklisted user', async () => {
      const mockEntry = {
        id: 'entry-123',
        user_id: 'user-123',
        is_active: true,
        expires_at: null
      };
      mockDbChain.select.mockResolvedValue([mockEntry]);
      
      // Mock the where callback
      mockDbChain.where.mockImplementation((arg) => {
        if (typeof arg === 'function') {
          arg.call({
            orWhere: jest.fn().mockReturnThis()
          });
        }
        return mockDbChain;
      });
      
      const result = await blacklistModel.isBlacklisted({ user_id: 'user-123' });
      
      expect(result).toBe(true);
    });

    it('should return false for non-blacklisted user', async () => {
      mockDbChain.select.mockResolvedValue([]);
      mockDbChain.where.mockImplementation((arg) => {
        if (typeof arg === 'function') {
          arg.call({ orWhere: jest.fn().mockReturnThis() });
        }
        return mockDbChain;
      });
      
      const result = await blacklistModel.isBlacklisted({ user_id: 'user-123' });
      
      expect(result).toBe(false);
    });

    it('should deactivate expired entries', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10); // 10 days ago
      
      const mockEntry = {
        id: 'entry-123',
        user_id: 'user-123',
        is_active: true,
        expires_at: pastDate
      };
      mockDbChain.select.mockResolvedValue([mockEntry]);
      mockDbChain.where.mockImplementation((arg) => {
        if (typeof arg === 'function') {
          arg.call({ orWhere: jest.fn().mockReturnThis() });
        }
        return mockDbChain;
      });
      mockDbChain.update.mockResolvedValue(1);
      
      const result = await blacklistModel.isBlacklisted({ user_id: 'user-123' });
      
      expect(mockDbChain.where).toHaveBeenCalledWith('id', 'entry-123');
      expect(mockDbChain.update).toHaveBeenCalledWith({ is_active: false });
      expect(result).toBe(false);
    });

    it('should check by wallet address', async () => {
      mockDbChain.select.mockResolvedValue([]);
      mockDbChain.where.mockImplementation((arg) => {
        if (typeof arg === 'function') {
          arg.call({ orWhere: jest.fn().mockReturnThis() });
        }
        return mockDbChain;
      });
      
      await blacklistModel.isBlacklisted({ wallet_address: 'wallet123' });
      
      expect(mockDbChain.where).toHaveBeenCalled();
    });

    it('should return false on database error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      mockDbChain.where.mockImplementation((arg) => {
        if (typeof arg === 'function') {
          arg.call({ orWhere: jest.fn().mockReturnThis() });
        }
        return mockDbChain;
      });
      
      const result = await blacklistModel.isBlacklisted({ user_id: 'user-123' });
      
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Error checking blacklist:', expect.any(Error));
    });
  });

  describe('getBlacklistHistory', () => {
    it('should return history by user_id', async () => {
      const history = [
        { id: 'entry-1', user_id: 'user-123', banned_at: new Date('2024-01-01') },
        { id: 'entry-2', user_id: 'user-123', banned_at: new Date('2024-02-01') }
      ];
      mockDbChain.select.mockResolvedValue(history);
      
      const result = await blacklistModel.getBlacklistHistory({ user_id: 'user-123' });
      
      expect(mockDbChain.where).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('banned_at', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return history by wallet_address', async () => {
      mockDbChain.select.mockResolvedValue([]);
      
      await blacklistModel.getBlacklistHistory({ wallet_address: 'wallet123' });
      
      expect(mockDbChain.where).toHaveBeenCalledWith('wallet_address', 'wallet123');
    });

    it('should return empty array on error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      
      const result = await blacklistModel.getBlacklistHistory({ user_id: 'user-123' });
      
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Error getting blacklist history:', expect.any(Error));
    });
  });

  describe('blacklistModel export', () => {
    it('should export singleton instance', () => {
      expect(blacklistModel).toBeInstanceOf(BlacklistModel);
    });
  });
});
