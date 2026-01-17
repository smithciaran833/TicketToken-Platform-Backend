/**
 * Logger Unit Tests
 */

import { logger, createLogger } from '../../../src/utils/logger';

describe('Logger', () => {
  it('should export a logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should have all standard log methods', () => {
    const methods = ['info', 'error', 'warn', 'debug', 'trace', 'fatal'];
    methods.forEach(method => {
      expect(typeof logger[method as keyof typeof logger]).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create child logger with component name', () => {
      const childLogger = createLogger('test-component');

      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeDefined();
    });

    it('should create independent child loggers', () => {
      const logger1 = createLogger('component-1');
      const logger2 = createLogger('component-2');

      expect(logger1).not.toBe(logger2);
    });
  });
});
