/**
 * Logger Integration Tests
 */

import { logger } from '../../../src/utils/logger';

describe('Logger Integration Tests', () => {
  describe('Logger Instance', () => {
    it('should be defined', () => {
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

    it('should have child method for creating child loggers', () => {
      expect(typeof logger.child).toBe('function');
    });

    it('should create child logger with bindings', () => {
      const childLogger = logger.child({ requestId: '123' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('Logger Configuration', () => {
    it('should have level property', () => {
      expect(logger.level).toBeDefined();
    });

    it('should log without throwing', () => {
      expect(() => {
        logger.info('Test message');
        logger.info({ data: 'test' }, 'Test with object');
        logger.error(new Error('Test error'), 'Error occurred');
      }).not.toThrow();
    });
  });
});
