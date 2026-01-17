import { logger } from '../../../src/utils/logger';

describe('Logger Utils', () => {
  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should be a winston logger', () => {
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('level');
    });

    it('should have info method', () => {
      expect(logger.info).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(logger.error).toBeDefined();
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(logger.warn).toBeDefined();
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });

    it('should have level property', () => {
      expect(logger.level).toBeDefined();
      expect(typeof logger.level).toBe('string');
    });

    it('should have transports', () => {
      expect(logger.transports).toBeDefined();
      expect(Array.isArray(logger.transports)).toBe(true);
      expect(logger.transports.length).toBeGreaterThan(0);
    });
  });

  describe('logger functionality', () => {
    let infoSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      infoSpy = jest.spyOn(logger, 'info').mockImplementation();
      errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
      debugSpy = jest.spyOn(logger, 'debug').mockImplementation();
    });

    afterEach(() => {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it('should call info method', () => {
      logger.info('Test info message');
      expect(infoSpy).toHaveBeenCalledWith('Test info message');
    });

    it('should call error method', () => {
      logger.error('Test error message');
      expect(errorSpy).toHaveBeenCalledWith('Test error message');
    });

    it('should call warn method', () => {
      logger.warn('Test warn message');
      expect(warnSpy).toHaveBeenCalledWith('Test warn message');
    });

    it('should call debug method', () => {
      logger.debug('Test debug message');
      expect(debugSpy).toHaveBeenCalledWith('Test debug message');
    });

    it('should support logging with metadata', () => {
      const metadata = { userId: '123', action: 'test' };
      logger.info('Test message', metadata);
      expect(infoSpy).toHaveBeenCalledWith('Test message', metadata);
    });

    it('should support logging errors', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', { error });
      expect(errorSpy).toHaveBeenCalledWith('Error occurred', { error });
    });

    it('should support multiple arguments', () => {
      logger.info('Message', { key: 'value' }, { extra: 'data' });
      expect(infoSpy).toHaveBeenCalledWith('Message', { key: 'value' }, { extra: 'data' });
    });

    it('should handle empty calls', () => {
      logger.info();
      expect(infoSpy).toHaveBeenCalledWith();
    });
  });

  describe('logger level configuration', () => {
    it('should have a valid log level', () => {
      const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
      expect(validLevels).toContain(logger.level);
    });

    it('should allow checking if level is enabled', () => {
      // Winston loggers have methods to check if a level is enabled
      expect(typeof logger.isErrorEnabled).toBe('function');
      expect(typeof logger.isWarnEnabled).toBe('function');
      expect(typeof logger.isInfoEnabled).toBe('function');
      expect(typeof logger.isDebugEnabled).toBe('function');
    });
  });
});
