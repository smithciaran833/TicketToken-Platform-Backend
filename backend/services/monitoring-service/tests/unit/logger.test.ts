import { EventEmitter } from 'events';

// Mock winston-elasticsearch before import with proper EventEmitter support
jest.mock('winston-elasticsearch', () => {
  const mockTransport = Object.assign(new EventEmitter(), {
    name: 'elasticsearch',
    log: jest.fn((info: any, callback: () => void) => callback()),
    logv: jest.fn(),
    close: jest.fn(),
  });

  return {
    ElasticsearchTransport: jest.fn().mockImplementation(() => mockTransport),
  };
});

describe('Logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('configuration', () => {
    it('should export a logger instance', () => {
      const { logger } = require('../../src/logger');
      expect(logger).toBeDefined();
    });

    it('should have all standard log methods', () => {
      const { logger } = require('../../src/logger');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should use default log level of info', () => {
      delete process.env.LOG_LEVEL;
      jest.resetModules();

      const { logger } = require('../../src/logger');
      expect(logger.level).toBe('info');
    });

    it('should use LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      jest.resetModules();

      const { logger } = require('../../src/logger');
      expect(logger.level).toBe('debug');
    });

    it('should have monitoring-service as default meta', () => {
      const { logger } = require('../../src/logger');
      expect(logger.defaultMeta).toEqual({ service: 'monitoring-service' });
    });
  });

  describe('transports', () => {
    it('should have console transport', () => {
      const { logger } = require('../../src/logger');
      const consoleTransport = logger.transports.find(
        (t: any) => t.constructor.name === 'Console'
      );
      expect(consoleTransport).toBeDefined();
    });

    it('should have error file transport', () => {
      const { logger } = require('../../src/logger');
      const errorTransport = logger.transports.find(
        (t: any) => t.filename && t.filename.includes('error')
      );
      expect(errorTransport).toBeDefined();
      expect((errorTransport as any).level).toBe('error');
    });

    it('should have combined file transport', () => {
      const { logger } = require('../../src/logger');
      const combinedTransport = logger.transports.find(
        (t: any) => t.filename && t.filename.includes('combined')
      );
      expect(combinedTransport).toBeDefined();
    });

    it('should write to logs/error.log for error transport', () => {
      const { logger } = require('../../src/logger');
      const errorTransport = logger.transports.find(
        (t: any) => t.filename && t.filename.includes('error')
      );
      // Winston File transport stores dirname and filename separately
      const fullPath = `${(errorTransport as any).dirname}/${(errorTransport as any).filename}`;
      expect(fullPath).toBe('logs/error.log');
    });

    it('should write to logs/combined.log for combined transport', () => {
      const { logger } = require('../../src/logger');
      const combinedTransport = logger.transports.find(
        (t: any) => t.filename && t.filename.includes('combined')
      );
      // Winston File transport stores dirname and filename separately
      const fullPath = `${(combinedTransport as any).dirname}/${(combinedTransport as any).filename}`;
      expect(fullPath).toBe('logs/combined.log');
    });
  });

  describe('elasticsearch transport', () => {
    it('should not add elasticsearch transport by default', () => {
      delete process.env.ENABLE_ES_LOGGING;
      jest.resetModules();

      const { logger } = require('../../src/logger');
      const esTransport = logger.transports.find(
        (t: any) => t.name === 'elasticsearch'
      );
      expect(esTransport).toBeUndefined();
    });

    it('should add elasticsearch transport when ENABLE_ES_LOGGING is true', () => {
      process.env.ENABLE_ES_LOGGING = 'true';
      jest.resetModules();

      const { ElasticsearchTransport } = require('winston-elasticsearch');
      require('../../src/logger');

      expect(ElasticsearchTransport).toHaveBeenCalled();
    });

    it('should use default elasticsearch URL if not configured', () => {
      process.env.ENABLE_ES_LOGGING = 'true';
      delete process.env.ELASTICSEARCH_URL;
      jest.resetModules();

      const { ElasticsearchTransport } = require('winston-elasticsearch');
      require('../../src/logger');

      expect(ElasticsearchTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          clientOpts: expect.objectContaining({
            node: 'http://elasticsearch:9200',
          }),
        })
      );
    });

    it('should use configured elasticsearch URL', () => {
      process.env.ENABLE_ES_LOGGING = 'true';
      process.env.ELASTICSEARCH_URL = 'http://custom-es:9200';
      jest.resetModules();

      const { ElasticsearchTransport } = require('winston-elasticsearch');
      require('../../src/logger');

      expect(ElasticsearchTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          clientOpts: expect.objectContaining({
            node: 'http://custom-es:9200',
          }),
        })
      );
    });

    it('should use default elasticsearch credentials if not configured', () => {
      process.env.ENABLE_ES_LOGGING = 'true';
      delete process.env.ELASTIC_USER;
      delete process.env.ELASTIC_PASSWORD;
      jest.resetModules();

      const { ElasticsearchTransport } = require('winston-elasticsearch');
      require('../../src/logger');

      expect(ElasticsearchTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          clientOpts: expect.objectContaining({
            auth: {
              username: 'elastic',
              password: 'changeme',
            },
          }),
        })
      );
    });

    it('should use configured elasticsearch index', () => {
      process.env.ENABLE_ES_LOGGING = 'true';
      jest.resetModules();

      const { ElasticsearchTransport } = require('winston-elasticsearch');
      require('../../src/logger');

      expect(ElasticsearchTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'tickettoken-logs',
        })
      );
    });
  });

  describe('logging functionality', () => {
    it('should log info messages without throwing', () => {
      const { logger } = require('../../src/logger');
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log error messages without throwing', () => {
      const { logger } = require('../../src/logger');
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log warn messages without throwing', () => {
      const { logger } = require('../../src/logger');
      expect(() => logger.warn('Test warning message')).not.toThrow();
    });

    it('should log debug messages without throwing', () => {
      const { logger } = require('../../src/logger');
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('should log with metadata', () => {
      const { logger } = require('../../src/logger');
      expect(() => logger.info('Test message', { userId: '123', action: 'test' })).not.toThrow();
    });

    it('should log errors with stack traces', () => {
      const { logger } = require('../../src/logger');
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });

    it('should handle objects in log messages', () => {
      const { logger } = require('../../src/logger');
      expect(() => logger.info('Data', { nested: { deep: { value: 123 } } })).not.toThrow();
    });

    it('should handle null and undefined values', () => {
      const { logger } = require('../../src/logger');
      expect(() => {
        logger.info('Null value', { value: null });
        logger.info('Undefined value', { value: undefined });
      }).not.toThrow();
    });
  });
});
