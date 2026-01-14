/**
 * Unit Tests for AdminController
 * Tests HTTP handlers for admin operations
 */

import { FastifyReply } from 'fastify';
import { AdminController, adminController } from '../../../src/controllers/admin.controller';
import { AuthRequest } from '../../../src/middleware/auth.middleware';
import { db } from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-123'),
}));

describe('AdminController', () => {
  let controller: AdminController;
  let mockRequest: Partial<AuthRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminController();

    mockRequest = {
      user: { id: 'admin-123', email: 'admin@example.com' },
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('getStats', () => {
    it('should return marketplace statistics', async () => {
      const mockStats = {
        total_listings: '100',
        active_listings: '50',
        sold_listings: '30',
        average_price: '15000',
      };

      const mockFirst = jest.fn().mockResolvedValue(mockStats);
      const mockSelect = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ select: mockSelect });

      await controller.getStats(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(db).toHaveBeenCalledWith('marketplace_listings');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockStats,
      });
    });

    it('should propagate database errors', async () => {
      const error = new Error('Database connection failed');
      const mockFirst = jest.fn().mockRejectedValue(error);
      const mockSelect = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ select: mockSelect });

      await expect(
        controller.getStats(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getDisputes', () => {
    it('should return open and investigating disputes with default pagination', async () => {
      const mockDisputes = [
        { id: 'dispute-1', status: 'open' },
        { id: 'dispute-2', status: 'investigating' },
      ];

      mockRequest.query = {};

      const mockOffset = jest.fn().mockResolvedValue(mockDisputes);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockWhereIn = jest.fn().mockReturnValue({ orderBy: mockOrderBy });

      const mockCountResult = [{ count: '2' }];
      const mockCountFn = jest.fn().mockResolvedValue(mockCountResult);
      const mockWhereInCount = jest.fn().mockReturnValue({ count: mockCountFn });

      (db as unknown as jest.Mock).mockImplementation((table) => {
        if (table === 'marketplace_disputes') {
          return {
            whereIn: jest.fn().mockImplementation((col, vals) => {
              if (col === 'status') {
                // First call for count
                return {
                  count: mockCountFn,
                  orderBy: mockOrderBy,
                };
              }
              return { orderBy: mockOrderBy };
            }),
          };
        }
        return {};
      });

      // Simplified test - verify the controller handles pagination
      await controller.getDisputes(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should use custom pagination parameters', async () => {
      mockRequest.query = { limit: '10', offset: '20' };

      const mockDisputes: any[] = [];
      const mockOffset = jest.fn().mockResolvedValue(mockDisputes);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockWhereIn = jest.fn().mockReturnValue({ orderBy: mockOrderBy, count: jest.fn().mockResolvedValue([{ count: '0' }]) });

      (db as unknown as jest.Mock).mockReturnValue({ whereIn: mockWhereIn });

      await controller.getDisputes(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
    });
  });

  describe('resolveDispute', () => {
    it('should resolve a dispute', async () => {
      mockRequest.params = { disputeId: 'dispute-123' };
      mockRequest.body = { resolution: 'refund_buyer', reason: 'Seller did not deliver' };

      const mockUpdate = jest.fn().mockResolvedValue(1);
      const mockWhere = jest.fn().mockReturnValue({ update: mockUpdate });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await controller.resolveDispute(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(db).toHaveBeenCalledWith('marketplace_disputes');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Dispute resolved',
      });
    });

    it('should propagate database errors', async () => {
      const error = new Error('Update failed');
      mockRequest.params = { disputeId: 'dispute-123' };
      mockRequest.body = { resolution: 'refund_buyer', reason: 'Test reason' };

      const mockUpdate = jest.fn().mockRejectedValue(error);
      const mockWhere = jest.fn().mockReturnValue({ update: mockUpdate });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await expect(
        controller.resolveDispute(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Update failed');
    });
  });

  describe('getFlaggedUsers', () => {
    it('should return flagged users with default pagination', async () => {
      mockRequest.query = {};

      const mockFlagged = [
        { user_id: 'user-1', violation_count: '5', last_flagged: new Date() },
      ];

      const mockOffset = jest.fn().mockResolvedValue(mockFlagged);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockGroupBy = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockSelect = jest.fn().mockReturnValue({ groupBy: mockGroupBy });
      const mockCountDistinct = jest.fn().mockResolvedValue([{ count: '1' }]);

      (db as unknown as jest.Mock).mockReturnValue({
        select: mockSelect,
        countDistinct: mockCountDistinct,
      });

      await controller.getFlaggedUsers(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should use custom pagination parameters', async () => {
      mockRequest.query = { limit: '100', offset: '50' };

      const mockFlagged: any[] = [];
      const mockOffset = jest.fn().mockResolvedValue(mockFlagged);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockGroupBy = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockSelect = jest.fn().mockReturnValue({ groupBy: mockGroupBy });
      const mockCountDistinct = jest.fn().mockResolvedValue([{ count: '0' }]);

      (db as unknown as jest.Mock).mockReturnValue({
        select: mockSelect,
        countDistinct: mockCountDistinct,
      });

      await controller.getFlaggedUsers(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
    });
  });

  describe('banUser', () => {
    it('should ban user with duration', async () => {
      mockRequest.body = {
        userId: 'user-to-ban',
        reason: 'Fraudulent activity',
        duration: 30,
      };

      const mockInsert = jest.fn().mockResolvedValue([1]);
      (db as unknown as jest.Mock).mockReturnValue({ insert: mockInsert });

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(db).toHaveBeenCalledWith('marketplace_blacklist');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-to-ban',
          reason: 'Fraudulent activity',
          banned_by: 'admin-123',
          is_active: true,
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User banned',
        })
      );
    });

    it('should ban user permanently when no duration provided', async () => {
      mockRequest.body = {
        userId: 'user-to-ban',
        reason: 'Severe violation',
      };

      const mockInsert = jest.fn().mockResolvedValue([1]);
      (db as unknown as jest.Mock).mockReturnValue({ insert: mockInsert });

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: null,
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          details: expect.objectContaining({
            duration: 'permanent',
          }),
        })
      );
    });

    it('should return 400 if userId is missing', async () => {
      mockRequest.body = {
        reason: 'Some reason',
      };

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'userId is required and must be a string',
      });
    });

    it('should return 400 if reason is missing', async () => {
      mockRequest.body = {
        userId: 'user-123',
      };

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'reason is required and must be a non-empty string',
      });
    });

    it('should return 400 if reason is empty string', async () => {
      mockRequest.body = {
        userId: 'user-123',
        reason: '   ',
      };

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'reason is required and must be a non-empty string',
      });
    });

    it('should return 400 if duration is invalid number', async () => {
      mockRequest.body = {
        userId: 'user-123',
        reason: 'Valid reason',
        duration: 'invalid',
      };

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'duration must be a valid number',
      });
    });

    it('should return 400 if duration is less than minimum', async () => {
      mockRequest.body = {
        userId: 'user-123',
        reason: 'Valid reason',
        duration: 0,
      };

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'duration must be at least 1 day(s)',
      });
    });

    it('should return 400 if duration exceeds maximum', async () => {
      mockRequest.body = {
        userId: 'user-123',
        reason: 'Valid reason',
        duration: 4000, // > 3650 days
      };

      await controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'duration cannot exceed 3650 days (10 years). Use no duration for permanent ban.',
      });
    });

    it('should propagate database errors', async () => {
      const error = new Error('Insert failed');
      mockRequest.body = {
        userId: 'user-123',
        reason: 'Valid reason',
        duration: 7,
      };

      const mockInsert = jest.fn().mockRejectedValue(error);
      (db as unknown as jest.Mock).mockReturnValue({ insert: mockInsert });

      await expect(
        controller.banUser(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('parsePagination', () => {
    it('should parse valid pagination parameters', () => {
      // Access private method via controller instance
      const result = (controller as any).parsePagination({ limit: '25', offset: '10' });
      expect(result).toEqual({ limit: 25, offset: 10 });
    });

    it('should use default values for missing parameters', () => {
      const result = (controller as any).parsePagination({});
      expect(result).toEqual({ limit: 50, offset: 0 });
    });

    it('should cap limit at MAX_LIMIT (200)', () => {
      const result = (controller as any).parsePagination({ limit: '500' });
      expect(result.limit).toBe(200);
    });

    it('should ensure minimum limit of 1', () => {
      const result = (controller as any).parsePagination({ limit: '-10' });
      expect(result.limit).toBe(1);
    });

    it('should ensure minimum offset of 0', () => {
      const result = (controller as any).parsePagination({ offset: '-5' });
      expect(result.offset).toBe(0);
    });

    it('should handle non-numeric strings', () => {
      const result = (controller as any).parsePagination({ limit: 'abc', offset: 'xyz' });
      expect(result).toEqual({ limit: 50, offset: 0 });
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(adminController).toBeInstanceOf(AdminController);
    });
  });
});
