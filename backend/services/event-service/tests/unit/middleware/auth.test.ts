import { authenticateFastify, authenticate } from '../../../src/middleware/auth';
import { FastifyRequest, FastifyReply } from 'fastify';

jest.mock('@tickettoken/shared', () => ({
  createAxiosInstance: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

import { createAxiosInstance } from '@tickettoken/shared';

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockAuthService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockAuthService = {
      get: jest.fn(),
    };

    (createAxiosInstance as jest.Mock).mockReturnValue(mockAuthService);
  });

  describe('authenticateFastify', () => {
    it('should return 401 if no token provided', async () => {
      await authenticateFastify(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should authenticate valid token', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.get.mockResolvedValue({
        data: {
          user: {
            sub: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      await authenticateFastify(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuthService.get).toHaveBeenCalledWith('/auth/verify', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect((mockRequest as any).user).toEqual({
        sub: 'user-123',
        email: 'test@example.com',
        id: 'user-123',
      });
    });

    it('should return 401 for invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      mockAuthService.get.mockRejectedValue(new Error('Invalid token'));

      await authenticateFastify(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should map sub to id if id not present', async () => {
      mockRequest.headers = { authorization: 'Bearer token' };
      mockAuthService.get.mockResolvedValue({
        data: {
          user: {
            sub: 'user-456',
          },
        },
      });

      await authenticateFastify(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user.id).toBe('user-456');
    });
  });

  describe('authenticate (Express)', () => {
    let mockExpressReq: any;
    let mockExpressRes: any;
    let mockNext: jest.Mock;

    beforeEach(() => {
      mockExpressReq = {
        headers: {},
      };

      mockExpressRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      mockNext = jest.fn();
    });

    it('should return 401 if no token provided', async () => {
      await authenticate(mockExpressReq, mockExpressRes, mockNext);

      expect(mockExpressRes.status).toHaveBeenCalledWith(401);
      expect(mockExpressRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should authenticate valid token and call next', async () => {
      mockExpressReq.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.get.mockResolvedValue({
        data: {
          user: {
            sub: 'user-789',
            email: 'express@example.com',
          },
        },
      });

      await authenticate(mockExpressReq, mockExpressRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockExpressReq.user.id).toBe('user-789');
    });

    it('should return 401 for invalid token', async () => {
      mockExpressReq.headers = { authorization: 'Bearer invalid' };
      mockAuthService.get.mockRejectedValue(new Error('Invalid'));

      await authenticate(mockExpressReq, mockExpressRes, mockNext);

      expect(mockExpressRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
