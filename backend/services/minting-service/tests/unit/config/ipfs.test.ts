/**
 * Unit Tests for config/ipfs.ts
 * 
 * Tests IPFS service configuration, failover, and upload operations.
 * Priority: 🟡 Medium (7 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    post: jest.fn()
  })
}));

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({
    startTimer: jest.fn().mockReturnValue(jest.fn())
  }))
}));

import {
  getIPFSService,
  getIPFSServiceDirect,
  validateIPFSConfig,
  getIPFSServiceStatus
} from '../../../src/config/ipfs';

describe('IPFS Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.IPFS_PROVIDER = 'pinata';
    process.env.PINATA_JWT = 'test-jwt-token';
    process.env.IPFS_UPLOAD_TIMEOUT_MS = '30000';
    process.env.IPFS_MAX_RETRIES = '2';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Provider Selection', () => {
    it('should default to Pinata provider', () => {
      delete process.env.IPFS_PROVIDER;
      process.env.PINATA_JWT = 'test-jwt';
      
      const status = getIPFSServiceStatus();
      expect(status.provider).toBe('pinata');
    });

    it('should use NFT.Storage when configured', () => {
      process.env.IPFS_PROVIDER = 'nft.storage';
      process.env.NFT_STORAGE_API_KEY = 'test-key';
      
      const status = getIPFSServiceStatus();
      expect(status.provider).toBe('nft.storage');
    });
  });

  describe('Failover Configuration', () => {
    it('should enable failover when backup provider configured', () => {
      process.env.IPFS_PROVIDER = 'pinata';
      process.env.PINATA_JWT = 'test-jwt';
      process.env.NFT_STORAGE_API_KEY = 'backup-key';
      process.env.IPFS_ENABLE_FAILOVER = 'true';
      
      const status = getIPFSServiceStatus();
      expect(status.hasFailover).toBe(true);
      expect(status.failoverProvider).toBe('nft.storage');
    });

    it('should disable failover when IPFS_ENABLE_FAILOVER is false', () => {
      process.env.IPFS_ENABLE_FAILOVER = 'false';
      
      const status = getIPFSServiceStatus();
      expect(status.hasFailover).toBe(false);
    });

    it('should report no failover when backup not configured', () => {
      process.env.IPFS_PROVIDER = 'pinata';
      delete process.env.NFT_STORAGE_API_KEY;
      
      const status = getIPFSServiceStatus();
      expect(status.failoverProvider).toBeNull();
    });
  });

  describe('validateIPFSConfig', () => {
    it('should pass with valid Pinata JWT', () => {
      process.env.IPFS_PROVIDER = 'pinata';
      process.env.PINATA_JWT = 'valid-jwt';
      
      expect(() => validateIPFSConfig()).not.toThrow();
    });

    it('should pass with valid Pinata API keys', () => {
      process.env.IPFS_PROVIDER = 'pinata';
      delete process.env.PINATA_JWT;
      process.env.PINATA_API_KEY = 'api-key';
      process.env.PINATA_SECRET_API_KEY = 'secret-key';
      
      expect(() => validateIPFSConfig()).not.toThrow();
    });

    it('should throw without Pinata credentials', () => {
      process.env.IPFS_PROVIDER = 'pinata';
      delete process.env.PINATA_JWT;
      delete process.env.PINATA_API_KEY;
      delete process.env.PINATA_SECRET_API_KEY;
      
      expect(() => validateIPFSConfig()).toThrow('Pinata IPFS configuration incomplete');
    });

    it('should throw without NFT.Storage API key', () => {
      process.env.IPFS_PROVIDER = 'nft.storage';
      delete process.env.NFT_STORAGE_API_KEY;
      
      expect(() => validateIPFSConfig()).toThrow('NFT.Storage configuration incomplete');
    });
  });

  describe('getIPFSServiceStatus', () => {
    it('should return provider name', () => {
      process.env.IPFS_PROVIDER = 'pinata';
      
      const status = getIPFSServiceStatus();
      expect(status.provider).toBe('pinata');
    });

    it('should return timeout configuration', () => {
      process.env.IPFS_UPLOAD_TIMEOUT_MS = '60000';
      
      const status = getIPFSServiceStatus();
      expect(status.timeout).toBe(60000);
    });

    it('should return max retries configuration', () => {
      process.env.IPFS_MAX_RETRIES = '5';
      
      const status = getIPFSServiceStatus();
      expect(status.maxRetries).toBe(5);
    });
  });

  describe('getIPFSService', () => {
    it('should return singleton instance', () => {
      const service1 = getIPFSService();
      const service2 = getIPFSService();
      expect(service1).toBe(service2);
    });
  });

  describe('getIPFSServiceDirect', () => {
    it('should create Pinata service directly', () => {
      process.env.PINATA_JWT = 'test-jwt';
      
      const service = getIPFSServiceDirect('pinata');
      expect(service).toBeDefined();
      expect(service.getName()).toBe('pinata');
    });

    it('should create NFT.Storage service directly', () => {
      process.env.NFT_STORAGE_API_KEY = 'test-key';
      
      const service = getIPFSServiceDirect('nft.storage');
      expect(service).toBeDefined();
      expect(service.getName()).toBe('nft.storage');
    });

    it('should throw for unknown provider', () => {
      expect(() => getIPFSServiceDirect('unknown' as any)).toThrow('Unknown IPFS provider');
    });
  });
});
