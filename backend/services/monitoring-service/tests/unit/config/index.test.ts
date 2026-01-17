describe('Config Module', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  // Helper to dynamically require the config with fresh module
  const requireConfig = () => {
    // Clear from cache first
    delete require.cache[require.resolve('../../../src/config/index')];
    delete require.cache[require.resolve('dotenv')];
    return require('../../../src/config/index');
  };

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Required Environment Variables', () => {
    it('should throw error when DB_HOST is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.DB_HOST;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when DB_NAME is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.DB_NAME;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when DB_USER is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.DB_USER;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when DB_PASSWORD is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.DB_PASSWORD;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when MONGODB_URI is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.MONGODB_URI;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when ELASTICSEARCH_NODE is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.ELASTICSEARCH_NODE;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when INFLUXDB_URL is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.INFLUXDB_URL;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when INFLUXDB_TOKEN is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.INFLUXDB_TOKEN;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when INFLUXDB_ORG is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.INFLUXDB_ORG;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when INFLUXDB_BUCKET is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.INFLUXDB_BUCKET;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when JWT_SECRET is missing', () => {
      setMinimalRequiredEnv();
      delete process.env.JWT_SECRET;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });

    it('should throw error when service URLs are missing', () => {
      setMinimalRequiredEnv();
      delete process.env.AUTH_SERVICE_URL;

      expect(() => requireConfig()).toThrow(/Config validation error/);
    });
  });

  describe('Default Values', () => {
    it('should use default NODE_ENV as development', () => {
      setMinimalRequiredEnv();
      delete process.env.NODE_ENV;
      
      const { config } = requireConfig();
      expect(config.env).toBe('development');
    });

    it('should use default PORT as 3013', () => {
      setMinimalRequiredEnv();
      delete process.env.PORT;
      
      const { config } = requireConfig();
      expect(config.port).toBe(3013);
    });

    it('should use default SERVICE_NAME as monitoring-service', () => {
      setMinimalRequiredEnv();
      delete process.env.SERVICE_NAME;
      
      const { config } = requireConfig();
      expect(config.serviceName).toBe('monitoring-service');
    });

    it('should use default REDIS_HOST as redis', () => {
      setMinimalRequiredEnv();
      delete process.env.REDIS_HOST;
      
      const { config } = requireConfig();
      expect(config.redis.host).toBe('redis');
    });

    it('should use default REDIS_PORT as 6379', () => {
      setMinimalRequiredEnv();
      delete process.env.REDIS_PORT;
      
      const { config } = requireConfig();
      expect(config.redis.port).toBe(6379);
    });

    it('should use default DB_PORT as 5432', () => {
      setMinimalRequiredEnv();
      delete process.env.DB_PORT;
      
      const { config } = requireConfig();
      expect(config.database.port).toBe(5432);
    });

    it('should use default HEALTH_CHECK_INTERVAL as 30 seconds (converted to ms)', () => {
      setMinimalRequiredEnv();
      delete process.env.HEALTH_CHECK_INTERVAL;
      
      const { config } = requireConfig();
      expect(config.intervals.healthCheck).toBe(30000);
    });

    it('should use default METRIC_COLLECTION_INTERVAL as 60 seconds (converted to ms)', () => {
      setMinimalRequiredEnv();
      delete process.env.METRIC_COLLECTION_INTERVAL;
      
      const { config } = requireConfig();
      expect(config.intervals.metricCollection).toBe(60000);
    });

    it('should use default ALERT_EVALUATION_INTERVAL as 60 seconds (converted to ms)', () => {
      setMinimalRequiredEnv();
      delete process.env.ALERT_EVALUATION_INTERVAL;
      
      const { config } = requireConfig();
      expect(config.intervals.alertEvaluation).toBe(60000);
    });

    it('should use default CPU_THRESHOLD as 80', () => {
      setMinimalRequiredEnv();
      delete process.env.CPU_THRESHOLD;
      
      const { config } = requireConfig();
      expect(config.thresholds.cpu).toBe(80);
    });

    it('should use default MEMORY_THRESHOLD as 85', () => {
      setMinimalRequiredEnv();
      delete process.env.MEMORY_THRESHOLD;
      
      const { config } = requireConfig();
      expect(config.thresholds.memory).toBe(85);
    });

    it('should use default DISK_THRESHOLD as 90', () => {
      setMinimalRequiredEnv();
      delete process.env.DISK_THRESHOLD;
      
      const { config } = requireConfig();
      expect(config.thresholds.disk).toBe(90);
    });

    it('should use default ERROR_RATE_THRESHOLD as 5', () => {
      setMinimalRequiredEnv();
      delete process.env.ERROR_RATE_THRESHOLD;
      
      const { config } = requireConfig();
      expect(config.thresholds.errorRate).toBe(5);
    });

    it('should use default RESPONSE_TIME_THRESHOLD_MS as 2000', () => {
      setMinimalRequiredEnv();
      delete process.env.RESPONSE_TIME_THRESHOLD_MS;
      
      const { config } = requireConfig();
      expect(config.thresholds.responseTime).toBe(2000);
    });

    it('should use default LOG_LEVEL as info', () => {
      setMinimalRequiredEnv();
      delete process.env.LOG_LEVEL;
      
      const { config } = requireConfig();
      expect(config.logging.level).toBe('info');
    });
  });

  describe('Custom Environment Values', () => {
    it('should use custom NODE_ENV when provided', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'production';
      
      const { config } = requireConfig();
      expect(config.env).toBe('production');
    });

    it('should use custom PORT when provided', () => {
      setMinimalRequiredEnv();
      process.env.PORT = '4000';
      
      const { config } = requireConfig();
      expect(config.port).toBe(4000);
    });

    it('should use custom SERVICE_NAME when provided', () => {
      setMinimalRequiredEnv();
      process.env.SERVICE_NAME = 'custom-monitoring';
      
      const { config } = requireConfig();
      expect(config.serviceName).toBe('custom-monitoring');
    });

    it('should use custom database configuration', () => {
      setMinimalRequiredEnv();
      process.env.DB_HOST = 'custom-db-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'custom_db';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'custom_pass';
      
      const { config } = requireConfig();
      
      expect(config.database).toEqual({
        host: 'custom-db-host',
        port: 5433,
        database: 'custom_db',
        user: 'custom_user',
        password: 'custom_pass',
      });
    });

    it('should use custom Redis configuration', () => {
      setMinimalRequiredEnv();
      process.env.REDIS_HOST = 'custom-redis';
      process.env.REDIS_PORT = '6380';
      
      const { config } = requireConfig();
      
      expect(config.redis).toEqual({
        host: 'custom-redis',
        port: 6380,
      });
    });

    it('should use custom intervals and convert to milliseconds', () => {
      setMinimalRequiredEnv();
      process.env.HEALTH_CHECK_INTERVAL = '45';
      process.env.METRIC_COLLECTION_INTERVAL = '120';
      process.env.ALERT_EVALUATION_INTERVAL = '90';
      
      const { config } = requireConfig();
      
      expect(config.intervals).toEqual({
        healthCheck: 45000,
        metricCollection: 120000,
        alertEvaluation: 90000,
      });
    });

    it('should use custom thresholds', () => {
      setMinimalRequiredEnv();
      process.env.CPU_THRESHOLD = '70';
      process.env.MEMORY_THRESHOLD = '75';
      process.env.DISK_THRESHOLD = '85';
      process.env.ERROR_RATE_THRESHOLD = '10';
      process.env.RESPONSE_TIME_THRESHOLD_MS = '3000';
      
      const { config } = requireConfig();
      
      expect(config.thresholds).toEqual({
        cpu: 70,
        memory: 75,
        disk: 85,
        errorRate: 10,
        responseTime: 3000,
      });
    });

    it('should use custom LOG_LEVEL', () => {
      setMinimalRequiredEnv();
      process.env.LOG_LEVEL = 'debug';
      
      const { config } = requireConfig();
      expect(config.logging.level).toBe('debug');
    });
  });

  describe('NODE_ENV Validation', () => {
    it('should accept development as NODE_ENV', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'development';
      
      expect(() => requireConfig()).not.toThrow();
    });

    it('should accept production as NODE_ENV', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'production';
      
      expect(() => requireConfig()).not.toThrow();
    });

    it('should accept test as NODE_ENV', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'test';
      
      expect(() => requireConfig()).not.toThrow();
    });

    it('should reject invalid NODE_ENV', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'staging';
      
      expect(() => requireConfig()).toThrow(/Config validation error/);
    });
  });

  describe('Type Coercion', () => {
    it('should convert string PORT to number', () => {
      setMinimalRequiredEnv();
      process.env.PORT = '8080';
      
      const { config } = requireConfig();
      
      expect(typeof config.port).toBe('number');
      expect(config.port).toBe(8080);
    });

    it('should convert string DB_PORT to number', () => {
      setMinimalRequiredEnv();
      process.env.DB_PORT = '5433';
      
      const { config } = requireConfig();
      
      expect(typeof config.database.port).toBe('number');
      expect(config.database.port).toBe(5433);
    });

    it('should convert string REDIS_PORT to number', () => {
      setMinimalRequiredEnv();
      process.env.REDIS_PORT = '6380';
      
      const { config } = requireConfig();
      
      expect(typeof config.redis.port).toBe('number');
      expect(config.redis.port).toBe(6380);
    });

    it('should reject non-numeric PORT', () => {
      setMinimalRequiredEnv();
      process.env.PORT = 'not-a-number';
      
      expect(() => requireConfig()).toThrow();
    });
  });

  describe('Service URLs Configuration', () => {
    it('should configure all service URLs correctly', () => {
      setMinimalRequiredEnv();
      
      const { config } = requireConfig();
      
      expect(config.services).toEqual({
        auth: 'http://auth-service:3001',
        venue: 'http://venue-service:3002',
        event: 'http://event-service:3003',
        ticket: 'http://ticket-service:3004',
        payment: 'http://payment-service:3005',
        marketplace: 'http://marketplace-service:3006',
        analytics: 'http://analytics-service:3016',
        apiGateway: 'http://api-gateway:3000',
      });
    });

    it('should allow custom service URLs', () => {
      setMinimalRequiredEnv();
      process.env.AUTH_SERVICE_URL = 'https://custom-auth.example.com';
      process.env.VENUE_SERVICE_URL = 'https://custom-venue.example.com';
      
      const { config } = requireConfig();
      
      expect(config.services.auth).toBe('https://custom-auth.example.com');
      expect(config.services.venue).toBe('https://custom-venue.example.com');
    });
  });

  describe('External Services Configuration', () => {
    it('should configure MongoDB correctly', () => {
      setMinimalRequiredEnv();
      process.env.MONGODB_URI = 'mongodb://mongo:27017/monitoring';
      
      const { config } = requireConfig();
      expect(config.mongodb.uri).toBe('mongodb://mongo:27017/monitoring');
    });

    it('should configure Elasticsearch correctly', () => {
      setMinimalRequiredEnv();
      process.env.ELASTICSEARCH_NODE = 'http://elasticsearch:9200';
      
      const { config } = requireConfig();
      expect(config.elasticsearch.node).toBe('http://elasticsearch:9200');
    });

    it('should configure InfluxDB correctly', () => {
      setMinimalRequiredEnv();
      process.env.INFLUXDB_URL = 'http://influxdb:8086';
      process.env.INFLUXDB_TOKEN = 'test-token';
      process.env.INFLUXDB_ORG = 'test-org';
      process.env.INFLUXDB_BUCKET = 'test-bucket';
      
      const { config } = requireConfig();
      
      expect(config.influxdb).toEqual({
        url: 'http://influxdb:8086',
        token: 'test-token',
        org: 'test-org',
        bucket: 'test-bucket',
      });
    });
  });

  describe('JWT Configuration', () => {
    it('should configure JWT secret', () => {
      setMinimalRequiredEnv();
      process.env.JWT_SECRET = 'super-secret-key';
      
      const { config } = requireConfig();
      expect(config.jwt.secret).toBe('super-secret-key');
    });
  });

  describe('CORS Configuration', () => {
    it('should set CORS origin to true in development', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'development';
      
      const { config } = requireConfig();
      expect(config.cors.origin).toBe(true);
    });

    it('should set CORS origin to true in test', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'test';
      
      const { config } = requireConfig();
      expect(config.cors.origin).toBe(true);
    });

    it('should restrict CORS origin in production', () => {
      setMinimalRequiredEnv();
      process.env.NODE_ENV = 'production';
      
      const { config } = requireConfig();
      expect(config.cors.origin).toEqual(['https://tickettoken.com']);
    });
  });

  describe('Config Structure', () => {
    it('should export config object with all required sections', () => {
      setMinimalRequiredEnv();
      
      const { config } = requireConfig();
      
      expect(config).toHaveProperty('env');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('serviceName');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('mongodb');
      expect(config).toHaveProperty('elasticsearch');
      expect(config).toHaveProperty('influxdb');
      expect(config).toHaveProperty('services');
      expect(config).toHaveProperty('intervals');
      expect(config).toHaveProperty('thresholds');
      expect(config).toHaveProperty('jwt');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('cors');
    });

    it('should have properly structured database config', () => {
      setMinimalRequiredEnv();
      
      const { config } = requireConfig();
      
      expect(config.database).toHaveProperty('host');
      expect(config.database).toHaveProperty('port');
      expect(config.database).toHaveProperty('database');
      expect(config.database).toHaveProperty('user');
      expect(config.database).toHaveProperty('password');
    });

    it('should have properly structured intervals config', () => {
      setMinimalRequiredEnv();
      
      const { config } = requireConfig();
      
      expect(config.intervals).toHaveProperty('healthCheck');
      expect(config.intervals).toHaveProperty('metricCollection');
      expect(config.intervals).toHaveProperty('alertEvaluation');
    });

    it('should have properly structured thresholds config', () => {
      setMinimalRequiredEnv();
      
      const { config } = requireConfig();
      
      expect(config.thresholds).toHaveProperty('cpu');
      expect(config.thresholds).toHaveProperty('memory');
      expect(config.thresholds).toHaveProperty('disk');
      expect(config.thresholds).toHaveProperty('errorRate');
      expect(config.thresholds).toHaveProperty('responseTime');
    });
  });

  describe('Unknown Environment Variables', () => {
    it('should allow unknown environment variables', () => {
      setMinimalRequiredEnv();
      process.env.SOME_UNKNOWN_VAR = 'value';
      process.env.ANOTHER_UNKNOWN = '123';
      
      expect(() => requireConfig()).not.toThrow();
    });
  });

  // Helper function to set minimal required environment
  function setMinimalRequiredEnv() {
    // Set all required variables with test values
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3013';  // Explicitly set to avoid picking up global test value
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_pass';
    process.env.REDIS_HOST = 'redis';  // Explicitly set to default value
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.ELASTICSEARCH_NODE = 'http://localhost:9200';
    process.env.INFLUXDB_URL = 'http://localhost:8086';
    process.env.INFLUXDB_TOKEN = 'test-token';
    process.env.INFLUXDB_ORG = 'test-org';
    process.env.INFLUXDB_BUCKET = 'test-bucket';
    process.env.AUTH_SERVICE_URL = 'http://auth-service:3001';
    process.env.VENUE_SERVICE_URL = 'http://venue-service:3002';
    process.env.EVENT_SERVICE_URL = 'http://event-service:3003';
    process.env.TICKET_SERVICE_URL = 'http://ticket-service:3004';
    process.env.PAYMENT_SERVICE_URL = 'http://payment-service:3005';
    process.env.MARKETPLACE_SERVICE_URL = 'http://marketplace-service:3006';
    process.env.ANALYTICS_SERVICE_URL = 'http://analytics-service:3016';
    process.env.API_GATEWAY_URL = 'http://api-gateway:3000';
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    process.env.LOG_LEVEL = 'info';  // Explicitly set to avoid picking up global test value
  }
});
