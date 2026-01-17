// Mock config BEFORE imports
jest.mock('../../../src/config', () => ({
  config: {
    logging: { level: 'info' },
    serviceName: 'monitoring-service',
  },
}));

import { logger } from '../../../src/utils/logger';

describe('Logger', () => {
  describe('configuration', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have all standard log methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have correct default meta service name', () => {
      expect(logger.defaultMeta).toEqual({ service: 'monitoring-service' });
    });

    it('should have console transport', () => {
      const consoleTransport = logger.transports.find(
        (t) => t.constructor.name === 'Console'
      );
      expect(consoleTransport).toBeDefined();
    });

    it('should have file transports', () => {
      const fileTransports = logger.transports.filter(
        (t) => t.constructor.name === 'File'
      );
      expect(fileTransports.length).toBeGreaterThanOrEqual(2);
    });

    it('should have error file transport with error level', () => {
      const errorTransport = logger.transports.find(
        (t: any) => t.filename && t.filename.includes('error')
      );
      expect(errorTransport).toBeDefined();
      expect((errorTransport as any).level).toBe('error');
    });
  });

  describe('logging functionality', () => {
    it('should log info messages without throwing', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log error messages without throwing', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log warn messages without throwing', () => {
      expect(() => logger.warn('Test warning message')).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() => logger.info('Test message', { userId: '123' })).not.toThrow();
    });

    it('should log errors with stack traces', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });

    it('should handle objects in log messages', () => {
      expect(() => logger.info('Data', { nested: { value: 123 } })).not.toThrow();
    });

    it('should handle null and undefined values', () => {
      expect(() => {
        logger.info('Null', { value: null });
        logger.info('Undefined', { value: undefined });
      }).not.toThrow();
    });
  });
});
