/**
 * Comprehensive Unit Tests for src/config/validate.ts
 * 
 * Tests configuration validation schemas and functions
 */

import { z } from 'zod';

// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  __esModule: true,
}));

// Import after mocking
import {
  validateConfig,
  validateDatabaseConfig,
  validateMongoConfig,
  validateRedisConfig,
  validateSolanaConfig,
  buildConfigFromEnv,
  validateRequiredEnvVars,
  validateConfigOrExit,
  testAllConnections,
  getConfigSummary,
  type AppConfig,
  type DatabaseConfig,
  type MongoConfig,
  type RedisConfig,
  type SolanaConfig,
  type AuthConfig,
} from '../../../src/config/validate';

import logger from '../../../src/utils/logger';

describe('src/config/validate.ts - Comprehensive Unit Tests', () => {
  
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Mock process.exit to prevent tests from exiting
    process.exit = jest.fn() as any;
  });

  afterAll(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  // =============================================================================
  // DATABASE CONFIG SCHEMA
  // =============================================================================

  describe('validateDatabaseConfig()', () => {
    it('should validate correct database config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const result = validateDatabaseConfig(config);
      
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(5432);
      expect(result.database).toBe('testdb');
    });

    it('should apply default values', () => {
      const config = {
        host: 'localhost',
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const result = validateDatabaseConfig(config);
      
      expect(result.port).toBe(5432);
      expect(result.ssl).toBe(true);
      expect(result.poolMin).toBe(2);
      expect(result.poolMax).toBe(10);
    });

    it('should reject empty host', () => {
      const config = {
        host: '',
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      expect(() => validateDatabaseConfig(config)).toThrow();
    });

    it('should reject missing database name', () => {
      const config = {
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
      };

      expect(() => validateDatabaseConfig(config)).toThrow();
    });

    it('should reject negative port', () => {
      const config = {
        host: 'localhost',
        port: -1,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      expect(() => validateDatabaseConfig(config)).toThrow();
    });

    it('should reject poolMin > poolMax', () => {
      const config = {
        host: 'localhost',
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        poolMin: 10,
        poolMax: 5,
      };

      expect(() => validateDatabaseConfig(config)).toThrow('Pool min must be <= pool max');
    });

    it('should accept poolMin == poolMax', () => {
      const config = {
        host: 'localhost',
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        poolMin: 5,
        poolMax: 5,
      };

      expect(() => validateDatabaseConfig(config)).not.toThrow();
    });
  });

  // =============================================================================
  // MONGODB CONFIG SCHEMA
  // =============================================================================

  describe('validateMongoConfig()', () => {
    it('should validate correct MongoDB config with URL', () => {
      const config = {
        uri: 'mongodb://localhost:27017',
        database: 'testdb',
      };

      const result = validateMongoConfig(config);
      
      expect(result.uri).toBe('mongodb://localhost:27017');
      expect(result.database).toBe('testdb');
    });

    it('should validate MongoDB srv connection string', () => {
      const config = {
        uri: 'mongodb+srv://cluster.mongodb.net',
        database: 'testdb',
      };

      const result = validateMongoConfig(config);
      
      expect(result.uri).toBe('mongodb+srv://cluster.mongodb.net');
    });

    it('should apply default pool sizes', () => {
      const config = {
        uri: 'mongodb://localhost:27017',
        database: 'testdb',
      };

      const result = validateMongoConfig(config);
      
      expect(result.maxPoolSize).toBe(10);
      expect(result.minPoolSize).toBe(1);
      expect(result.retryWrites).toBe(true);
      expect(result.retryReads).toBe(true);
    });

    it('should reject invalid URI', () => {
      const config = {
        uri: 'not-a-valid-uri',
        database: 'testdb',
      };

      expect(() => validateMongoConfig(config)).toThrow();
    });
  });

  // =============================================================================
  // REDIS CONFIG SCHEMA
  // =============================================================================

  describe('validateRedisConfig()', () => {
    it('should validate correct Redis config', () => {
      const config = {
        host: 'localhost',
        port: 6379,
      };

      const result = validateRedisConfig(config);
      
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(6379);
    });

    it('should apply default values', () => {
      const config = {
        host: 'localhost',
      };

      const result = validateRedisConfig(config);
      
      expect(result.port).toBe(6379);
      expect(result.db).toBe(0);
      expect(result.keyPrefix).toBe('blockchain-indexer:');
      expect(result.tls).toBe(false);
    });

    it('should accept optional password', () => {
      const config = {
        host: 'localhost',
        password: 'secret',
      };

      const result = validateRedisConfig(config);
      
      expect(result.password).toBe('secret');
    });

    it('should reject empty host', () => {
      const config = {
        host: '',
      };

      expect(() => validateRedisConfig(config)).toThrow();
    });
  });

  // =============================================================================
  // SOLANA CONFIG SCHEMA
  // =============================================================================

  describe('validateSolanaConfig()', () => {
    it('should validate correct Solana config', () => {
      const config = {
        primaryRpcUrl: 'https://api.mainnet-beta.solana.com',
      };

      const result = validateSolanaConfig(config);
      
      expect(result.primaryRpcUrl).toBe('https://api.mainnet-beta.solana.com');
      expect(result.commitment).toBe('confirmed');
    });

    it('should validate with fallback URLs', () => {
      const config = {
        primaryRpcUrl: 'https://api.mainnet-beta.solana.com',
        fallbackRpcUrls: ['https://fallback1.com', 'https://fallback2.com'],
      };

      const result = validateSolanaConfig(config);
      
      expect(result.fallbackRpcUrls).toHaveLength(2);
    });

    it('should validate commitment levels', () => {
      const commitments: ('processed' | 'confirmed' | 'finalized')[] = ['processed', 'confirmed', 'finalized'];
      
      commitments.forEach(commitment => {
        const config = {
          primaryRpcUrl: 'https://api.mainnet-beta.solana.com',
          commitment,
        };
        
        expect(() => validateSolanaConfig(config)).not.toThrow();
      });
    });

    it('should reject invalid commitment', () => {
      const config = {
        primaryRpcUrl: 'https://api.mainnet-beta.solana.com',
        commitment: 'invalid',
      };

      expect(() => validateSolanaConfig(config)).toThrow();
    });

    it('should reject invalid URL', () => {
      const config = {
        primaryRpcUrl: 'not-a-url',
      };

      expect(() => validateSolanaConfig(config)).toThrow();
    });
  });

  // =============================================================================
  // AUTH CONFIG SCHEMA - SEC-6 AUDIT FIX
  // =============================================================================

  describe('AuthConfig - SEC-6 defaultTenantId validation', () => {
    it('should reject config with defaultTenantId set', () => {
      const config = {
        jwtSecret: 'a'.repeat(32),
        defaultTenantId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(() => validateConfig({ 
        nodeEnv: 'development',
        serviceName: 'test',
        serviceVersion: '1.0.0',
        database: { host: 'localhost', database: 'test', user: 'test', password: 'test' },
        mongodb: { uri: 'mongodb://localhost', database: 'test' },
        redis: { host: 'localhost' },
        solana: { primaryRpcUrl: 'https://api.solana.com' },
        auth: config,
        rateLimit: {},
        indexer: {},
        server: {},
        logging: {},
      })).toThrow('Default tenant ID should not be configured');
    });

    it('should accept config without defaultTenantId', () => {
      const config = {
        jwtSecret: 'a'.repeat(32),
      };

      expect(() => validateConfig({
        nodeEnv: 'development',
        serviceName: 'test',
        serviceVersion: '1.0.0',
        database: { host: 'localhost', database: 'test', user: 'test', password: 'test' },
        mongodb: { uri: 'mongodb://localhost', database: 'test' },
        redis: { host: 'localhost' },
        solana: { primaryRpcUrl: 'https://api.solana.com' },
        auth: config,
        rateLimit: {},
        indexer: {},
        server: {},
        logging: {},
      })).not.toThrow();
    });

    it('should reject JWT secret shorter than 32 characters', () => {
      const config = {
        jwtSecret: 'short',
      };

      expect(() => validateConfig({
        nodeEnv: 'development',
        serviceName: 'test',
        serviceVersion: '1.0.0',
        database: { host: 'localhost', database: 'test', user: 'test', password: 'test' },
        mongodb: { uri: 'mongodb://localhost', database: 'test' },
        redis: { host: 'localhost' },
        solana: { primaryRpcUrl: 'https://api.solana.com' },
        auth: config,
        rateLimit: {},
        indexer: {},
        server: {},
        logging: {},
      })).toThrow();
    });
  });

  // =============================================================================
  // FULL APP CONFIG VALIDATION
  // =============================================================================

  describe('validateConfig()', () => {
    const validConfig = {
      nodeEnv: 'development' as const,
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      database: {
        host: 'localhost',
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      },
      mongodb: {
        uri: 'mongodb://localhost:27017',
        database: 'testdb',
      },
      redis: {
        host: 'localhost',
      },
      solana: {
        primaryRpcUrl: 'https://api.solana.com',
      },
      auth: {
        jwtSecret: 'a'.repeat(32),
      },
      rateLimit: {},
      indexer: {},
      server: {},
      logging: {},
    };

    it('should validate correct full config', () => {
      const result = validateConfig(validConfig);
      
      expect(result.nodeEnv).toBe('development');
      expect(result.serviceName).toBe('test-service');
    });

    it('should log and throw on validation error', () => {
      const invalidConfig = {
        ...validConfig,
        database: {
          host: '',
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow('Invalid configuration');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should format multiple validation errors', () => {
      const invalidConfig = {
        ...validConfig,
        database: {
          host: '',
          database: '',
          user: '',
          password: '',
        },
      };

      try {
        validateConfig(invalidConfig);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Invalid configuration');
      }
    });
  });

  // =============================================================================
  // BUILD CONFIG FROM ENV - CFG-3 AUDIT FIX
  // =============================================================================

  describe('buildConfigFromEnv() - safe parseInt', () => {
    beforeEach(() => {
      // Set minimum required env vars
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_NAME = 'testdb';
      process.env.DATABASE_USER = 'testuser';
      process.env.DATABASE_PASSWORD = 'testpass';
      process.env.MONGODB_URI = 'mongodb://localhost';
      process.env.REDIS_HOST = 'localhost';
      process.env.SOLANA_RPC_URL = 'https://api.solana.com';
      process.env.JWT_SECRET = 'a'.repeat(32);
    });

    it('should build valid config from environment', () => {
      const config = buildConfigFromEnv();
      
      expect(config.database.host).toBe('localhost');
      expect(config.database.database).toBe('testdb');
    });

    it('should handle NaN from parseInt gracefully', () => {
      process.env.DATABASE_PORT = 'not-a-number';
      
      const config = buildConfigFromEnv();
      
      // Should use default instead of NaN
      expect(config.database.port).toBe(5432);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle empty string for integer fields', () => {
      process.env.DATABASE_PORT = '';
      
      const config = buildConfigFromEnv();
      
      expect(config.database.port).toBe(5432);
    });

    it('should handle undefined for integer fields', () => {
      delete process.env.DATABASE_PORT;
      
      const config = buildConfigFromEnv();
      
      expect(config.database.port).toBe(5432);
    });

    it('should parse boolean true values', () => {
      process.env.DATABASE_SSL = 'true';
      
      const config = buildConfigFromEnv();
      
      expect(config.database.ssl).toBe(true);
    });

    it('should parse boolean false values', () => {
      process.env.DATABASE_SSL = 'false';
      
      const config = buildConfigFromEnv();
      
      expect(config.database.ssl).toBe(false);
    });

    it('should handle various truthy boolean strings', () => {
      const truthyValues = ['true', 'TRUE', '1', 'yes', 'YES'];
      
      truthyValues.forEach(value => {
        jest.clearAllMocks();
        process.env.DATABASE_SSL = value;
        
        const config = buildConfigFromEnv();
        
        expect(config.database.ssl).toBe(true);
      });
    });

    it('should handle various falsy boolean strings', () => {
      const falsyValues = ['false', 'FALSE', '0', 'no', 'NO'];
      
      falsyValues.forEach(value => {
        jest.clearAllMocks();
        process.env.DATABASE_SSL = value;
        
        const config = buildConfigFromEnv();
        
        expect(config.database.ssl).toBe(false);
      });
    });

    it('should use default for invalid boolean string', () => {
      process.env.DATABASE_SSL = 'invalid';
      
      const config = buildConfigFromEnv();
      
      expect(config.database.ssl).toBe(true); // default
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should parse comma-separated fallback URLs', () => {
      process.env.SOLANA_FALLBACK_RPC_URLS = 'https://fallback1.com,https://fallback2.com';
      
      const config = buildConfigFromEnv();
      
      expect(config.solana.fallbackRpcUrls).toHaveLength(2);
    });

    it('should handle empty fallback URLs', () => {
      delete process.env.SOLANA_FALLBACK_RPC_URLS;
      
      const config = buildConfigFromEnv();
      
      expect(config.solana.fallbackRpcUrls).toEqual([]);
    });

    it('should never set defaultTenantId', () => {
      const config = buildConfigFromEnv();
      
      expect(config.auth.defaultTenantId).toBeUndefined();
    });
  });

  // =============================================================================
  // VALIDATE REQUIRED ENV VARS
  // =============================================================================

  describe('validateRequiredEnvVars()', () => {
    it('should pass when all required vars are set', () => {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_NAME = 'testdb';
      process.env.DATABASE_USER = 'testuser';
      process.env.DATABASE_PASSWORD = 'testpass';
      process.env.MONGODB_URI = 'mongodb://localhost';
      process.env.REDIS_HOST = 'localhost';
      process.env.SOLANA_RPC_URL = 'https://api.solana.com';
      process.env.JWT_SECRET = 'secret';

      expect(() => validateRequiredEnvVars()).not.toThrow();
    });

    it('should throw when DATABASE_HOST is missing', () => {
      delete process.env.DATABASE_HOST;
      process.env.DATABASE_NAME = 'testdb';
      process.env.DATABASE_USER = 'testuser';
      process.env.DATABASE_PASSWORD = 'testpass';
      process.env.MONGODB_URI = 'mongodb://localhost';
      process.env.REDIS_HOST = 'localhost';
      process.env.SOLANA_RPC_URL = 'https://api.solana.com';
      process.env.JWT_SECRET = 'secret';

      expect(() => validateRequiredEnvVars()).toThrow('DATABASE_HOST');
    });

    it('should list all missing variables', () => {
      delete process.env.DATABASE_HOST;
      delete process.env.JWT_SECRET;

      try {
        validateRequiredEnvVars();
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('DATABASE_HOST');
        expect(error.message).toContain('JWT_SECRET');
      }
    });
  });

  // =============================================================================
  // VALIDATE CONFIG OR EXIT
  // =============================================================================

  describe('validateConfigOrExit()', () => {
    it('should return config and log success when valid', () => {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_NAME = 'testdb';
      process.env.DATABASE_USER = 'testuser';
      process.env.DATABASE_PASSWORD = 'testpass';
      process.env.MONGODB_URI = 'mongodb://localhost';
      process.env.REDIS_HOST = 'localhost';
      process.env.SOLANA_RPC_URL = 'https://api.solana.com';
      process.env.JWT_SECRET = 'a'.repeat(32);

      const config = validateConfigOrExit();
      
      expect(config).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith('Configuration validation passed');
    });

    it('should exit process on validation failure', () => {
      delete process.env.DATABASE_HOST;

      validateConfigOrExit();
      
      expect(logger.error).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // =============================================================================
  // TEST ALL CONNECTIONS
  // =============================================================================

  describe('testAllConnections()', () => {
    it('should return connection test results', async () => {
      const results = await testAllConnections();
      
      expect(results).toHaveProperty('postgresql');
      expect(results).toHaveProperty('mongodb');
      expect(results).toHaveProperty('redis');
    });

    it('should log debug messages for successful tests', async () => {
      await testAllConnections();
      
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GET CONFIG SUMMARY
  // =============================================================================

  describe('getConfigSummary()', () => {
    it('should return config summary without sensitive data', () => {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_NAME = 'testdb';
      process.env.DATABASE_PASSWORD = 'secretpassword';

      const summary = getConfigSummary();
      
      expect(summary.database.host).toBe('***');
      expect(summary.database.database).toBe('testdb');
      expect(summary.database).not.toHaveProperty('password');
    });

    it('should show "not set" for missing values', () => {
      delete process.env.DATABASE_HOST;

      const summary = getConfigSummary();
      
      expect(summary.database.host).toBe('not set');
    });

    it('should include service metadata', () => {
      const summary = getConfigSummary();
      
      expect(summary.serviceName).toBe('blockchain-indexer');
      expect(summary).toHaveProperty('nodeEnv');
    });
  });

  // =============================================================================
  // TYPE EXPORTS
  // =============================================================================

  describe('type exports', () => {
    it('should export AppConfig type', () => {
      // TypeScript compilation test - if this compiles, the type exists
      const config: AppConfig = {
        nodeEnv: 'development',
        serviceName: 'test',
        serviceVersion: '1.0.0',
        database: {} as DatabaseConfig,
        mongodb: {} as MongoConfig,
        redis: {} as RedisConfig,
        solana: {} as SolanaConfig,
        auth: {} as AuthConfig,
        rateLimit: {},
        indexer: {},
        server: {},
        logging: {},
      } as any;
      
      expect(config).toBeDefined();
    });
  });

});
