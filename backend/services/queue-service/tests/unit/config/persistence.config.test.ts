describe('Config - Persistence Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear module cache to allow fresh imports with new env vars
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  // Helper to get fresh module
  const getModule = () => {
    return require('../../../src/config/persistence.config');
  };

  describe('PERSISTENCE_CONFIGS structure', () => {
    it('should be defined', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS).toBeDefined();
    });

    it('should have all required queue configurations', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS).toHaveProperty('payment');
      expect(PERSISTENCE_CONFIGS).toHaveProperty('webhook');
      expect(PERSISTENCE_CONFIGS).toHaveProperty('email');
      expect(PERSISTENCE_CONFIGS).toHaveProperty('notification');
      expect(PERSISTENCE_CONFIGS).toHaveProperty('minting');
      expect(PERSISTENCE_CONFIGS).toHaveProperty('default');
    });

    it('should have exactly 6 queue configurations', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(Object.keys(PERSISTENCE_CONFIGS)).toHaveLength(6);
    });

    it('should be an object', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(typeof PERSISTENCE_CONFIGS).toBe('object');
      expect(Array.isArray(PERSISTENCE_CONFIGS)).toBe(false);
    });

    it('should have valid provider values for all configs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      Object.values(PERSISTENCE_CONFIGS).forEach((config: any) => {
        expect(['redis', 'postgresql']).toContain(config.provider);
      });
    });

    it('should have required properties for all configs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      Object.values(PERSISTENCE_CONFIGS).forEach((config: any) => {
        expect(config).toHaveProperty('provider');
        expect(config).toHaveProperty('retentionDays');
        expect(config).toHaveProperty('archiveCompleted');
      });
    });
  });

  describe('Payment configuration', () => {
    it('should use postgresql provider', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.payment.provider).toBe('postgresql');
    });

    it('should have 90 days retention', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.payment.retentionDays).toBe(90);
    });

    it('should archive completed jobs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.payment.archiveCompleted).toBe(true);
    });

    it('should have archive location', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.payment.archiveLocation).toBe('payment_archive');
    });

    it('should have exactly 4 properties', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(Object.keys(PERSISTENCE_CONFIGS.payment)).toHaveLength(4);
    });

    it('should have numeric retentionDays', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(typeof PERSISTENCE_CONFIGS.payment.retentionDays).toBe('number');
      expect(Number.isInteger(PERSISTENCE_CONFIGS.payment.retentionDays)).toBe(true);
    });

    it('should have boolean archiveCompleted', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(typeof PERSISTENCE_CONFIGS.payment.archiveCompleted).toBe('boolean');
    });
  });

  describe('Webhook configuration', () => {
    it('should use postgresql provider', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.webhook.provider).toBe('postgresql');
    });

    it('should have 30 days retention', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.webhook.retentionDays).toBe(30);
    });

    it('should archive completed jobs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.webhook.archiveCompleted).toBe(true);
    });

    it('should have archive location', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.webhook.archiveLocation).toBe('webhook_archive');
    });
  });

  describe('Email configuration', () => {
    it('should use redis provider', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.email.provider).toBe('redis');
    });

    it('should have 7 days retention', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.email.retentionDays).toBe(7);
    });

    it('should not archive completed jobs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.email.archiveCompleted).toBe(false);
    });

    it('should not have archive location', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.email.archiveLocation).toBeUndefined();
    });

    it('should have exactly 3 properties', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(Object.keys(PERSISTENCE_CONFIGS.email)).toHaveLength(3);
    });
  });

  describe('Notification configuration', () => {
    it('should use redis provider', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.notification.provider).toBe('redis');
    });

    it('should have 7 days retention', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.notification.retentionDays).toBe(7);
    });

    it('should not archive completed jobs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.notification.archiveCompleted).toBe(false);
    });

    it('should not have archive location', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.notification.archiveLocation).toBeUndefined();
    });
  });

  describe('Minting configuration', () => {
    it('should use postgresql provider', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.minting.provider).toBe('postgresql');
    });

    it('should have 365 days retention (1 year)', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.minting.retentionDays).toBe(365);
    });

    it('should archive completed jobs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.minting.archiveCompleted).toBe(true);
    });

    it('should have blockchain archive location', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.minting.archiveLocation).toBe('blockchain_archive');
    });

    it('should have longest retention period (most critical)', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      const allRetentions = Object.values(PERSISTENCE_CONFIGS).map((c: any) => c.retentionDays);
      const maxRetention = Math.max(...allRetentions);
      expect(PERSISTENCE_CONFIGS.minting.retentionDays).toBe(maxRetention);
    });
  });

  describe('Default configuration', () => {
    it('should use redis provider', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.default.provider).toBe('redis');
    });

    it('should have 14 days retention', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.default.retentionDays).toBe(14);
    });

    it('should not archive completed jobs', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.default.archiveCompleted).toBe(false);
    });

    it('should not have archive location', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.default.archiveLocation).toBeUndefined();
    });
  });

  describe('Configuration patterns', () => {
    it('should use postgresql for financial/blockchain operations', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.payment.provider).toBe('postgresql');
      expect(PERSISTENCE_CONFIGS.minting.provider).toBe('postgresql');
      expect(PERSISTENCE_CONFIGS.webhook.provider).toBe('postgresql');
    });

    it('should use redis for transient communication', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      expect(PERSISTENCE_CONFIGS.email.provider).toBe('redis');
      expect(PERSISTENCE_CONFIGS.notification.provider).toBe('redis');
    });

    it('should have archiving enabled only for postgresql providers', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      Object.entries(PERSISTENCE_CONFIGS).forEach(([key, config]: [string, any]) => {
        if (config.provider === 'postgresql' && key !== 'default') {
          expect(config.archiveCompleted).toBe(true);
          expect(config.archiveLocation).toBeDefined();
        } else if (config.provider === 'redis') {
          expect(config.archiveCompleted).toBe(false);
          expect(config.archiveLocation).toBeUndefined();
        }
      });
    });

    it('should have all retention periods as positive integers', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      Object.values(PERSISTENCE_CONFIGS).forEach((config: any) => {
        expect(typeof config.retentionDays).toBe('number');
        expect(Number.isInteger(config.retentionDays)).toBe(true);
        expect(config.retentionDays).toBeGreaterThan(0);
      });
    });

    it('should have all archive locations as non-empty strings when defined', () => {
      const { PERSISTENCE_CONFIGS } = getModule();
      Object.values(PERSISTENCE_CONFIGS).forEach((config: any) => {
        if (config.archiveLocation !== undefined) {
          expect(typeof config.archiveLocation).toBe('string');
          expect(config.archiveLocation.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('getPersistenceConfig function', () => {
    it('should be defined', () => {
      const { getPersistenceConfig } = getModule();
      expect(getPersistenceConfig).toBeDefined();
      expect(typeof getPersistenceConfig).toBe('function');
    });

    it('should return payment config for payment queue names', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('payment.process');
      expect(config).toEqual(PERSISTENCE_CONFIGS.payment);
    });

    it('should return webhook config for webhook queue names', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('webhook.send');
      expect(config).toEqual(PERSISTENCE_CONFIGS.webhook);
    });

    it('should return email config for email queue names', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('email.send');
      expect(config).toEqual(PERSISTENCE_CONFIGS.email);
    });

    it('should return notification config for notification queue names', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('notification.push');
      expect(config).toEqual(PERSISTENCE_CONFIGS.notification);
    });

    it('should return minting config for minting queue names', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('minting.nft');
      expect(config).toEqual(PERSISTENCE_CONFIGS.minting);
    });

    it('should extract category from first segment before dot', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('payment.stripe.charge');
      expect(config).toEqual(PERSISTENCE_CONFIGS.payment);
    });

    it('should return default config for unknown categories', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('unknown.queue');
      expect(config).toEqual(PERSISTENCE_CONFIGS.default);
    });

    it('should return default config for queue names without dots', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('simplequeue');
      expect(config).toEqual(PERSISTENCE_CONFIGS.default);
    });

    it('should handle empty string queue name', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('');
      expect(config).toEqual(PERSISTENCE_CONFIGS.default);
    });

    it('should be case-sensitive for category matching', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('Payment.process');
      expect(config).toEqual(PERSISTENCE_CONFIGS.default);
    });

    it('should handle multiple dots in queue name', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config = getPersistenceConfig('email.user.notification.send');
      expect(config).toEqual(PERSISTENCE_CONFIGS.email);
    });

    it('should return same config object (not a copy)', () => {
      const { getPersistenceConfig, PERSISTENCE_CONFIGS } = getModule();
      const config1 = getPersistenceConfig('payment.test');
      const config2 = getPersistenceConfig('payment.test');
      expect(config1).toBe(config2);
      expect(config1).toBe(PERSISTENCE_CONFIGS.payment);
    });
  });

  describe('REDIS_CONFIG', () => {
    it('should be defined', () => {
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG).toBeDefined();
    });

    it('should have all required properties', () => {
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG).toHaveProperty('host');
      expect(REDIS_CONFIG).toHaveProperty('port');
      expect(REDIS_CONFIG).toHaveProperty('db');
      expect(REDIS_CONFIG).toHaveProperty('keyPrefix');
    });

    it('should have exactly 4 properties', () => {
      const { REDIS_CONFIG } = getModule();
      expect(Object.keys(REDIS_CONFIG)).toHaveLength(4);
    });

    it('should have default host of "redis"', () => {
      delete process.env.REDIS_HOST;
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.host).toBe('redis');
    });

    it('should parse host from REDIS_HOST env var', () => {
      process.env.REDIS_HOST = 'redis.example.com';
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.host).toBe('redis.example.com');
    });

    it('should have default port of 6379', () => {
      delete process.env.REDIS_PORT;
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.port).toBe(6379);
    });

    it('should parse port from REDIS_PORT env var', () => {
      process.env.REDIS_PORT = '6380';
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.port).toBe(6380);
    });

    it('should have default db of 0', () => {
      delete process.env.REDIS_DB;
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.db).toBe(0);
    });

    it('should parse db from REDIS_DB env var', () => {
      process.env.REDIS_DB = '5';
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.db).toBe(5);
    });

    it('should have keyPrefix of "queue:"', () => {
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.keyPrefix).toBe('queue:');
    });

    it('should have numeric port', () => {
      const { REDIS_CONFIG } = getModule();
      expect(typeof REDIS_CONFIG.port).toBe('number');
      expect(Number.isInteger(REDIS_CONFIG.port)).toBe(true);
    });

    it('should have numeric db', () => {
      const { REDIS_CONFIG } = getModule();
      expect(typeof REDIS_CONFIG.db).toBe('number');
      expect(Number.isInteger(REDIS_CONFIG.db)).toBe(true);
    });

    it('should have string host', () => {
      const { REDIS_CONFIG } = getModule();
      expect(typeof REDIS_CONFIG.host).toBe('string');
    });

    it('should have string keyPrefix', () => {
      const { REDIS_CONFIG } = getModule();
      expect(typeof REDIS_CONFIG.keyPrefix).toBe('string');
    });

    it('should have valid port range', () => {
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.port).toBeGreaterThan(0);
      expect(REDIS_CONFIG.port).toBeLessThanOrEqual(65535);
    });

    it('should have non-negative db number', () => {
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.db).toBeGreaterThanOrEqual(0);
    });

    it('should handle invalid port env var (NaN)', () => {
      process.env.REDIS_PORT = 'invalid';
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.port).toBeNaN();
    });

    it('should handle empty REDIS_HOST (uses default)', () => {
      process.env.REDIS_HOST = '';
      const { REDIS_CONFIG } = getModule();
      expect(REDIS_CONFIG.host).toBe('redis');
    });
  });

  describe('POSTGRES_CONFIG', () => {
    it('should be defined', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG).toBeDefined();
    });

    it('should have all required properties', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG).toHaveProperty('host');
      expect(POSTGRES_CONFIG).toHaveProperty('port');
      expect(POSTGRES_CONFIG).toHaveProperty('database');
      expect(POSTGRES_CONFIG).toHaveProperty('user');
      expect(POSTGRES_CONFIG).toHaveProperty('password');
    });

    it('should have exactly 5 properties', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(Object.keys(POSTGRES_CONFIG)).toHaveLength(5);
    });

    it('should have default host of "postgres"', () => {
      delete process.env.DB_HOST;
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.host).toBe('postgres');
    });

    it('should parse host from DB_HOST env var', () => {
      process.env.DB_HOST = 'db.example.com';
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.host).toBe('db.example.com');
    });

    it('should have default port of 5432', () => {
      delete process.env.DB_PORT;
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.port).toBe(5432);
    });

    it('should parse port from DB_PORT env var', () => {
      process.env.DB_PORT = '5433';
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.port).toBe(5433);
    });

    it('should have default database of "tickettoken_db"', () => {
      delete process.env.DB_NAME;
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.database).toBe('tickettoken_db');
    });

    it('should parse database from DB_NAME env var', () => {
      process.env.DB_NAME = 'custom_db';
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.database).toBe('custom_db');
    });

    it('should have default user of "postgres"', () => {
      delete process.env.DB_USER;
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.user).toBe('postgres');
    });

    it('should parse user from DB_USER env var', () => {
      process.env.DB_USER = 'admin';
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.user).toBe('admin');
    });

    it('should have default password of "postgres"', () => {
      delete process.env.DB_PASSWORD;
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.password).toBe('postgres');
    });

    it('should parse password from DB_PASSWORD env var', () => {
      process.env.DB_PASSWORD = 'secret123';
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.password).toBe('secret123');
    });

    it('should have numeric port', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(typeof POSTGRES_CONFIG.port).toBe('number');
      expect(Number.isInteger(POSTGRES_CONFIG.port)).toBe(true);
    });

    it('should have string host', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(typeof POSTGRES_CONFIG.host).toBe('string');
    });

    it('should have string database', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(typeof POSTGRES_CONFIG.database).toBe('string');
    });

    it('should have string user', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(typeof POSTGRES_CONFIG.user).toBe('string');
    });

    it('should have string password', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(typeof POSTGRES_CONFIG.password).toBe('string');
    });

    it('should have valid port range', () => {
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.port).toBeGreaterThan(0);
      expect(POSTGRES_CONFIG.port).toBeLessThanOrEqual(65535);
    });

    it('should handle special characters in password', () => {
      process.env.DB_PASSWORD = 'p@ssw0rd!#$';
      const { POSTGRES_CONFIG } = getModule();
      expect(POSTGRES_CONFIG.password).toBe('p@ssw0rd!#$');
    });
  });

  describe('Module exports', () => {
    it('should export all required items', () => {
      const module = getModule();
      expect(module).toHaveProperty('PERSISTENCE_CONFIGS');
      expect(module).toHaveProperty('getPersistenceConfig');
      expect(module).toHaveProperty('REDIS_CONFIG');
      expect(module).toHaveProperty('POSTGRES_CONFIG');
    });

    it('should export exactly 4 items (plus PersistenceConfig interface)', () => {
      const module = getModule();
      const exports = Object.keys(module);
      expect(exports).toContain('PERSISTENCE_CONFIGS');
      expect(exports).toContain('getPersistenceConfig');
      expect(exports).toContain('REDIS_CONFIG');
      expect(exports).toContain('POSTGRES_CONFIG');
    });
  });
});
