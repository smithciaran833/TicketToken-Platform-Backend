// =============================================================================
// TEST SUITE - logger
// =============================================================================

import winston from 'winston';
import { logger, createLogger, logError, logRequest } from '../../../src/utils/logger';
import { PIISanitizer } from '@tickettoken/shared';

jest.mock('winston', () => {
  const mFormat = {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
  };
  
  const mTransports = {
    Console: jest.fn(),
  };

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };

  return {
    format: mFormat,
    transports: mTransports,
    createLogger: jest.fn(() => mockLogger),
  };
});

jest.mock('@tickettoken/shared', () => ({
  PIISanitizer: {
    sanitize: jest.fn((data) => data),
    sanitizeRequest: jest.fn((req) => req),
  },
}));

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should create winston logger', () => {
      expect(winston.createLogger).toHaveBeenCalled();
    });
  });

  describe('createLogger()', () => {
    it('should create child logger with component', () => {
      const childLogger = createLogger('test-component');

      expect(logger.child).toHaveBeenCalledWith({ component: 'test-component' });
    });

    it('should return logger instance', () => {
      const childLogger = createLogger('test');

      expect(childLogger).toBeDefined();
    });
  });

  describe('logError()', () => {
    it('should log error with message', () => {
      const error = new Error('Test error');
      
      logError('Something went wrong', error);

      expect(logger.error).toHaveBeenCalledWith(
        'Something went wrong',
        expect.objectContaining({
          error,
        })
      );
    });

    it('should sanitize error data', () => {
      const error = new Error('Test error');
      
      logError('Error occurred', error, { userId: 'user-123' });

      expect(PIISanitizer.sanitize).toHaveBeenCalled();
    });

    it('should include metadata', () => {
      const error = new Error('Test error');
      const meta = { requestId: 'req-123' };
      
      logError('Error', error, meta);

      expect(logger.error).toHaveBeenCalledWith(
        'Error',
        expect.objectContaining(meta)
      );
    });
  });

  describe('logRequest()', () => {
    it('should log request', () => {
      const req = {
        method: 'GET',
        url: '/api/tickets',
        headers: {},
      };
      
      logRequest(req);

      expect(logger.info).toHaveBeenCalledWith(
        'Request received',
        expect.objectContaining({
          request: req,
        })
      );
    });

    it('should sanitize request data', () => {
      const req = { url: '/api/users', body: { password: 'secret' } };
      
      logRequest(req);

      expect(PIISanitizer.sanitizeRequest).toHaveBeenCalledWith(req);
    });

    it('should include metadata', () => {
      const req = { url: '/api/test' };
      const meta = { userId: 'user-123' };
      
      logRequest(req, meta);

      expect(logger.info).toHaveBeenCalledWith(
        'Request received',
        expect.objectContaining(meta)
      );
    });
  });

  describe('console override', () => {
    it('should sanitize console.log arguments', () => {
      const data = { password: 'secret' };
      
      console.log(data);

      expect(PIISanitizer.sanitize).toHaveBeenCalledWith(data);
    });

    it('should sanitize console.error arguments', () => {
      const error = { message: 'error', token: 'secret' };
      
      console.error(error);

      expect(PIISanitizer.sanitize).toHaveBeenCalledWith(error);
    });

    it('should sanitize console.warn arguments', () => {
      const warning = { apiKey: 'secret' };
      
      console.warn(warning);

      expect(PIISanitizer.sanitize).toHaveBeenCalledWith(warning);
    });

    it('should handle multiple arguments', () => {
      console.log('message', { data: 'value' }, 'another');

      expect(PIISanitizer.sanitize).toHaveBeenCalledTimes(3);
    });
  });
});
