// =============================================================================
// TEST SUITE - requestLogger.ts
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { requestLogger } from '../../../src/middleware/requestLogger';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger');

describe('requestLogger middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let finishCallback: () => void;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      method: 'GET',
      url: '/api/tickets',
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'Mozilla/5.0';
        return undefined;
      }) as any,
    };

    mockResponse = {
      statusCode: 200,
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
        return mockResponse as Response;
      }),
    };

    mockNext = jest.fn();
  });

  it('should call next immediately', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should register finish event listener', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should log request details on finish', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    finishCallback();

    expect(logger.info).toHaveBeenCalledWith('Request processed', {
      method: 'GET',
      url: '/api/tickets',
      status: 200,
      duration: expect.any(Number),
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('should calculate request duration', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    setTimeout(() => {
      finishCallback();

      const logCall = (logger.info as jest.Mock).mock.calls[0][1];
      expect(logCall.duration).toBeGreaterThanOrEqual(0);
    }, 10);
  });

  it('should handle POST requests', () => {
    mockRequest = {
      ...mockRequest,
      method: 'POST',
      url: '/api/orders',
    };

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
    finishCallback();

    expect(logger.info).toHaveBeenCalledWith('Request processed', {
      method: 'POST',
      url: '/api/orders',
      status: 200,
      duration: expect.any(Number),
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('should handle different status codes', () => {
    mockResponse.statusCode = 404;

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
    finishCallback();

    const logCall = (logger.info as jest.Mock).mock.calls[0][1];
    expect(logCall.status).toBe(404);
  });

  it('should handle missing user agent', () => {
    mockRequest.get = jest.fn(() => undefined) as any;

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
    finishCallback();

    const logCall = (logger.info as jest.Mock).mock.calls[0][1];
    expect(logCall.userAgent).toBeUndefined();
  });

  it('should handle error status codes', () => {
    mockResponse.statusCode = 500;

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
    finishCallback();

    const logCall = (logger.info as jest.Mock).mock.calls[0][1];
    expect(logCall.status).toBe(500);
  });

  it('should not log before finish event', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('should handle multiple requests', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
    finishCallback();

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);
    finishCallback();

    expect(logger.info).toHaveBeenCalledTimes(2);
  });
});
