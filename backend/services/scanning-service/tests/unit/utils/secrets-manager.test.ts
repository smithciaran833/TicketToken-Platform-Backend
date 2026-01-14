// @ts-nocheck
import { SecretsManager, secretsManager } from '../../../src/utils/secrets-manager';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');

describe('SecretsManager', () => {
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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor', () => {
    it('should not create AWS client in non-production', () => {
      process.env.NODE_ENV = 'development';
      const mgr = new SecretsManager();
      expect(mgr['client']).toBeNull();
    });

    it('should create AWS client in production', () => {
      process.env.NODE_ENV = 'production';
      const mgr = new SecretsManager();
      expect(mgr['client']).toBeDefined();
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
  });

  describe('getSecret - Non-Production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      manager = new SecretsManager();
    });

    it('should return value from environment variable', async () => {
      process.env.TEST_SECRET = 'test-value';
      const result = await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      expect(result).toBe('test-value');
    });

    it('should throw error when environment variable not set', async () => {
      delete process.env.TEST_SECRET;
      await expect(
        manager.getSecret('aws/secret/name', 'TEST_SECRET')
      ).rejects.toThrow('Environment variable TEST_SECRET is not set');
    });

    it('should log that it is using env value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.TEST_SECRET = 'test-value';
      await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Using .env value for TEST_SECRET');
      consoleSpy.mockRestore();
    });
  });

  describe('getSecret - Production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
    });

    it('should fetch from AWS Secrets Manager', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'aws-secret-value'
      });

      const result = await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      expect(result).toBe('aws-secret-value');
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
    });

    it('should cache the fetched secret', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'cached-value'
      });

      const result1 = await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      const result2 = await manager.getSecret('aws/secret/name', 'TEST_SECRET');

      expect(result1).toBe('cached-value');
      expect(result2).toBe('cached-value');
      expect(mockSend).toHaveBeenCalledTimes(1); // Only called once due to cache
    });

    it('should return cached value within TTL', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValue({
        SecretString: 'cached-value'
      });

      await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      await manager.getSecret('aws/secret/name', 'TEST_SECRET');

      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Using cached value for aws/secret/name');
      consoleSpy.mockRestore();
    });

    it('should fetch new value after cache expires', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'fresh-value'
      });

      await manager.getSecret('aws/secret/name', 'TEST_SECRET');

      // Manually expire the cache
      manager['cache']['aws/secret/name'].timestamp = Date.now() - 400000; // Older than 5 min

      await manager.getSecret('aws/secret/name', 'TEST_SECRET');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw error when AWS client not initialized', async () => {
      manager['client'] = null;
      await expect(
        manager.getSecret('aws/secret/name', 'TEST_SECRET')
      ).rejects.toThrow('AWS Secrets Manager client not initialized');
    });

    it('should throw error when SecretString is empty', async () => {
      mockSend.mockResolvedValue({
        SecretString: undefined
      });

      await expect(
        manager.getSecret('aws/secret/name', 'TEST_SECRET')
      ).rejects.toThrow('Secret aws/secret/name has no value');
    });

    it('should fall back to environment variable when AWS fails', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      process.env.TEST_SECRET = 'fallback-value';
      mockSend.mockRejectedValue(new Error('AWS Error'));

      const result = await manager.getSecret('aws/secret/name', 'TEST_SECRET');

      expect(result).toBe('fallback-value');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[Secrets] Using fallback .env value for TEST_SECRET');
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should throw error when AWS fails and no fallback', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      delete process.env.TEST_SECRET;
      mockSend.mockRejectedValue(new Error('AWS Error'));

      await expect(
        manager.getSecret('aws/secret/name', 'TEST_SECRET')
      ).rejects.toThrow('Failed to get secret aws/secret/name: AWS Error');
      consoleErrorSpy.mockRestore();
    });

    it('should log when fetching from AWS', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValue({
        SecretString: 'aws-value'
      });

      await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Fetching from AWS: aws/secret/name');
      consoleSpy.mockRestore();
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      manager = new SecretsManager();
    });

    it('should clear all cached secrets', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValue({
        SecretString: 'value'
      });

      await manager.getSecret('aws/secret/1', 'SECRET_1');
      expect(Object.keys(manager['cache'])).toHaveLength(1);

      manager.clearCache();
      expect(Object.keys(manager['cache'])).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith('[Secrets] Cache cleared');
      consoleSpy.mockRestore();
    });

    it('should fetch from AWS again after cache cleared', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'value'
      });

      await manager.getSecret('aws/secret/name', 'TEST_SECRET');
      manager.clearCache();
      await manager.getSecret('aws/secret/name', 'TEST_SECRET');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSecrets', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      manager = new SecretsManager();
    });

    it('should fetch multiple secrets', async () => {
      process.env.SECRET_1 = 'value1';
      process.env.SECRET_2 = 'value2';
      process.env.SECRET_3 = 'value3';

      const result = await manager.getSecrets([
        { secretName: 'aws/secret/1', envVarName: 'SECRET_1' },
        { secretName: 'aws/secret/2', envVarName: 'SECRET_2' },
        { secretName: 'aws/secret/3', envVarName: 'SECRET_3' }
      ]);

      expect(result).toEqual({
        SECRET_1: 'value1',
        SECRET_2: 'value2',
        SECRET_3: 'value3'
      });
    });

    it('should return empty object for empty array', async () => {
      const result = await manager.getSecrets([]);
      expect(result).toEqual({});
    });

    it('should fetch secrets sequentially', async () => {
      process.env.SECRET_1 = 'value1';
      process.env.SECRET_2 = 'value2';

      const spy = jest.spyOn(manager, 'getSecret');

      await manager.getSecrets([
        { secretName: 'aws/secret/1', envVarName: 'SECRET_1' },
        { secretName: 'aws/secret/2', envVarName: 'SECRET_2' }
      ]);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenNthCalledWith(1, 'aws/secret/1', 'SECRET_1');
      expect(spy).toHaveBeenNthCalledWith(2, 'aws/secret/2', 'SECRET_2');
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(secretsManager).toBeInstanceOf(SecretsManager);
    });

    it('should be the same instance when imported multiple times', () => {
      const { secretsManager: instance1 } = require('../../../src/utils/secrets-manager');
      const { secretsManager: instance2 } = require('../../../src/utils/secrets-manager');
      expect(instance1).toBe(instance2);
    });
  });

  describe('Cache TTL', () => {
    it('should have cacheTTL of 5 minutes', () => {
      manager = new SecretsManager();
      expect(manager['cacheTTL']).toBe(300000); // 5 minutes in milliseconds
    });
  });
});
