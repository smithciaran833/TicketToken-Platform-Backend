import { authMiddleware } from '../../../src/middleware/auth.middleware';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      headers: {},
      user: undefined
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  describe('authenticate', () => {
    it('should authenticate valid token', () => {
      const token = 'valid.jwt.token';
      const decoded = { userId: '123', email: 'test@example.com' };
      
      req.headers = { authorization: `Bearer ${token}` };
      (jwt.verify as jest.Mock).mockReturnValue(decoded);

      authMiddleware(req as Request, res as Response, next);

      expect(jwt.verify).toHaveBeenCalledWith(token, expect.any(String));
      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });

    it('should reject missing token', () => {
      req.headers = {};

      authMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', () => {
      req.headers = { authorization: 'InvalidFormat' };

      authMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject expired token', () => {
      const token = 'expired.jwt.token';
      req.headers = { authorization: `Bearer ${token}` };
      
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      authMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('expired') })
      );
    });

    it('should reject malformed token', () => {
      const token = 'malformed.token';
      req.headers = { authorization: `Bearer ${token}` };
      
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      authMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('optional authentication', () => {
    it('should continue without user if no token provided', () => {
      const optionalAuth = authMiddleware.optional;
      req.headers = {};

      optionalAuth(req as Request, res as Response, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should authenticate if token provided', () => {
      const optionalAuth = authMiddleware.optional;
      const token = 'valid.jwt.token';
      const decoded = { userId: '123' };
      
      req.headers = { authorization: `Bearer ${token}` };
      (jwt.verify as jest.Mock).mockReturnValue(decoded);

      optionalAuth(req as Request, res as Response, next);

      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('role-based authorization', () => {
    it('should allow access with required role', () => {
      const requireRole = authMiddleware.requireRole('admin');
      req.user = { userId: '123', roles: ['admin', 'user'] };

      requireRole(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access without required role', () => {
      const requireRole = authMiddleware.requireRole('admin');
      req.user = { userId: '123', roles: ['user'] };

      requireRole(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('permission') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access if no user authenticated', () => {
      const requireRole = authMiddleware.requireRole('admin');
      req.user = undefined;

      requireRole(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('permission checks', () => {
    it('should allow access with required permission', () => {
      const requirePermission = authMiddleware.requirePermission('files:write');
      req.user = { 
        userId: '123', 
        permissions: ['files:read', 'files:write'] 
      };

      requirePermission(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access without required permission', () => {
      const requirePermission = authMiddleware.requirePermission('files:delete');
      req.user = { 
        userId: '123', 
        permissions: ['files:read', 'files:write'] 
      };

      requirePermission(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('API key authentication', () => {
    it('should authenticate valid API key', () => {
      const apiKeyAuth = authMiddleware.apiKey;
      req.headers = { 'x-api-key': 'valid-api-key-123' };

      apiKeyAuth(req as Request, res as Response, next);

      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid API key', () => {
      const apiKeyAuth = authMiddleware.apiKey;
      req.headers = { 'x-api-key': 'invalid-key' };

      apiKeyAuth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject missing API key', () => {
      const apiKeyAuth = authMiddleware.apiKey;
      req.headers = {};

      apiKeyAuth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('token refresh', () => {
    it('should allow refresh with valid refresh token', () => {
      const refreshToken = 'valid.refresh.token';
      const decoded = { userId: '123', type: 'refresh' };
      
      req.body = { refreshToken };
      (jwt.verify as jest.Mock).mockReturnValue(decoded);

      authMiddleware.refresh(req as Request, res as Response, next);

      expect(jwt.verify).toHaveBeenCalledWith(refreshToken, expect.any(String));
      expect(next).toHaveBeenCalled();
    });

    it('should reject expired refresh token', () => {
      req.body = { refreshToken: 'expired.token' };
      
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      authMiddleware.refresh(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
