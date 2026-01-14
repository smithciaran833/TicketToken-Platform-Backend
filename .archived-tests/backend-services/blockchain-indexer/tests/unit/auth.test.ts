import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJWT } from '../../src/middleware/auth';
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');
jest.mock('../../src/utils/logger');

describe('Authentication Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let codeSpy: jest.Mock;
  let sendSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    sendSpy = jest.fn();
    codeSpy = jest.fn().mockReturnValue({ send: sendSpy });
    
    mockRequest = {
      headers: {}
    };
    
    mockReply = {
      code: codeSpy
    } as any;

    process.env.JWT_SECRET = 'test-secret';
  });

  describe('verifyJWT', () => {
    it('should return 401 if no authorization header is provided', async () => {
      mockRequest.headers = {};

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(401);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authorization header provided'
      });
    });

    it('should return 401 if authorization header is malformed', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token123'
      };

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(401);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    });

    it('should return 401 if token is missing', async () => {
      mockRequest.headers = {
        authorization: 'Bearer '
      };

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(401);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    });

    it('should return 500 if JWT_SECRET is not configured', async () => {
      delete process.env.JWT_SECRET;
      
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(500);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Server configuration error'
      });
    });

    it('should return 401 if token is expired', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(401);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token expired'
      });
    });

    it('should return 401 if token is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(401);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    });

    it('should set request.user if token is valid', async () => {
      const mockPayload = {
        userId: 'user-123',
        serviceId: 'service-456'
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(mockRequest.user).toEqual(mockPayload);
      expect(codeSpy).not.toHaveBeenCalled();
    });

    it('should handle generic JWT errors', async () => {
      mockRequest.headers = {
        authorization: 'Bearer bad-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Generic JWT error');
      });

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(401);
      expect(sendSpy).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
    });

    it('should extract Bearer token correctly', async () => {
      const mockPayload = { userId: 'test-user' };
      
      mockRequest.headers = {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      await verifyJWT(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'test-secret'
      );
    });
  });
});
