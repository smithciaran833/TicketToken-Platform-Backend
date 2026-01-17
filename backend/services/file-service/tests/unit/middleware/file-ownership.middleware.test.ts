/**
 * Unit Tests for File Ownership Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifyFileOwnership,
  verifyFileModifyPermission,
} from '../../../src/middleware/file-ownership.middleware';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    first: jest.fn(),
    select: jest.fn().mockReturnThis(),
  })),
}));

describe('middleware/file-ownership', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = require('../../../src/config/database').db;

    mockRequest = {
      params: { fileId: 'file-123' },
      user: undefined,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;
  });

  describe('verifyFileOwnership', () => {
    it('should allow access when user owns the file', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-123',
        is_public: false,
        access_level: 'private',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).file).toEqual(mockFile);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow access to public files', async () => {
      (mockRequest as any).user = { id: 'user-456' };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-123',
        is_public: true,
        access_level: 'public',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).file).toEqual(mockFile);
    });

    it('should allow access when access_level is public', async () => {
      (mockRequest as any).user = { id: 'user-789' };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-123',
        is_public: false,
        access_level: 'public',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).file).toEqual(mockFile);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should deny access to private files for non-owners', async () => {
      (mockRequest as any).user = { id: 'user-456' };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-123',
        is_public: false,
        access_level: 'private',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: 'You do not have permission to access this file',
        })
      );
    });

    it('should return 401 when no user context', async () => {
      mockRequest.user = undefined;

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
        })
      );
    });

    it('should return 404 when file not found', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not Found',
        })
      );
    });

    it('should return 500 on database error', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      await verifyFileOwnership(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('verifyFileModifyPermission', () => {
    it('should allow file owner to modify', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-123',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileModifyPermission(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).file).toEqual(mockFile);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow admin to modify any file', async () => {
      (mockRequest as any).user = {
        id: 'admin-123',
        roles: ['admin'],
      };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-456',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileModifyPermission(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).file).toEqual(mockFile);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow user with isAdmin flag to modify', async () => {
      (mockRequest as any).user = {
        id: 'admin-123',
        isAdmin: true,
      };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-456',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileModifyPermission(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).file).toEqual(mockFile);
    });

    it('should deny non-owner non-admin from modifying', async () => {
      (mockRequest as any).user = { id: 'user-456' };

      const mockFile = {
        id: 'file-123',
        uploaded_by: 'user-123',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
      });

      await verifyFileModifyPermission(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: 'Only the file owner can modify this file',
        })
      );
    });

    it('should return 401 when no user context', async () => {
      mockRequest.user = undefined;

      await verifyFileModifyPermission(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when file not found', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      await verifyFileModifyPermission(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});
