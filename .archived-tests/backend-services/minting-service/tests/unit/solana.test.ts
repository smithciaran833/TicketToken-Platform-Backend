import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  checkWalletBalance,
  isValidPublicKey,
  formatSOL,
  validateSolanaConfig
} from '../../src/utils/solana';

describe('Solana Utilities', () => {
  describe('isValidPublicKey', () => {
    it('should return true for valid public key', () => {
      const validKey = 'HjTUywYbQQAb1h84UwAJXjNSFAEcygaLiaHJGhkFGquF';
      expect(isValidPublicKey(validKey)).toBe(true);
    });

    it('should return false for invalid public key', () => {
      expect(isValidPublicKey('invalid-key')).toBe(false);
      expect(isValidPublicKey('')).toBe(false);
      expect(isValidPublicKey('123')).toBe(false);
    });
  });

  describe('formatSOL', () => {
    it('should format lamports to SOL correctly', () => {
      expect(formatSOL(1000000000)).toBe('1.0000 SOL');
      expect(formatSOL(500000000)).toBe('0.5000 SOL');
      expect(formatSOL(1)).toBe('0.0000 SOL');
    });

    it('should handle zero lamports', () => {
      expect(formatSOL(0)).toBe('0.0000 SOL');
    });

    it('should handle large amounts', () => {
      expect(formatSOL(10000000000)).toBe('10.0000 SOL');
    });
  });

  describe('validateSolanaConfig', () => {
    beforeEach(() => {
      // Reset environment
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SOLANA_NETWORK = 'devnet';
      process.env.WALLET_PATH = './test-wallet.json';
    });

    it('should pass with all required env vars', () => {
      expect(() => validateSolanaConfig()).not.toThrow();
    });

    it('should throw if SOLANA_RPC_URL missing', () => {
      delete process.env.SOLANA_RPC_URL;
      expect(() => validateSolanaConfig()).toThrow('Missing required Solana configuration');
    });

    it('should throw if SOLANA_NETWORK missing', () => {
      delete process.env.SOLANA_NETWORK;
      expect(() => validateSolanaConfig()).toThrow('Missing required Solana configuration');
    });

    it('should throw if WALLET_PATH missing', () => {
      delete process.env.WALLET_PATH;
      expect(() => validateSolanaConfig()).toThrow('Missing required Solana configuration');
    });
  });

  describe('checkWalletBalance', () => {
    it('should check if balance is sufficient', async () => {
      // @ts-ignore - Mock typing
      const getBalanceMock = jest.fn().mockResolvedValue(200000000);
      const mockConnection = {
        getBalance: getBalanceMock
      } as any;

      const publicKey = Keypair.generate().publicKey;

      const result = await checkWalletBalance(mockConnection, publicKey, 0.1);

      expect(result.balance).toBe(0.2);
      expect(result.sufficient).toBe(true);
      expect(getBalanceMock).toHaveBeenCalledWith(publicKey);
    });

    it('should detect insufficient balance', async () => {
      // @ts-ignore - Mock typing
      const getBalanceMock = jest.fn().mockResolvedValue(50000000);
      const mockConnection = {
        getBalance: getBalanceMock
      } as any;

      const publicKey = Keypair.generate().publicKey;

      const result = await checkWalletBalance(mockConnection, publicKey, 0.1);

      expect(result.balance).toBe(0.05);
      expect(result.sufficient).toBe(false);
    });

    it('should handle connection errors', async () => {
      // @ts-ignore - Mock typing
      const getBalanceMock = jest.fn().mockRejectedValue(new Error('Connection failed'));
      const mockConnection = {
        getBalance: getBalanceMock
      } as any;

      const publicKey = Keypair.generate().publicKey;

      await expect(checkWalletBalance(mockConnection, publicKey, 0.1))
        .rejects.toThrow('Connection failed');
    });
  });
});
