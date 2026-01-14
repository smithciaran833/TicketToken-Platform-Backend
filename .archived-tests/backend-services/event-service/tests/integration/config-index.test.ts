/**
 * Config Index Integration Tests
 */

describe('Config Index', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  // ==========================================================================
  // config object
  // ==========================================================================
  describe('config', () => {
    it('should export config object', async () => {
      const { config } = await import('../../src/config/index');
      expect(config).toBeDefined();
    });

    it('should have port configuration', async () => {
      process.env.PORT = '4000';
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      expect(config.port).toBe(4000);
    });

    it('should default port to 3003', async () => {
      delete process.env.PORT;
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      expect(config.port).toBe(3003);
    });

    it('should have host configuration', async () => {
      process.env.HOST = '127.0.0.1';
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      expect(config.host).toBe('127.0.0.1');
    });

    it('should default host to 0.0.0.0', async () => {
      delete process.env.HOST;
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      expect(config.host).toBe('0.0.0.0');
    });

    it('should have environment configuration', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      expect(config.environment).toBe('production');
    });

    it('should default environment to development', async () => {
      delete process.env.NODE_ENV;
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      expect(config.environment).toBe('development');
    });

    it('should have database configuration', async () => {
      process.env.DB_HOST = 'db.example.com';
      process.env.DB_PORT = '5433';
      process.env.DB_USER = 'testuser';
      process.env.DB_PASSWORD = 'testpass';
      process.env.DB_NAME = 'testdb';
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      
      expect(config.database.host).toBe('db.example.com');
      expect(config.database.port).toBe(5433);
      expect(config.database.user).toBe('testuser');
      expect(config.database.password).toBe('testpass');
      expect(config.database.database).toBe('testdb');
    });

    it('should have database defaults', async () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      
      expect(config.database.host).toBe('postgres');
      expect(config.database.port).toBe(6432);
      expect(config.database.user).toBe('tickettoken_user');
      expect(config.database.password).toBe('');
      expect(config.database.database).toBe('tickettoken');
    });

    it('should have redis configuration', async () => {
      process.env.REDIS_HOST = 'redis.example.com';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'redispass';
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      
      expect(config.redis.host).toBe('redis.example.com');
      expect(config.redis.port).toBe(6380);
      expect(config.redis.password).toBe('redispass');
    });

    it('should have redis defaults', async () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      
      expect(config.redis.host).toBe('redis');
      expect(config.redis.port).toBe(6379);
      expect(config.redis.password).toBeUndefined();
    });

    it('should have services configuration', async () => {
      process.env.VENUE_SERVICE_URL = 'http://venue:4000';
      process.env.AUTH_SERVICE_URL = 'http://auth:4001';
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      
      expect(config.services.venueServiceUrl).toBe('http://venue:4000');
      expect(config.services.authServiceUrl).toBe('http://auth:4001');
    });

    it('should have services defaults', async () => {
      delete process.env.VENUE_SERVICE_URL;
      delete process.env.AUTH_SERVICE_URL;
      jest.resetModules();
      
      const { config } = await import('../../src/config/index');
      
      expect(config.services.venueServiceUrl).toBe('http://venue-service:3002');
      expect(config.services.authServiceUrl).toBe('http://auth-service:3001');
    });
  });
});
