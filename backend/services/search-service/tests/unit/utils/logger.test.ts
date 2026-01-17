// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/logger.ts
 */

jest.mock('pino');

describe('src/utils/logger.ts - Comprehensive Unit Tests', () => {
  let pino: any;
  let mockLogger: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock pino logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn()
    };

    pino = require('pino');
    pino.mockReturnValue(mockLogger);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // Logger Initialization
  // =============================================================================

  describe('Logger Initialization', () => {
    it('should create pino logger', () => {
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalled();
    });

    it('should set service name', () => {
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'search-service'
        })
      );
    });

    it('should use default log level', () => {
      delete process.env.LOG_LEVEL;
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info'
        })
      );
    });

    it('should use LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug'
        })
      );
    });

    it('should export logger instance', () => {
      const { logger } = require('../../../src/utils/logger');

      expect(logger).toBe(mockLogger);
    });
  });

  // =============================================================================
  // Log Levels
  // =============================================================================

  describe('Log Levels', () => {
    it('should accept trace level', () => {
      process.env.LOG_LEVEL = 'trace';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'trace' })
      );
    });

    it('should accept debug level', () => {
      process.env.LOG_LEVEL = 'debug';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'debug' })
      );
    });

    it('should accept info level', () => {
      process.env.LOG_LEVEL = 'info';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' })
      );
    });

    it('should accept warn level', () => {
      process.env.LOG_LEVEL = 'warn';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' })
      );
    });

    it('should accept error level', () => {
      process.env.LOG_LEVEL = 'error';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' })
      );
    });

    it('should accept fatal level', () => {
      process.env.LOG_LEVEL = 'fatal';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'fatal' })
      );
    });
  });

  // =============================================================================
  // Development Transport
  // =============================================================================

  describe('Development Transport', () => {
    it('should use pino-pretty in development', () => {
      process.env.NODE_ENV = 'development';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true
            }
          }
        })
      );
    });

    it('should enable colorize in development', () => {
      process.env.NODE_ENV = 'development';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: expect.objectContaining({
            options: { colorize: true }
          })
        })
      );
    });

    it('should use pino-pretty target in development', () => {
      process.env.NODE_ENV = 'development';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: expect.objectContaining({
            target: 'pino-pretty'
          })
        })
      );
    });
  });

  // =============================================================================
  // Production Transport
  // =============================================================================

  describe('Production Transport', () => {
    it('should not use transport in production', () => {
      process.env.NODE_ENV = 'production';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: undefined
        })
      );
    });

    it('should not use pino-pretty in production', () => {
      process.env.NODE_ENV = 'production';
      require('../../../src/utils/logger');

      const call = pino.mock.calls[0][0];
      expect(call.transport).toBeUndefined();
    });

    it('should use JSON output in production', () => {
      process.env.NODE_ENV = 'production';
      require('../../../src/utils/logger');

      const call = pino.mock.calls[0][0];
      expect(call.transport).toBeUndefined();
    });
  });

  // =============================================================================
  // Other Environments
  // =============================================================================

  describe('Other Environments', () => {
    it('should not use transport in test', () => {
      process.env.NODE_ENV = 'test';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: undefined
        })
      );
    });

    it('should not use transport in staging', () => {
      process.env.NODE_ENV = 'staging';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: undefined
        })
      );
    });

    it('should not use transport when NODE_ENV not set', () => {
      delete process.env.NODE_ENV;
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: undefined
        })
      );
    });
  });

  // =============================================================================
  // Logger Configuration
  // =============================================================================

  describe('Logger Configuration', () => {
    it('should have both name and level', () => {
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'search-service',
          level: expect.any(String)
        })
      );
    });

    it('should prioritize environment LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'trace';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'trace'
        })
      );
    });

    it('should handle empty LOG_LEVEL', () => {
      process.env.LOG_LEVEL = '';
      require('../../../src/utils/logger');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info'
        })
      );
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export logger', () => {
      const module = require('../../../src/utils/logger');

      expect(module.logger).toBeDefined();
    });

    it('should export pino logger instance', () => {
      const { logger } = require('../../../src/utils/logger');

      expect(logger).toBe(mockLogger);
    });

    it('should have logger methods', () => {
      const { logger } = require('../../../src/utils/logger');

      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.trace).toBeDefined();
      expect(logger.fatal).toBeDefined();
    });
  });
});
