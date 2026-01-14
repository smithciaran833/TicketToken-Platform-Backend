import { validateEnv, generateSecret } from '../../src/config/env-validation';

describe('Environment Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('Required Variables', () => {
    it('should validate successfully with all required variables', () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'test_user',
        DB_PASSWORD: 'test_password',
        DB_NAME: 'test_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      const config = validateEnv();
      
      expect(config.DB_HOST).toBe('localhost');
      expect(config.DB_PORT).toBe(5432);
      expect(config.JWT_SECRET).toBe('a'.repeat(32));
    });

    it('should fail with missing JWT_SECRET', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.JWT_SECRET;

      expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    });

    it('should fail with missing QR_ENCRYPTION_KEY', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.QR_ENCRYPTION_KEY;

      expect(() => validateEnv()).toThrow(/QR_ENCRYPTION_KEY/);
    });

    it('should fail with missing INTERNAL_WEBHOOK_SECRET', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32)
      };
      delete process.env.INTERNAL_WEBHOOK_SECRET;

      expect(() => validateEnv()).toThrow(/INTERNAL_WEBHOOK_SECRET/);
    });

    it('should fail with missing database credentials', () => {
      process.env = {
        ...process.env,
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.DB_HOST;

      expect(() => validateEnv()).toThrow(/DB_HOST/);
    });
  });

  describe('Secret Length Validation', () => {
    it('should fail with JWT_SECRET less than 32 characters', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'short',
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      expect(() => validateEnv()).toThrow(/32 characters/);
    });

    it('should fail with QR_ENCRYPTION_KEY less than 32 characters', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'short',
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      expect(() => validateEnv()).toThrow(/32 characters/);
    });

    it('should accept secrets with exactly 32 characters', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      const config = validateEnv();
      expect(config.JWT_SECRET).toHaveLength(32);
      expect(config.QR_ENCRYPTION_KEY).toHaveLength(32);
      expect(config.INTERNAL_WEBHOOK_SECRET).toHaveLength(32);
    });
  });

  describe('Default Values', () => {
    it('should apply default PORT value', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.PORT;

      const config = validateEnv();
      expect(config.PORT).toBe(3004);
    });

    it('should apply default NODE_ENV value', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.NODE_ENV;

      const config = validateEnv();
      expect(config.NODE_ENV).toBe('development');
    });

    it('should apply default LOG_LEVEL value', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.LOG_LEVEL;

      const config = validateEnv();
      expect(config.LOG_LEVEL).toBe('info');
    });
  });

  describe('Type Conversion', () => {
    it('should convert PORT string to number', () => {
      process.env = {
        ...process.env,
        PORT: '3005',
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      const config = validateEnv();
      expect(config.PORT).toBe(3005);
      expect(typeof config.PORT).toBe('number');
    });

    it('should convert DB_PORT string to number', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_PORT: '5433',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      const config = validateEnv();
      expect(config.DB_PORT).toBe(5433);
      expect(typeof config.DB_PORT).toBe('number');
    });

    it('should convert ENABLE_METRICS string to boolean', () => {
      process.env = {
        ...process.env,
        ENABLE_METRICS: 'true',
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      const config = validateEnv();
      expect(config.ENABLE_METRICS).toBe(true);
      expect(typeof config.ENABLE_METRICS).toBe('boolean');
    });
  });

  describe('Production-Specific Validation', () => {
    it('should require service URLs in production', () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.AUTH_SERVICE_URL;
      delete process.env.EVENT_SERVICE_URL;

      expect(() => validateEnv()).toThrow(/production/);
    });

    it('should not require service URLs in development', () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.AUTH_SERVICE_URL;

      const config = validateEnv();
      expect(config.NODE_ENV).toBe('development');
    });
  });

  describe('URL Construction', () => {
    it('should construct DATABASE_URL if not provided', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'testuser',
        DB_PASSWORD: 'testpass',
        DB_NAME: 'testdb',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.DATABASE_URL;

      const config = validateEnv();
      expect(config.DATABASE_URL).toContain('postgresql://');
      expect(config.DATABASE_URL).toContain('testuser');
      expect(config.DATABASE_URL).toContain('testpass');
      expect(config.DATABASE_URL).toContain('localhost');
      expect(config.DATABASE_URL).toContain('5432');
      expect(config.DATABASE_URL).toContain('testdb');
    });

    it('should construct REDIS_URL if not provided', () => {
      process.env = {
        ...process.env,
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'redis-host',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'redispass',
        REDIS_DB: '1',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };
      delete process.env.REDIS_URL;

      const config = validateEnv();
      expect(config.REDIS_URL).toContain('redis://');
      expect(config.REDIS_URL).toContain('redispass');
      expect(config.REDIS_URL).toContain('redis-host');
      expect(config.REDIS_URL).toContain('6380');
      expect(config.REDIS_URL).toContain('1');
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error message for invalid format', () => {
      process.env = {
        ...process.env,
        PORT: 'invalid',
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_NAME: 'test',
        REDIS_HOST: 'localhost',
        JWT_SECRET: 'a'.repeat(32),
        QR_ENCRYPTION_KEY: 'b'.repeat(32),
        INTERNAL_WEBHOOK_SECRET: 'c'.repeat(32)
      };

      expect(() => validateEnv()).toThrow();
    });

    it('should list all missing required variables', () => {
      process.env = {
        ...process.env,
        REDIS_HOST: 'localhost'
      };
      delete process.env.DB_HOST;
      delete process.env.JWT_SECRET;

      try {
        validateEnv();
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('validation failed');
      }
    });
  });

  describe('generateSecret Helper', () => {
    it('should generate secret of specified length', () => {
      const secret = generateSecret(32);
      expect(secret).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should generate different secrets each time', () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();
      expect(secret1).not.toBe(secret2);
    });

    it('should generate hex string', () => {
      const secret = generateSecret();
      expect(secret).toMatch(/^[0-9a-f]+$/);
    });
  });
});
