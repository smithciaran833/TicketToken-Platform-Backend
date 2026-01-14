jest.mock('../../../src/config/env', () => ({
  env: {
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
  },
}));

import { logger, dbLogger, redisLogger, authLogger, apiLogger, auditLogger, logWithContext, createRequestLogger } from '../../../src/config/logger';

describe('logger config', () => {
  describe('logger', () => {
    it('should export a pino logger', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('child loggers', () => {
    it('should have dbLogger', () => {
      expect(dbLogger).toBeDefined();
      expect(typeof dbLogger.info).toBe('function');
    });

    it('should have redisLogger', () => {
      expect(redisLogger).toBeDefined();
      expect(typeof redisLogger.info).toBe('function');
    });

    it('should have authLogger', () => {
      expect(authLogger).toBeDefined();
      expect(typeof authLogger.info).toBe('function');
    });

    it('should have apiLogger', () => {
      expect(apiLogger).toBeDefined();
      expect(typeof apiLogger.info).toBe('function');
    });

    it('should have auditLogger', () => {
      expect(auditLogger).toBeDefined();
      expect(typeof auditLogger.info).toBe('function');
    });
  });

  describe('logWithContext', () => {
    it('should be a function', () => {
      expect(typeof logWithContext).toBe('function');
    });

    it('should log with context', () => {
      // Should not throw
      logWithContext({ userId: 'test-user' }, 'Test message', { extra: 'data' });
    });
  });

  describe('createRequestLogger', () => {
    it('should return a middleware function', () => {
      const middleware = createRequestLogger();
      expect(typeof middleware).toBe('function');
    });

    it('should handle request/reply', async () => {
      const middleware = createRequestLogger();
      const mockRequest = {
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' },
        id: 'req-123',
        user: { id: 'user-123' },
      };
      const finishHandler = jest.fn();
      const mockReply = {
        statusCode: 200,
        raw: {
          on: jest.fn((event, handler) => {
            if (event === 'finish') {
              finishHandler.mockImplementation(handler);
            }
          }),
        },
      };

      await middleware(mockRequest, mockReply);
      expect(mockReply.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });
});
