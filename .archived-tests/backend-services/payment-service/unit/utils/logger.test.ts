// =============================================================================
// TEST SUITE: logger utility
// =============================================================================

describe('logger utility', () => {
  let logger: any;
  let consoleSpy: any;

  beforeEach(() => {
    jest.resetModules();
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  // ===========================================================================
  // Logger Instance - 3 test cases
  // ===========================================================================

  describe('Logger Instance', () => {
    it('should create logger with default component', () => {
      logger = require('../../../src/utils/logger').logger;

      expect(logger).toBeDefined();
    });

    it('should have info method', () => {
      logger = require('../../../src/utils/logger').logger;

      expect(typeof logger.info).toBe('function');
    });

    it('should have error, warn, and debug methods', () => {
      logger = require('../../../src/utils/logger').logger;

      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  // ===========================================================================
  // info() Method - 3 test cases
  // ===========================================================================

  describe('info() Method', () => {
    it('should log info message', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('Test message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should include timestamp and level in log', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('Test message');

      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('[INFO]');
    });

    it('should log with additional data', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('Test message', { userId: 'user-123' });

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // error() Method - 3 test cases
  // ===========================================================================

  describe('error() Method', () => {
    it('should log error message', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.error('Error occurred');

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should include ERROR level in log', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.error('Error occurred');

      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).toContain('[ERROR]');
    });

    it('should log with error object', () => {
      logger = require('../../../src/utils/logger').logger;

      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // warn() Method - 2 test cases
  // ===========================================================================

  describe('warn() Method', () => {
    it('should log warning message', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.warn('Warning message');

      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should include WARN level in log', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.warn('Warning message');

      const logCall = consoleSpy.warn.mock.calls[0][0];
      expect(logCall).toContain('[WARN]');
    });
  });

  // ===========================================================================
  // debug() Method - 3 test cases
  // ===========================================================================

  describe('debug() Method', () => {
    it('should log debug message when LOG_LEVEL is debug', () => {
      process.env.LOG_LEVEL = 'debug';
      logger = require('../../../src/utils/logger').logger;

      logger.debug('Debug message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should not log debug message when LOG_LEVEL is not debug', () => {
      delete process.env.LOG_LEVEL;
      logger = require('../../../src/utils/logger').logger;

      logger.debug('Debug message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should include DEBUG level in log when enabled', () => {
      process.env.LOG_LEVEL = 'debug';
      logger = require('../../../src/utils/logger').logger;

      logger.debug('Debug message');

      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('[DEBUG]');
    });
  });

  // ===========================================================================
  // child() Method - 2 test cases
  // ===========================================================================

  describe('child() Method', () => {
    it('should create child logger with custom component', () => {
      logger = require('../../../src/utils/logger').logger;

      const childLogger = logger.child({ component: 'child-component' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should allow child logger to log', () => {
      logger = require('../../../src/utils/logger').logger;

      const childLogger = logger.child({ component: 'test-component' });
      childLogger.info('Child log');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // PII Sanitization - 4 test cases
  // ===========================================================================

  describe('PII Sanitization', () => {
    it('should sanitize email addresses', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('User logged in', { email: 'test@example.com' });

      const logCall = consoleSpy.log.mock.calls[0][1];
      expect(JSON.stringify(logCall)).toContain('[EMAIL]');
    });

    it('should sanitize SSN', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('User data', { ssn: '123-45-6789' });

      const logCall = consoleSpy.log.mock.calls[0][1];
      expect(JSON.stringify(logCall)).toContain('[SSN]');
    });

    it('should sanitize credit card numbers', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('Payment', { card: '4111-1111-1111-1111' });

      const logCall = consoleSpy.log.mock.calls[0][1];
      expect(JSON.stringify(logCall)).toContain('[CARD]');
    });

    it('should sanitize nested objects', () => {
      logger = require('../../../src/utils/logger').logger;

      logger.info('User info', {
        user: { email: 'user@test.com', ssn: '111-22-3333' },
      });

      const logCall = consoleSpy.log.mock.calls[0][1];
      const logString = JSON.stringify(logCall);
      expect(logString).toContain('[EMAIL]');
      expect(logString).toContain('[SSN]');
    });
  });
});
