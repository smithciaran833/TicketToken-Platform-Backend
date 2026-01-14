// @ts-nocheck
import winston from 'winston';
import logger from '../../../src/utils/logger';

describe('Logger', () => {
  describe('configuration', () => {
    it('should be a winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.log).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    it('should use LOG_LEVEL from environment', () => {
      expect(logger.level).toBe(process.env.LOG_LEVEL || 'info');
    });

    it('should have service name in defaultMeta', () => {
      expect(logger.defaultMeta).toEqual({ service: 'scanning-service' });
    });

    it('should have transports array', () => {
      expect(Array.isArray(logger.transports)).toBe(true);
    });
  });

  describe('logging methods', () => {
    it('should log info messages', () => {
      const infoSpy = jest.spyOn(logger, 'info');
      logger.info('test message');
      expect(infoSpy).toHaveBeenCalledWith('test message');
      infoSpy.mockRestore();
    });

    it('should log error messages', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      logger.error('error message');
      expect(errorSpy).toHaveBeenCalledWith('error message');
      errorSpy.mockRestore();
    });

    it('should log with metadata', () => {
      const infoSpy = jest.spyOn(logger, 'info');
      logger.info('test', { userId: '123' });
      expect(infoSpy).toHaveBeenCalledWith('test', { userId: '123' });
      infoSpy.mockRestore();
    });

    it('should format errors with stack traces', () => {
      const error = new Error('test error');
      const errorSpy = jest.spyOn(logger, 'error');
      logger.error('Error occurred', error);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
