/**
 * Comprehensive Unit Tests for src/config/index.ts
 * 
 * Tests configuration loading, defaults, and environment variable overrides
 * 
 * NOTE: These tests account for dotenv loading .env file on module import
 */

describe('src/config/index.ts - Comprehensive Unit Tests', () => {
  
  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get fresh config on each test
    jest.resetModules();
    // Create a clean copy of environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  // =============================================================================
  // DATABASE CONFIGURATION
  // =============================================================================

  describe('database configuration', () => {
    it('should read database host from environment or use default', () => {
      const config = require('../../../src/config').default;
      // Will be either from .env or default 'postgres'
      expect(config.database.host).toBeDefined();
      expect(typeof config.database.host).toBe('string');
    });

    it('should use DB_HOST from environment when explicitly set', () => {
      process.env.DB_HOST = 'custom-postgres-host';
      const config = require('../../../src/config').default;
      expect(config.database.host).toBe('custom-postgres-host');
    });

    it('should read database port from environment or use default', () => {
      const config = require('../../../src/config').default;
      expect(config.database.port).toBeDefined();
      expect(typeof config.database.port).toBe('number');
    });

    it('should use DB_PORT from environment when explicitly set', () => {
      process.env.DB_PORT = '9999';
      const config = require('../../../src/config').default;
      expect(config.database.port).toBe(9999);
    });

    it('should parse DB_PORT as integer', () => {
      process.env.DB_PORT = '7777';
      const config = require('../../../src/config').default;
      expect(config.database.port).toBe(7777);
      expect(typeof config.database.port).toBe('number');
    });

    it('should read database name from environment or use default', () => {
      const config = require('../../../src/config').default;
      expect(config.database.database).toBeDefined();
      expect(typeof config.database.database).toBe('string');
    });

    it('should use DB_NAME from environment when explicitly set', () => {
      process.env.DB_NAME = 'custom_database';
      const config = require('../../../src/config').default;
      expect(config.database.database).toBe('custom_database');
    });

    it('should have database user defined', () => {
      const config = require('../../../src/config').default;
      // May be undefined or set from .env
      expect(config.database).toHaveProperty('user');
    });

    it('should use DB_USER from environment when explicitly set', () => {
      process.env.DB_USER = 'custom_admin';
      const config = require('../../../src/config').default;
      expect(config.database.user).toBe('custom_admin');
    });

    it('should have database password defined', () => {
      const config = require('../../../src/config').default;
      // May be undefined or set from .env
      expect(config.database).toHaveProperty('password');
    });

    it('should use DB_PASSWORD from environment when explicitly set', () => {
      process.env.DB_PASSWORD = 'custom_secret123';
      const config = require('../../../src/config').default;
      expect(config.database.password).toBe('custom_secret123');
    });
  });

  // =============================================================================
  // SOLANA CONFIGURATION
  // =============================================================================

  describe('solana configuration', () => {
    it('should have Solana network defined with default or env value', () => {
      const config = require('../../../src/config').default;
      expect(config.solana.network).toBeDefined();
      expect(typeof config.solana.network).toBe('string');
    });

    it('should use SOLANA_NETWORK from environment when explicitly set', () => {
      process.env.SOLANA_NETWORK = 'mainnet-beta';
      const config = require('../../../src/config').default;
      expect(config.solana.network).toBe('mainnet-beta');
    });

    it('should have Solana RPC URL defined', () => {
      const config = require('../../../src/config').default;
      expect(config.solana.rpcUrl).toBeDefined();
      expect(typeof config.solana.rpcUrl).toBe('string');
      expect(config.solana.rpcUrl).toMatch(/^https?:\/\//);
    });

    it('should use SOLANA_RPC_URL from environment when explicitly set', () => {
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.solana.com';
      const config = require('../../../src/config').default;
      expect(config.solana.rpcUrl).toBe('https://custom-rpc.solana.com');
    });

    it('should have Solana WS URL defined', () => {
      const config = require('../../../src/config').default;
      expect(config.solana.wsUrl).toBeDefined();
      expect(typeof config.solana.wsUrl).toBe('string');
      expect(config.solana.wsUrl).toMatch(/^wss?:\/\//);
    });

    it('should use SOLANA_WS_URL from environment when explicitly set', () => {
      process.env.SOLANA_WS_URL = 'wss://custom-ws.solana.com';
      const config = require('../../../src/config').default;
      expect(config.solana.wsUrl).toBe('wss://custom-ws.solana.com');
    });

    it('should have commitment level defined', () => {
      const config = require('../../../src/config').default;
      expect(config.solana.commitment).toBeDefined();
      expect(typeof config.solana.commitment).toBe('string');
    });

    it('should use SOLANA_COMMITMENT from environment when explicitly set', () => {
      process.env.SOLANA_COMMITMENT = 'finalized';
      const config = require('../../../src/config').default;
      expect(config.solana.commitment).toBe('finalized');
    });

    it('should have programId property', () => {
      const config = require('../../../src/config').default;
      expect(config.solana).toHaveProperty('programId');
    });

    it('should use PROGRAM_ID from environment when explicitly set', () => {
      process.env.PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const config = require('../../../src/config').default;
      expect(config.solana.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    });
  });

  // =============================================================================
  // INDEXER CONFIGURATION
  // =============================================================================

  describe('indexer configuration', () => {
    it('should have indexer port defined', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer.port).toBeDefined();
      expect(typeof config.indexer.port).toBe('number');
    });

    it('should use INDEXER_PORT from environment when explicitly set', () => {
      process.env.INDEXER_PORT = '8080';
      const config = require('../../../src/config').default;
      expect(config.indexer.port).toBe(8080);
    });

    it('should parse INDEXER_PORT as integer', () => {
      process.env.INDEXER_PORT = '9999';
      const config = require('../../../src/config').default;
      expect(config.indexer.port).toBe(9999);
      expect(typeof config.indexer.port).toBe('number');
    });

    it('should have batch size defined', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer.batchSize).toBeDefined();
      expect(typeof config.indexer.batchSize).toBe('number');
    });

    it('should use INDEXER_BATCH_SIZE from environment when explicitly set', () => {
      process.env.INDEXER_BATCH_SIZE = '500';
      const config = require('../../../src/config').default;
      expect(config.indexer.batchSize).toBe(500);
    });

    it('should parse INDEXER_BATCH_SIZE as integer', () => {
      process.env.INDEXER_BATCH_SIZE = '2000';
      const config = require('../../../src/config').default;
      expect(config.indexer.batchSize).toBe(2000);
      expect(typeof config.indexer.batchSize).toBe('number');
    });

    it('should have max concurrent defined', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer.maxConcurrent).toBeDefined();
      expect(typeof config.indexer.maxConcurrent).toBe('number');
    });

    it('should use INDEXER_MAX_CONCURRENT from environment when explicitly set', () => {
      process.env.INDEXER_MAX_CONCURRENT = '10';
      const config = require('../../../src/config').default;
      expect(config.indexer.maxConcurrent).toBe(10);
    });

    it('should parse INDEXER_MAX_CONCURRENT as integer', () => {
      process.env.INDEXER_MAX_CONCURRENT = '20';
      const config = require('../../../src/config').default;
      expect(config.indexer.maxConcurrent).toBe(20);
      expect(typeof config.indexer.maxConcurrent).toBe('number');
    });

    it('should have reconciliation interval defined', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer.reconciliationInterval).toBeDefined();
      expect(typeof config.indexer.reconciliationInterval).toBe('number');
    });

    it('should use RECONCILIATION_INTERVAL from environment when explicitly set', () => {
      process.env.RECONCILIATION_INTERVAL = '600000';
      const config = require('../../../src/config').default;
      expect(config.indexer.reconciliationInterval).toBe(600000);
    });

    it('should parse RECONCILIATION_INTERVAL as integer', () => {
      process.env.RECONCILIATION_INTERVAL = '900000';
      const config = require('../../../src/config').default;
      expect(config.indexer.reconciliationInterval).toBe(900000);
      expect(typeof config.indexer.reconciliationInterval).toBe('number');
    });

    it('should have sync lag threshold defined', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer.syncLagThreshold).toBeDefined();
      expect(typeof config.indexer.syncLagThreshold).toBe('number');
    });

    it('should use SYNC_LAG_THRESHOLD from environment when explicitly set', () => {
      process.env.SYNC_LAG_THRESHOLD = '2000';
      const config = require('../../../src/config').default;
      expect(config.indexer.syncLagThreshold).toBe(2000);
    });

    it('should parse SYNC_LAG_THRESHOLD as integer', () => {
      process.env.SYNC_LAG_THRESHOLD = '5000';
      const config = require('../../../src/config').default;
      expect(config.indexer.syncLagThreshold).toBe(5000);
      expect(typeof config.indexer.syncLagThreshold).toBe('number');
    });
  });

  // =============================================================================
  // MARKETPLACES CONFIGURATION
  // =============================================================================

  describe('marketplaces configuration', () => {
    it('should have magicEden property', () => {
      const config = require('../../../src/config').default;
      expect(config.marketplaces).toHaveProperty('magicEden');
    });

    it('should use MARKETPLACE_MAGIC_EDEN from environment when explicitly set', () => {
      process.env.MARKETPLACE_MAGIC_EDEN = 'MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8';
      const config = require('../../../src/config').default;
      expect(config.marketplaces.magicEden).toBe('MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8');
    });

    it('should have tensor property', () => {
      const config = require('../../../src/config').default;
      expect(config.marketplaces).toHaveProperty('tensor');
    });

    it('should use MARKETPLACE_TENSOR from environment when explicitly set', () => {
      process.env.MARKETPLACE_TENSOR = 'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN';
      const config = require('../../../src/config').default;
      expect(config.marketplaces.tensor).toBe('TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN');
    });
  });

  // =============================================================================
  // REDIS CONFIGURATION
  // =============================================================================

  describe('redis configuration', () => {
    it('should have Redis host defined', () => {
      const config = require('../../../src/config').default;
      expect(config.redis.host).toBeDefined();
      expect(typeof config.redis.host).toBe('string');
    });

    it('should use REDIS_HOST from environment when explicitly set', () => {
      process.env.REDIS_HOST = 'custom-redis-host';
      const config = require('../../../src/config').default;
      expect(config.redis.host).toBe('custom-redis-host');
    });

    it('should have Redis port defined', () => {
      const config = require('../../../src/config').default;
      expect(config.redis.port).toBeDefined();
      expect(typeof config.redis.port).toBe('number');
    });

    it('should use REDIS_PORT from environment when explicitly set', () => {
      process.env.REDIS_PORT = '6380';
      const config = require('../../../src/config').default;
      expect(config.redis.port).toBe(6380);
    });

    it('should parse REDIS_PORT as integer', () => {
      process.env.REDIS_PORT = '7000';
      const config = require('../../../src/config').default;
      expect(config.redis.port).toBe(7000);
      expect(typeof config.redis.port).toBe('number');
    });

    it('should have Redis password property', () => {
      const config = require('../../../src/config').default;
      expect(config.redis).toHaveProperty('password');
    });

    it('should use REDIS_PASSWORD from environment when explicitly set', () => {
      process.env.REDIS_PASSWORD = 'redisSecret123';
      const config = require('../../../src/config').default;
      expect(config.redis.password).toBe('redisSecret123');
    });
  });

  // =============================================================================
  // GENERAL CONFIGURATION
  // =============================================================================

  describe('general configuration', () => {
    it('should have log level defined', () => {
      const config = require('../../../src/config').default;
      expect(config.logLevel).toBeDefined();
      expect(typeof config.logLevel).toBe('string');
    });

    it('should use LOG_LEVEL from environment when explicitly set', () => {
      process.env.LOG_LEVEL = 'debug';
      const config = require('../../../src/config').default;
      expect(config.logLevel).toBe('debug');
    });

    it('should accept various log levels', () => {
      const levels = ['error', 'warn', 'info', 'debug', 'trace'];
      levels.forEach(level => {
        jest.resetModules();
        process.env.LOG_LEVEL = level;
        const config = require('../../../src/config').default;
        expect(config.logLevel).toBe(level);
      });
    });

    it('should have node environment defined', () => {
      const config = require('../../../src/config').default;
      expect(config.nodeEnv).toBeDefined();
      expect(typeof config.nodeEnv).toBe('string');
    });

    it('should use NODE_ENV from environment when explicitly set', () => {
      process.env.NODE_ENV = 'production';
      const config = require('../../../src/config').default;
      expect(config.nodeEnv).toBe('production');
    });

    it('should accept staging environment', () => {
      process.env.NODE_ENV = 'staging';
      const config = require('../../../src/config').default;
      expect(config.nodeEnv).toBe('staging');
    });
  });

  // =============================================================================
  // STRUCTURE AND EXPORTS
  // =============================================================================

  describe('config structure', () => {
    it('should export config as default export', () => {
      const config = require('../../../src/config').default;
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have database property', () => {
      const config = require('../../../src/config').default;
      expect(config.database).toBeDefined();
      expect(typeof config.database).toBe('object');
    });

    it('should have all required database fields', () => {
      const config = require('../../../src/config').default;
      expect(config.database).toHaveProperty('host');
      expect(config.database).toHaveProperty('port');
      expect(config.database).toHaveProperty('database');
      expect(config.database).toHaveProperty('user');
      expect(config.database).toHaveProperty('password');
    });

    it('should have solana property', () => {
      const config = require('../../../src/config').default;
      expect(config.solana).toBeDefined();
      expect(typeof config.solana).toBe('object');
    });

    it('should have all required solana fields', () => {
      const config = require('../../../src/config').default;
      expect(config.solana).toHaveProperty('network');
      expect(config.solana).toHaveProperty('rpcUrl');
      expect(config.solana).toHaveProperty('wsUrl');
      expect(config.solana).toHaveProperty('commitment');
      expect(config.solana).toHaveProperty('programId');
    });

    it('should have indexer property', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer).toBeDefined();
      expect(typeof config.indexer).toBe('object');
    });

    it('should have all required indexer fields', () => {
      const config = require('../../../src/config').default;
      expect(config.indexer).toHaveProperty('port');
      expect(config.indexer).toHaveProperty('batchSize');
      expect(config.indexer).toHaveProperty('maxConcurrent');
      expect(config.indexer).toHaveProperty('reconciliationInterval');
      expect(config.indexer).toHaveProperty('syncLagThreshold');
    });

    it('should have marketplaces property', () => {
      const config = require('../../../src/config').default;
      expect(config.marketplaces).toBeDefined();
      expect(typeof config.marketplaces).toBe('object');
    });

    it('should have all marketplace fields', () => {
      const config = require('../../../src/config').default;
      expect(config.marketplaces).toHaveProperty('magicEden');
      expect(config.marketplaces).toHaveProperty('tensor');
    });

    it('should have redis property', () => {
      const config = require('../../../src/config').default;
      expect(config.redis).toBeDefined();
      expect(typeof config.redis).toBe('object');
    });

    it('should have all required redis fields', () => {
      const config = require('../../../src/config').default;
      expect(config.redis).toHaveProperty('host');
      expect(config.redis).toHaveProperty('port');
      expect(config.redis).toHaveProperty('password');
    });

    it('should have logLevel property', () => {
      const config = require('../../../src/config').default;
      expect(config.logLevel).toBeDefined();
      expect(typeof config.logLevel).toBe('string');
    });

    it('should have nodeEnv property', () => {
      const config = require('../../../src/config').default;
      expect(config.nodeEnv).toBeDefined();
      expect(typeof config.nodeEnv).toBe('string');
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('edge cases', () => {
    it('should handle empty string for integer fields', () => {
      process.env.INDEXER_PORT = '';
      const config = require('../../../src/config').default;
      // parseInt('') || '3456' will use default since '' is falsy
      expect(config.indexer.port).toBeDefined();
      expect(typeof config.indexer.port).toBe('number');
    });

    it('should handle non-numeric string for integer fields', () => {
      process.env.INDEXER_BATCH_SIZE = 'not-a-number';
      const config = require('../../../src/config').default;
      // parseInt('not-a-number') returns NaN
      expect(isNaN(config.indexer.batchSize)).toBe(true);
    });

    it('should handle zero as valid port', () => {
      process.env.REDIS_PORT = '0';
      const config = require('../../../src/config').default;
      expect(config.redis.port).toBe(0);
    });

    it('should handle negative numbers', () => {
      process.env.SYNC_LAG_THRESHOLD = '-100';
      const config = require('../../../src/config').default;
      expect(config.indexer.syncLagThreshold).toBe(-100);
    });

    it('should handle very large numbers', () => {
      process.env.RECONCILIATION_INTERVAL = '9999999999';
      const config = require('../../../src/config').default;
      expect(config.indexer.reconciliationInterval).toBe(9999999999);
    });

    it('should handle whitespace-only strings', () => {
      process.env.SOLANA_NETWORK = '   ';
      const config = require('../../../src/config').default;
      expect(config.solana.network).toBe('   ');
    });
  });

  // =============================================================================
  // INTEGRATION - FULL CUSTOM CONFIG
  // =============================================================================

  describe('full configuration integration', () => {
    it('should load complete custom configuration', () => {
      process.env.DB_HOST = 'prod-postgres';
      process.env.DB_PORT = '5555';
      process.env.DB_NAME = 'production_db';
      process.env.DB_USER = 'prod_user';
      process.env.DB_PASSWORD = 'prod_password';
      process.env.SOLANA_NETWORK = 'mainnet-beta';
      process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
      process.env.SOLANA_WS_URL = 'wss://api.mainnet-beta.solana.com';
      process.env.SOLANA_COMMITMENT = 'finalized';
      process.env.PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      process.env.INDEXER_PORT = '8080';
      process.env.INDEXER_BATCH_SIZE = '5000';
      process.env.INDEXER_MAX_CONCURRENT = '20';
      process.env.RECONCILIATION_INTERVAL = '600000';
      process.env.SYNC_LAG_THRESHOLD = '5000';
      process.env.MARKETPLACE_MAGIC_EDEN = 'MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8';
      process.env.MARKETPLACE_TENSOR = 'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN';
      process.env.REDIS_HOST = 'prod-redis';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'redis_secret';
      process.env.LOG_LEVEL = 'warn';
      process.env.NODE_ENV = 'production';

      const config = require('../../../src/config').default;

      expect(config.database.host).toBe('prod-postgres');
      expect(config.database.port).toBe(5555);
      expect(config.database.database).toBe('production_db');
      expect(config.database.user).toBe('prod_user');
      expect(config.database.password).toBe('prod_password');

      expect(config.solana.network).toBe('mainnet-beta');
      expect(config.solana.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
      expect(config.solana.wsUrl).toBe('wss://api.mainnet-beta.solana.com');
      expect(config.solana.commitment).toBe('finalized');
      expect(config.solana.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

      expect(config.indexer.port).toBe(8080);
      expect(config.indexer.batchSize).toBe(5000);
      expect(config.indexer.maxConcurrent).toBe(20);
      expect(config.indexer.reconciliationInterval).toBe(600000);
      expect(config.indexer.syncLagThreshold).toBe(5000);

      expect(config.marketplaces.magicEden).toBe('MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8');
      expect(config.marketplaces.tensor).toBe('TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN');

      expect(config.redis.host).toBe('prod-redis');
      expect(config.redis.port).toBe(6380);
      expect(config.redis.password).toBe('redis_secret');

      expect(config.logLevel).toBe('warn');
      expect(config.nodeEnv).toBe('production');
    });
  });

});
