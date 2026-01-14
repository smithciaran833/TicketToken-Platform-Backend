import { logger, logError, logRequest, logResponse } from '../../../src/utils/logger';

// Mock the PIISanitizer
jest.mock('@tickettoken/shared', () => ({
  PIISanitizer: {
    sanitize: jest.fn((data) => data),
    sanitizeRequest: jest.fn((req) => ({
      method: req.method,
      url: req.url,
    })),
  },
}));

describe('Logger Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have standard log methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('logError', () => {
    it('should log error with message', () => {
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');

      logError('Something went wrong', error);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        expect.objectContaining({
          error: expect.any(Object),
        })
      );
    });

    it('should include metadata when provided', () => {
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');
      const meta = { userId: 'user-123' };

      logError('Error occurred', error, meta);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          error: expect.any(Object),
          userId: 'user-123',
        })
      );
    });
  });

  describe('logRequest', () => {
    it('should log request information', () => {
      const loggerInfoSpy = jest.spyOn(logger, 'info');
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
      };

      logRequest(req);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Request received',
        expect.objectContaining({
          request: expect.any(Object),
        })
      );
    });

    it('should include metadata when provided', () => {
      const loggerInfoSpy = jest.spyOn(logger, 'info');
      const req = {
        method: 'POST',
        url: '/api/login',
      };
      const meta = { ipAddress: '192.168.1.1' };

      logRequest(req, meta);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Request received',
        expect.objectContaining({
          request: expect.any(Object),
          ipAddress: '192.168.1.1',
        })
      );
    });
  });

  describe('logResponse', () => {
    it('should log response information', () => {
      const loggerInfoSpy = jest.spyOn(logger, 'info');
      const req = {
        method: 'GET',
        url: '/api/users',
      };
      const res = {
        statusCode: 200,
      };

      logResponse(req, res);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Response sent',
        expect.objectContaining({
          request: {
            method: 'GET',
            url: '/api/users',
          },
          response: expect.any(Object),
        })
      );
    });

    it('should include response body when provided', () => {
      const loggerInfoSpy = jest.spyOn(logger, 'info');
      const req = {
        method: 'POST',
        url: '/api/login',
      };
      const res = {
        statusCode: 200,
      };
      const body = { success: true };

      logResponse(req, res, body);

      expect(loggerInfoSpy).toHaveBeenCalled();
    });
  });
});
