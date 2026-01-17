// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/secrets-manager.ts
 * Tests AWS Secrets Manager integration with caching and fallback
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SecretsManager, secretsManager } from '../../../src/utils/secrets-manager';

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');

describe('src/utils/secrets-manager.ts - Comprehensive Unit Tests', () => {
  let manager: SecretsManager;
  let mockSend: jest.Mock;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    
    mockSend = jest.fn();
    (SecretsManagerClient as jest.Mock).mockImplementation(() => ({
      send: mockSend
    }));
    
    manager = new SecretsManager();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // CONSTRUCTOR BEHAVIOR
  // =============================================================================

  describe('Constructor', () => {
    it('should not initialize AWS client in development', () => {
      process.env.NODE_ENV = 'development';
      const devManager = new SecretsManager();
      expect(devManager['client']).toBeNull();
    });

    it('should not initialize AWS client in test', () => {
      process.env.NODE_ENV = 'test';
      const testManager = new SecretsManager();
      expect(testManager['client']).toBeNull();
    });

    it('should initialize AWS client in production', () => {
      process.env.NODE_ENV = 'production';
      const prodManager = new SecretsManager();
      expect(prodManager['client']).toBeDefined();
      expect(SecretsManagerClient).toHaveBeenCalled();
    });

    it('should use AWS_REGION from environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.AWS_REGION = 'us-west-2';
      
      new SecretsManager();
      
      expect(SecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-west-2'
      });
    });

    it('should default to us-east-1 when AWS_REGION not set', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AWS_REGION;
      
      new SecretsManager();
      
      expect(SecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-east-1'
      });
    });

    it('should initialize empty cache', () => {
      expect(manager['cache']).toEqual({});
    });

    it('should set cache TTL to 5 minutes', () => {
      expect(manager['cacheTTL']).toBe(300000);
    });
  });

  // =============================================================================
  // DEVELOPMENT MODE - getSecret()
  // =============================================================================

  describe('getSecret() - Development Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      manager = new SecretsManager();
    });

    it('should return value from environment variable', async () => {
      process.env.DB_PASSWORD = 'dev-password-123';
      
      const result = await manager.getSecret('aws/secret/name', 'DB_PASSWORD');
      
      expect(result).toBe('dev-password-123');
    });

    it('should throw error when env var not set', async () => {
      delete process.env.DB_PASSWORD;
      
      await expect(
        manager.getSecret('aws/secret/name', 'DB_PASSWORD')
      ).rejects.toThrow('Environment variable DB_PASSWORD is not set');
    });

    it('should log that it is using env value', async () => {
      process.env.TEST_SECRET = 'test-value';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await manager.getSecret('aws/secret', 'TEST_SECRET');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Using .env value for TEST_SECRET');
      consoleSpy.mockRestore();
    });

    it('should not call AWS in development', async () => {
      process.env.DB_PASSWORD = 'dev-pass';
      
      await manager.getSecret('aws/secret', 'DB_PASSWORD');
      
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle multiple env var calls', async () => {
      process.env.SECRET_1 = 'value1';
      process.env.SECRET_2 = 'value2';
      process.env.SECRET_3 = 'value3';
      
      const r1 = await manager.getSecret('aws/s1', 'SECRET_1');
      const r2 = await manager.getSecret('aws/s2', 'SECRET_2');
      const r3 = await manager.getSecret('aws/s3', 'SECRET_3');
      
      expect(r1).toBe('value1');
      expect(r2).toBe('value2');
      expect(r3).toBe('value3');
    });

    it('should handle empty string env var', async () => {
      process.env.EMPTY_SECRET = '';
      
      const result = await manager.getSecret('aws/secret', 'EMPTY_SECRET');
      
      expect(result).toBe('');
    });
  });

  // =============================================================================
  // PRODUCTION MODE - getSecret() with AWS
  // =============================================================================

  describe('getSecret() - Production Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
    });

    it('should fetch from AWS Secrets Manager', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'aws-secret-value'
      });
      
      const result = await manager.getSecret('tickettoken/prod/db-pass', 'DB_PASSWORD');
      
      expect(result).toBe('aws-secret-value');
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
    });

    it('should use correct secret name in AWS call', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'secret-value'
      });
      
      await manager.getSecret('tickettoken/prod/redis-pass', 'REDIS_PASSWORD');
      
      const call = mockSend.mock.calls[0][0];
      expect(call.input.SecretId).toBe('tickettoken/prod/redis-pass');
    });

    it('should cache fetched secret', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'cached-value'
      });
      
      await manager.getSecret('aws/secret', 'SECRET');
      
      expect(manager['cache']['aws/secret']).toBeDefined();
      expect(manager['cache']['aws/secret'].value).toBe('cached-value');
      expect(manager['cache']['aws/secret'].timestamp).toBeGreaterThan(0);
    });

    it('should return cached value within TTL', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // First call - fetches from AWS
      mockSend.mockResolvedValue({
        SecretString: 'cached-value'
      });
      await manager.getSecret('aws/secret', 'SECRET');
      
      // Second call - should use cache
      const result = await manager.getSecret('aws/secret', 'SECRET');
      
      expect(result).toBe('cached-value');
      expect(mockSend).toHaveBeenCalledTimes(1); // Only called once
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Using cached value for aws/secret');
      
      consoleSpy.mockRestore();
    });

    it('should fetch new value after cache expires', async () => {
      jest.useFakeTimers();
      
      mockSend.mockResolvedValueOnce({
        SecretString: 'value-1'
      });
      
      const result1 = await manager.getSecret('aws/secret', 'SECRET');
      expect(result1).toBe('value-1');
      
      // Advance time past TTL (5 minutes + 1ms)
      jest.advanceTimersByTime(300001);
      
      mockSend.mockResolvedValueOnce({
        SecretString: 'value-2'
      });
      
      const result2 = await manager.getSecret('aws/secret', 'SECRET');
      expect(result2).toBe('value-2');
      expect(mockSend).toHaveBeenCalledTimes(2);
      
      jest.useRealTimers();
    });

    it('should log when fetching from AWS', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValue({
        SecretString: 'value'
      });
      
      await manager.getSecret('aws/secret/name', 'SECRET');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Fetching from AWS: aws/secret/name');
      consoleSpy.mockRestore();
    });

    it('should handle different secret names independently', async () => {
      mockSend
        .mockResolvedValueOnce({ SecretString: 'secret-1' })
        .mockResolvedValueOnce({ SecretString: 'secret-2' })
        .mockResolvedValueOnce({ SecretString: 'secret-3' });
      
      const r1 = await manager.getSecret('aws/secret1', 'S1');
      const r2 = await manager.getSecret('aws/secret2', 'S2');
      const r3 = await manager.getSecret('aws/secret3', 'S3');
      
      expect(r1).toBe('secret-1');
      expect(r2).toBe('secret-2');
      expect(r3).toBe('secret-3');
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // ERROR HANDLING - AWS
  // =============================================================================

  describe('getSecret() - Error Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
    });

    it('should throw error when AWS client not initialized', async () => {
      manager['client'] = null;
      
      await expect(
        manager.getSecret('aws/secret', 'SECRET')
      ).rejects.toThrow('AWS Secrets Manager client not initialized');
    });

    it('should throw error when SecretString is empty', async () => {
      mockSend.mockResolvedValue({
        SecretString: ''
      });
      
      await expect(
        manager.getSecret('aws/secret', 'SECRET')
      ).rejects.toThrow('Secret aws/secret has no value');
    });

    it('should throw error when SecretString is undefined', async () => {
      mockSend.mockResolvedValue({});
      
      await expect(
        manager.getSecret('aws/secret', 'SECRET')
      ).rejects.toThrow('Secret aws/secret has no value');
    });

    it('should fallback to env var when AWS fails', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValue(new Error('AWS Network Error'));
      process.env.FALLBACK_SECRET = 'fallback-value';
      
      const result = await manager.getSecret('aws/secret', 'FALLBACK_SECRET');
      
      expect(result).toBe('fallback-value');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[Secrets] Using fallback .env value for FALLBACK_SECRET');
      
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should throw error when AWS fails and no fallback', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValue(new Error('AWS Error'));
      delete process.env.NO_FALLBACK;
      
      await expect(
        manager.getSecret('aws/secret', 'NO_FALLBACK')
      ).rejects.toThrow('Failed to get secret aws/secret: AWS Error');
      
      consoleErrorSpy.mockRestore();
    });

    it('should log AWS error before falling back', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValue(new Error('Connection timeout'));
      process.env.FALLBACK = 'value';
      
      await manager.getSecret('aws/secret', 'FALLBACK');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Secrets] Failed to fetch aws/secret from AWS:',
        'Connection timeout'
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle non-Error exceptions', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValue('String error');
      process.env.FALLBACK = 'value';
      
      const result = await manager.getSecret('aws/secret', 'FALLBACK');
      
      expect(result).toBe('value');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Secrets] Failed to fetch aws/secret from AWS:',
        'String error'
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  // =============================================================================
  // CACHE MANAGEMENT
  // =============================================================================

  describe('clearCache()', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
    });

    it('should clear all cached secrets', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValue({ SecretString: 'value' });
      
      await manager.getSecret('secret1', 'S1');
      await manager.getSecret('secret2', 'S2');
      
      expect(Object.keys(manager['cache'])).toHaveLength(2);
      
      manager.clearCache();
      
      expect(Object.keys(manager['cache'])).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Cache cleared');
      
      consoleSpy.mockRestore();
    });

    it('should fetch from AWS again after cache cleared', async () => {
      mockSend.mockResolvedValue({ SecretString: 'value' });
      
      await manager.getSecret('aws/secret', 'SECRET');
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      manager.clearCache();
      
      await manager.getSecret('aws/secret', 'SECRET');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should handle clearing empty cache', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      manager.clearCache();
      
      expect(manager['cache']).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Cache cleared');
      
      consoleSpy.mockRestore();
    });

    it('should reset cache to empty object', () => {
      manager['cache'] = {
        'secret1': { value: 'v1', timestamp: Date.now() },
        'secret2': { value: 'v2', timestamp: Date.now() }
      };
      
      manager.clearCache();
      
      expect(manager['cache']).toEqual({});
      expect(Object.keys(manager['cache']).length).toBe(0);
    });
  });

  // =============================================================================
  // MULTIPLE SECRETS - getSecrets()
  // =============================================================================

  describe('getSecrets() - Multiple Secrets', () => {
    it('should fetch multiple secrets in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SECRET_1 = 'value1';
      process.env.SECRET_2 = 'value2';
      process.env.SECRET_3 = 'value3';
      manager = new SecretsManager();
      
      const result = await manager.getSecrets([
        { secretName: 'aws/s1', envVarName: 'SECRET_1' },
        { secretName: 'aws/s2', envVarName: 'SECRET_2' },
        { secretName: 'aws/s3', envVarName: 'SECRET_3' }
      ]);
      
      expect(result).toEqual({
        SECRET_1: 'value1',
        SECRET_2: 'value2',
        SECRET_3: 'value3'
      });
    });

    it('should fetch multiple secrets from AWS in production', async () => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
      
      mockSend
        .mockResolvedValueOnce({ SecretString: 'aws-value-1' })
        .mockResolvedValueOnce({ SecretString: 'aws-value-2' });
      
      const result = await manager.getSecrets([
        { secretName: 'aws/secret1', envVarName: 'S1' },
        { secretName: 'aws/secret2', envVarName: 'S2' }
      ]);
      
      expect(result).toEqual({
        S1: 'aws-value-1',
        S2: 'aws-value-2'
      });
    });

    it('should return empty object for empty array', async () => {
      const result = await manager.getSecrets([]);
      
      expect(result).toEqual({});
    });

    it('should fetch secrets sequentially', async () => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
      
      const spy = jest.spyOn(manager, 'getSecret');
      mockSend
        .mockResolvedValueOnce({ SecretString: 'v1' })
        .mockResolvedValueOnce({ SecretString: 'v2' });
      
      await manager.getSecrets([
        { secretName: 'aws/s1', envVarName: 'S1' },
        { secretName: 'aws/s2', envVarName: 'S2' }
      ]);
      
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenNthCalledWith(1, 'aws/s1', 'S1');
      expect(spy).toHaveBeenNthCalledWith(2, 'aws/s2', 'S2');
    });

    it('should handle mix of cached and non-cached secrets', async () => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
      
      mockSend
        .mockResolvedValueOnce({ SecretString: 'value-1' })
        .mockResolvedValueOnce({ SecretString: 'value-2' });
      
      // Pre-cache first secret
      await manager.getSecret('aws/s1', 'S1');
      
      // Fetch multiple including cached one
      const result = await manager.getSecrets([
        { secretName: 'aws/s1', envVarName: 'S1' },
        { secretName: 'aws/s2', envVarName: 'S2' }
      ]);
      
      expect(result).toEqual({
        S1: 'value-1',
        S2: 'value-2'
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors from individual getSecret calls', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.MISSING_SECRET;
      manager = new SecretsManager();
      
      await expect(
        manager.getSecrets([
          { secretName: 'aws/secret', envVarName: 'MISSING_SECRET' }
        ])
      ).rejects.toThrow('Environment variable MISSING_SECRET is not set');
    });
  });

  // =============================================================================
  // SINGLETON EXPORT
  // =============================================================================

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(secretsManager).toBeInstanceOf(SecretsManager);
    });

    it('should be the same instance when imported multiple times', () => {
      const instance1 = secretsManager;
      const { secretsManager: instance2 } = require('../../../src/utils/secrets-manager');
      
      expect(instance1).toBe(instance2);
    });

    it('should maintain state across imports', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TEST_SECRET = 'singleton-test';
      
      const { secretsManager: imported } = require('../../../src/utils/secrets-manager');
      
      expect(imported['cache']).toBe(secretsManager['cache']);
    });
  });

  // =============================================================================
  // CACHE TTL BEHAVIOR
  // =============================================================================

  describe('Cache TTL Behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
    });

    it('should have 5 minute TTL (300000ms)', () => {
      expect(manager['cacheTTL']).toBe(300000);
    });

    it('should respect TTL for cache validity', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      mockSend.mockResolvedValue({ SecretString: 'value' });
      
      await manager.getSecret('aws/secret', 'SECRET');
      
      // Advance time to just before TTL expires
      jest.setSystemTime(now + 299999);
      await manager.getSecret('aws/secret', 'SECRET');
      expect(mockSend).toHaveBeenCalledTimes(1); // Still cached
      
      // Advance time past TTL
      jest.setSystemTime(now + 300001);
      await manager.getSecret('aws/secret', 'SECRET');
      expect(mockSend).toHaveBeenCalledTimes(2); // Cache expired
      
      jest.useRealTimers();
    });

    it('should store timestamp with cached value', async () => {
      const now = Date.now();
      mockSend.mockResolvedValue({ SecretString: 'value' });
      
      await manager.getSecret('aws/secret', 'SECRET');
      
      const cached = manager['cache']['aws/secret'];
      expect(cached.timestamp).toBeGreaterThanOrEqual(now);
      expect(cached.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  // =============================================================================
  // REAL-WORLD SCENARIOS
  // =============================================================================

  describe('Real-World Scenarios', () => {
    it('should handle database credentials loading', async () => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
      
      mockSend
        .mockResolvedValueOnce({ SecretString: 'db-password-123' })
        .mockResolvedValueOnce({ SecretString: 'db-user-admin' })
        .mockResolvedValueOnce({ SecretString: 'tickettoken_db' });
      
      const secrets = await manager.getSecrets([
        { secretName: 'tickettoken/prod/postgres-password', envVarName: 'POSTGRES_PASSWORD' },
        { secretName: 'tickettoken/prod/postgres-user', envVarName: 'POSTGRES_USER' },
        { secretName: 'tickettoken/prod/postgres-db', envVarName: 'POSTGRES_DB' }
      ]);
      
      expect(secrets).toEqual({
        POSTGRES_PASSWORD: 'db-password-123',
        POSTGRES_USER: 'db-user-admin',
        POSTGRES_DB: 'tickettoken_db'
      });
    });

    it('should handle AWS temporary unavailability with fallback', async () => {
      process.env.NODE_ENV = 'production';
      process.env.POSTGRES_PASSWORD = 'local-fallback-pass';
      manager = new SecretsManager();
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValue(new Error('Service Unavailable'));
      
      const result = await manager.getSecret('tickettoken/prod/postgres-password', 'POSTGRES_PASSWORD');
      
      expect(result).toBe('local-fallback-pass');
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should handle rapid consecutive calls with caching', async () => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
      
      mockSend.mockResolvedValue({ SecretString: 'cached-secret' });
      
      // Make 10 rapid calls
      const promises = Array(10).fill(null).map(() => 
        manager.getSecret('aws/secret', 'SECRET')
      );
      
      const results = await Promise.all(promises);
      
      // All should return same value
      results.forEach(r => expect(r).toBe('cached-secret'));
      
      // But AWS should only be called once
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle service startup secret loading', async () => {
      process.env.NODE_ENV = 'development';
      process.env.POSTGRES_PASSWORD = 'dev-pass';
      process.env.POSTGRES_USER = 'dev-user';
      process.env.REDIS_PASSWORD = 'dev-redis';
      manager = new SecretsManager();
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const secrets = await manager.getSecrets([
        { secretName: 'n/a', envVarName: 'POSTGRES_PASSWORD' },
        { secretName: 'n/a', envVarName: 'POSTGRES_USER' },
        { secretName: 'n/a', envVarName: 'REDIS_PASSWORD' }
      ]);
      
      expect(secrets.POSTGRES_PASSWORD).toBe('dev-pass');
      expect(secrets.POSTGRES_USER).toBe('dev-user');
      expect(secrets.REDIS_PASSWORD).toBe('dev-redis');
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      
      consoleSpy.mockRestore();
    });
  });

});
