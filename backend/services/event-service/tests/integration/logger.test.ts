/**
 * Logger Integration Tests
 */

import { logger } from '../../src/utils/logger';

describe('Logger', () => {
  // ==========================================================================
  // Logger existence and structure
  // ==========================================================================
  describe('logger structure', () => {
    it('should export a logger instance', () => {
      expect(logger).toBeDefined();
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have trace method', () => {
      expect(typeof logger.trace).toBe('function');
    });

    it('should have fatal method', () => {
      expect(typeof logger.fatal).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });
  });

  // ==========================================================================
  // Logger functionality
  // ==========================================================================
  describe('logger functionality', () => {
    it('should create child logger with bindings', () => {
      const childLogger = logger.child({ component: 'test-component' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should not throw when logging messages', () => {
      expect(() => {
        logger.info('Test info message');
        logger.error('Test error message');
        logger.warn('Test warn message');
        logger.debug('Test debug message');
      }).not.toThrow();
    });

    it('should not throw when logging with objects', () => {
      expect(() => {
        logger.info({ key: 'value', nested: { data: 123 } }, 'Message with object');
      }).not.toThrow();
    });

    it('should not throw when logging errors', () => {
      expect(() => {
        const error = new Error('Test error');
        logger.error({ err: error }, 'Error occurred');
      }).not.toThrow();
    });
  });
});
