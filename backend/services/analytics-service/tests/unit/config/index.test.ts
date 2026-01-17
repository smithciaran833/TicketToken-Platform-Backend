/**
 * Main Config (index.ts) Tests
 */

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load config with default values', () => {
    const { config } = require('../../../src/config/index');

    expect(config).toBeDefined();
    expect(config.env).toBe('test');
    expect(config.serviceName).toBe('analytics-service');
  });

  it('should have database configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.database).toBeDefined();
    expect(config.database).toHaveProperty('host');
    expect(config.database).toHaveProperty('port');
    expect(config.database).toHaveProperty('database');
    expect(config.database).toHaveProperty('user');
    expect(config.database).toHaveProperty('password');
    expect(config.database).toHaveProperty('pool');
    expect(config.database.pool).toHaveProperty('min');
    expect(config.database.pool).toHaveProperty('max');
  });

  it('should have analytics database configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.analyticsDatabase).toBeDefined();
    expect(config.analyticsDatabase).toHaveProperty('host');
    expect(config.analyticsDatabase).toHaveProperty('port');
    expect(config.analyticsDatabase).toHaveProperty('database');
    expect(config.analyticsDatabase).toHaveProperty('user');
    expect(config.analyticsDatabase).toHaveProperty('password');
  });

  it('should have redis configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.redis).toBeDefined();
    expect(config.redis).toHaveProperty('host');
    expect(config.redis).toHaveProperty('port');
    expect(config.redis).toHaveProperty('db');
    expect(typeof config.redis.port).toBe('number');
    expect(typeof config.redis.db).toBe('number');
  });

  it('should have mongodb configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.mongodb).toBeDefined();
    expect(config.mongodb).toHaveProperty('uri');
    expect(config.mongodb).toHaveProperty('user');
    expect(config.mongodb).toHaveProperty('password');
  });

  it('should have rabbitmq configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.rabbitmq).toBeDefined();
    expect(config.rabbitmq).toHaveProperty('url');
    expect(config.rabbitmq).toHaveProperty('exchange');
    expect(config.rabbitmq).toHaveProperty('queue');
  });

  it('should have influxdb configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.influxdb).toBeDefined();
    expect(config.influxdb).toHaveProperty('url');
    expect(config.influxdb).toHaveProperty('token');
    expect(config.influxdb).toHaveProperty('org');
    expect(config.influxdb).toHaveProperty('bucket');
  });

  it('should have metrics backend configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.metrics).toBeDefined();
    expect(config.metrics).toHaveProperty('backend');
    expect(config.metrics).toHaveProperty('failSilently');
    expect(['postgres', 'influxdb', 'dual']).toContain(config.metrics.backend);
  });

  it('should have websocket configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.websocket).toBeDefined();
    expect(config.websocket).toHaveProperty('port');
    expect(config.websocket).toHaveProperty('path');
    expect(typeof config.websocket.port).toBe('number');
  });

  it('should have jwt configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.jwt).toBeDefined();
    expect(config.jwt).toHaveProperty('secret');
    expect(config.jwt).toHaveProperty('expiresIn');
    expect(config.jwt.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('should have services configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.services).toBeDefined();
    expect(config.services).toHaveProperty('auth');
    expect(config.services).toHaveProperty('venue');
    expect(config.services).toHaveProperty('event');
    expect(config.services).toHaveProperty('ticket');
    expect(config.services).toHaveProperty('payment');
    expect(config.services).toHaveProperty('marketplace');
  });

  it('should have ml configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.ml).toBeDefined();
    expect(config.ml).toHaveProperty('modelPath');
    expect(config.ml).toHaveProperty('trainingEnabled');
    expect(config.ml).toHaveProperty('updateInterval');
    expect(typeof config.ml.trainingEnabled).toBe('boolean');
  });

  it('should have export configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.export).toBeDefined();
    expect(config.export).toHaveProperty('tempPath');
    expect(config.export).toHaveProperty('s3Bucket');
    expect(config.export).toHaveProperty('awsRegion');
  });

  it('should have monitoring configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.monitoring).toBeDefined();
    expect(config.monitoring).toHaveProperty('enabled');
    expect(config.monitoring).toHaveProperty('port');
    expect(typeof config.monitoring.enabled).toBe('boolean');
  });

  it('should have privacy configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.privacy).toBeDefined();
    expect(config.privacy).toHaveProperty('customerHashSalt');
    expect(config.privacy).toHaveProperty('dataRetentionDays');
    expect(typeof config.privacy.dataRetentionDays).toBe('number');
  });

  it('should have cache configuration', () => {
    const { config } = require('../../../src/config/index');

    expect(config.cache).toBeDefined();
    expect(config.cache).toHaveProperty('secret');
    expect(config.cache).toHaveProperty('ttl');
    expect(typeof config.cache.ttl).toBe('number');
  });

  describe('environment variable overrides', () => {
    it('should use PORT from environment', () => {
      process.env.PORT = '4000';
      jest.resetModules();
      const { config } = require('../../../src/config/index');
      expect(config.port).toBe(4000);
    });

    it('should use DB_HOST from environment', () => {
      process.env.DB_HOST = 'custom-db-host';
      jest.resetModules();
      const { config } = require('../../../src/config/index');
      expect(config.database.host).toBe('custom-db-host');
    });

    it('should use REDIS_HOST from environment', () => {
      process.env.REDIS_HOST = 'custom-redis-host';
      jest.resetModules();
      const { config } = require('../../../src/config/index');
      expect(config.redis.host).toBe('custom-redis-host');
    });

    it('should use METRICS_BACKEND from environment', () => {
      process.env.METRICS_BACKEND = 'influxdb';
      jest.resetModules();
      const { config } = require('../../../src/config/index');
      expect(config.metrics.backend).toBe('influxdb');
    });

    it('should parse boolean ML_TRAINING_ENABLED correctly', () => {
      process.env.ML_TRAINING_ENABLED = 'true';
      jest.resetModules();
      const { config } = require('../../../src/config/index');
      expect(config.ml.trainingEnabled).toBe(true);
    });
  });
});
