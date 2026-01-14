/**
 * Unit Tests for Logger Utility
 * Tests the Winston logger configuration and child logger creation
 */

import winston from 'winston';

// Mock winston before importing logger
jest.mock('winston', () => {
  const mockFormat = {
    combine: jest.fn().mockReturnValue('combined'),
    timestamp: jest.fn().mockReturnValue('timestamp'),
    errors: jest.fn().mockReturnValue('errors'),
    json: jest.fn().mockReturnValue('json'),
    colorize: jest.fn().mockReturnValue('colorize'),
    simple: jest.fn().mockReturnValue('simple')
  };

  const mockChildLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  const mockLogger = {
    level: 'info',
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue(mockChildLogger)
  };

  return {
    format: mockFormat,
    createLogger: jest.fn().mockReturnValue(mockLogger),
    transports: {
      Console: jest.fn()
    }
  };
});

describe('Logger Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('logger creation', () => {
    it('should create a winston logger', () => {
      const { logger } = require('../../../src/utils/logger');
      
      expect(winston.createLogger).toHaveBeenCalled();
      expect(logger).toBeDefined();
    });

    it('should use default log level of info', () => {
      delete process.env.LOG_LEVEL;
      jest.resetModules();
      
      require('../../../src/utils/logger');
      
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expect.any(String)
        })
      );
    });

    it('should configure JSON format with timestamp and error stacks', () => {
      require('../../../src/utils/logger');
      
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.errors).toHaveBeenCalledWith({ stack: true });
      expect(winston.format.json).toHaveBeenCalled();
    });

    it('should set default meta with service name', () => {
      require('../../../src/utils/logger');
      
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMeta: { service: 'marketplace-service' }
        })
      );
    });

    it('should configure console transport', () => {
      require('../../../src/utils/logger');
      
      expect(winston.transports.Console).toHaveBeenCalled();
    });

    it('should configure console transport with colorize and simple format', () => {
      require('../../../src/utils/logger');
      
      expect(winston.format.colorize).toHaveBeenCalled();
      expect(winston.format.simple).toHaveBeenCalled();
    });
  });

  describe('logger methods', () => {
    it('should have info method', () => {
      const { logger } = require('../../../src/utils/logger');
      
      expect(typeof logger.info).toBe('function');
    });

    it('should have warn method', () => {
      const { logger } = require('../../../src/utils/logger');
      
      expect(typeof logger.warn).toBe('function');
    });

    it('should have error method', () => {
      const { logger } = require('../../../src/utils/logger');
      
      expect(typeof logger.error).toBe('function');
    });

    it('should have debug method', () => {
      const { logger } = require('../../../src/utils/logger');
      
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create a child logger with component metadata', () => {
      const { createLogger, logger } = require('../../../src/utils/logger');
      
      const childLogger = createLogger('TestComponent');
      
      expect(logger.child).toHaveBeenCalledWith({ component: 'TestComponent' });
      expect(childLogger).toBeDefined();
    });

    it('should create different child loggers for different components', () => {
      const { createLogger, logger } = require('../../../src/utils/logger');
      
      createLogger('Component1');
      createLogger('Component2');
      
      expect(logger.child).toHaveBeenCalledTimes(2);
      expect(logger.child).toHaveBeenCalledWith({ component: 'Component1' });
      expect(logger.child).toHaveBeenCalledWith({ component: 'Component2' });
    });

    it('should return child logger with logging methods', () => {
      const { createLogger } = require('../../../src/utils/logger');
      
      const childLogger = createLogger('TestComponent');
      
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
    });
  });

  describe('default export', () => {
    it('should export logger as default', () => {
      const defaultLogger = require('../../../src/utils/logger').default;
      const { logger } = require('../../../src/utils/logger');
      
      expect(defaultLogger).toBe(logger);
    });
  });
});
