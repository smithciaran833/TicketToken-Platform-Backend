/**
 * Unit Tests for config/wallet-provider.ts
 * 
 * Tests wallet provider abstraction for file-based and KMS-based wallets.
 * Priority: 🟡 Medium (6 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

import fs from 'fs';
import {
  getWalletProvider,
  initWalletProvider,
  clearWalletProvider,
  getWalletPublicKey,
  signTransaction
} from '../../../src/config/wallet-provider';

describe('Wallet Provider Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    clearWalletProvider();
    process.env = { ...originalEnv };
    process.env.WALLET_PROVIDER = 'file';
    process.env.WALLET_PATH = '/path/to/wallet.json';
    process.env.SOLANA_WALLET_PATH = '/path/to/wallet.json';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getWalletProvider', () => {
    it('should default to file provider', () => {
      delete process.env.WALLET_PROVIDER;
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(Array(64).fill(0)));
      
      const provider = getWalletProvider();
      expect(provider.type).toBe('file');
    });

    it('should return KMS provider when configured', () => {
      process.env.WALLET_PROVIDER = 'kms';
      process.env.KMS_KEY_ID = 'test-key-id';
      
      const provider = getWalletProvider();
      expect(provider.type).toBe('kms');
    });

    it('should throw for unknown provider type', () => {
      process.env.WALLET_PROVIDER = 'invalid';
      
      expect(() => getWalletProvider()).toThrow('Unknown wallet provider');
    });

    it('should return cached provider on subsequent calls', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(Array(64).fill(0)));
      
      const provider1 = getWalletProvider();
      const provider2 = getWalletProvider();
      
      expect(provider1).toBe(provider2);
    });
  });

  describe('FileWalletProvider', () => {
    it('should throw if wallet file not found', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      expect(() => initWalletProvider({ type: 'file', walletPath: '/missing/wallet.json' }))
        .toThrow('Wallet file not found');
    });

    it('should load keypair from file', async () => {
      const mockKeypair = Array(64).fill(0);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockKeypair));
      
      const provider = initWalletProvider({ type: 'file', walletPath: '/path/to/wallet.json' });
      
      expect(provider.type).toBe('file');
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should throw if WALLET_PATH not set', () => {
      delete process.env.WALLET_PATH;
      delete process.env.SOLANA_WALLET_PATH;
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      expect(() => initWalletProvider({ type: 'file' }))
        .toThrow();
    });
  });

  describe('KMSWalletProvider', () => {
    it('should throw if KMS_KEY_ID not set', () => {
      delete process.env.KMS_KEY_ID;
      
      expect(() => initWalletProvider({ type: 'kms' }))
        .toThrow('KMS_KEY_ID environment variable required');
    });

    it('getKeypair should throw (not supported)', async () => {
      process.env.KMS_KEY_ID = 'test-key-id';
      
      const provider = initWalletProvider({ type: 'kms' });
      
      await expect(provider.getKeypair()).rejects.toThrow('KMS wallet provider does not expose the full keypair');
    });
  });

  describe('HardwareWalletProvider', () => {
    it('should create hardware provider', () => {
      const provider = initWalletProvider({ type: 'hardware' });
      expect(provider.type).toBe('hardware');
    });

    it('getKeypair should throw (not supported)', async () => {
      const provider = initWalletProvider({ type: 'hardware' });
      
      await expect(provider.getKeypair()).rejects.toThrow('Hardware wallet does not expose the full keypair');
    });
  });

  describe('clearWalletProvider', () => {
    it('should clear cached provider', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(Array(64).fill(0)));
      
      const provider1 = getWalletProvider();
      clearWalletProvider();
      
      const provider2 = getWalletProvider();
      
      // Should be different instances
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('Convenience Functions', () => {
    it('getWalletPublicKey should return public key', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(Array(64).fill(0)));
      
      const publicKey = await getWalletPublicKey();
      
      expect(publicKey).toBeDefined();
      expect(publicKey.toBase58).toBeDefined();
    });
  });
});
