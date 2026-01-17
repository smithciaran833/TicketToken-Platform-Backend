/**
 * Base Controller Unit Tests
 */

import { FastifyReply } from 'fastify';
import { BaseController } from '../../../src/controllers/base.controller';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('BaseController', () => {
  let controller: BaseController;
  let mockReply: any;

  beforeEach(() => {
    controller = new BaseController();
    
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('success', () => {
    it('should return success response with 200 status by default', () => {
      const data = { message: 'Success' };
      
      controller['success'](mockReply, data);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data,
      });
    });

    it('should return success response with custom status code', () => {
      const data = { id: '123' };
      
      controller['success'](mockReply, data, 201);

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data,
      });
    });

    it('should handle null data', () => {
      controller['success'](mockReply, null);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: null,
      });
    });

    it('should handle empty object data', () => {
      controller['success'](mockReply, {});

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {},
      });
    });
  });

  describe('handleError', () => {
    it('should handle error with statusCode', () => {
      const error = {
        statusCode: 400,
        message: 'Bad Request',
      };

      controller['handleError'](error, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Bad Request',
          statusCode: 400,
        },
      });
    });

    it('should default to 500 for errors without statusCode', () => {
      const error = new Error('Something went wrong');

      controller['handleError'](error, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Something went wrong',
          statusCode: 500,
        },
      });
    });

    it('should handle error without message', () => {
      const error = {};

      controller['handleError'](error, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal Server Error',
          statusCode: 500,
        },
      });
    });

    it('should handle string errors', () => {
      controller['handleError']('String error', mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('notFound', () => {
    it('should return 404 with default message', () => {
      controller['notFound'](mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Not found',
          statusCode: 404,
        },
      });
    });

    it('should return 404 with custom message', () => {
      controller['notFound'](mockReply, 'Resource not found');

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Resource not found',
          statusCode: 404,
        },
      });
    });
  });

  describe('badRequest', () => {
    it('should return 400 with default message', () => {
      controller['badRequest'](mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Bad request',
          statusCode: 400,
        },
      });
    });

    it('should return 400 with custom message', () => {
      controller['badRequest'](mockReply, 'Invalid input');

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid input',
          statusCode: 400,
        },
      });
    });
  });

  describe('unauthorized', () => {
    it('should return 401 with default message', () => {
      controller['unauthorized'](mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Unauthorized',
          statusCode: 401,
        },
      });
    });

    it('should return 401 with custom message', () => {
      controller['unauthorized'](mockReply, 'Invalid token');

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid token',
          statusCode: 401,
        },
      });
    });
  });

  describe('forbidden', () => {
    it('should return 403 with default message', () => {
      controller['forbidden'](mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Forbidden',
          statusCode: 403,
        },
      });
    });

    it('should return 403 with custom message', () => {
      controller['forbidden'](mockReply, 'Insufficient permissions');

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Insufficient permissions',
          statusCode: 403,
        },
      });
    });
  });

  describe('Chaining', () => {
    it('should allow method chaining', () => {
      const result = controller['success'](mockReply, { test: true });

      expect(result).toBe(mockReply);
    });

    it('should allow error method chaining', () => {
      const result = controller['notFound'](mockReply, 'Not found');

      expect(result).toBe(mockReply);
    });
  });
});
