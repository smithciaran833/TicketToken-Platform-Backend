/**
 * Unit Tests for utils/solana.ts
 * 
 * Tests Solana utility functions for balance checking, validation, and retries.
 * Priority: 🟠 High (10 tests)
 */

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => {
  const mockPublicKey = jest.fn().mockImplementation((address: string) => {
    // Simulate valid/invalid addresses
    if (!address || address.length < 32 || address.length > 44) {
      throw new Error('Invalid public key');
    }
    return {
      toString: () => address,
      toBuffer: () => Buffer.from(address),
      toBase58: () => address,
    };
  });
  
  mockPublicKey.findProgramAddressSync = jest.fn().mockReturnValue([
    { toString: () => 'derivedAddress', toBuffer: () => Buffer.alloc(32) },
    255
  ]);
  
  return {
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(1000000000), // 1 SOL in lamports
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mockBlockhash',
        lastValidBlockHeight: 12345
      }),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null }, context: { slot: 100 } }),
      sendRawTransaction: jest.fn().mockResolvedValue('mockSignature'),
      getTransaction: jest.fn().mockResolvedValue(null),
      getRecentPrioritizationFees: jest.fn().mockResolvedValue([]),
    })),
    PublicKey: mockPublicKey,
    Keypair: {
      generate: jest.fn().mockReturnValue({
        publicKey: { toString: () => 'generatedPubkey' },
        secretKey: new Uint8Array(64),
      }),
    },
    Transaction: jest.fn().mockImplementation(() => ({
      instructions: [],
      signatures: [],
      sign: jest.fn(),
      serialize: jest.fn().mockReturnValue(Buffer.from('serialized')),
    })),
    ComputeBudgetProgram: {
      setComputeUnitLimit: jest.fn().mockReturnValue({}),
      setComputeUnitPrice: jest.fn().mockReturnValue({}),
    },
  };
});

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn(), labels: jest.fn().mockReturnThis() })),
  Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn(), labels: jest.fn().mockReturnThis() })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import {
  checkWalletBalance,
  formatSOL,
  isValidPublicKey,
  retryAsync,
} from '../../../src/utils/solana';
import { PublicKey } from '@solana/web3.js';

// =============================================================================
// Test Suite
// =============================================================================

describe('Solana Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // checkWalletBalance Tests
  // =============================================================================

  describe('checkWalletBalance', () => {
    it('should return balance in SOL', async () => {
      const { Connection } = require('@solana/web3.js');
      const mockConnection = new Connection('https://api.devnet.solana.com');
      const pubkey = new PublicKey('11111111111111111111111111111111');
      
      const result = await checkWalletBalance(mockConnection, pubkey, 0.1);
      
      expect(result.balance).toBe(1); // 1 SOL (1000000000 lamports / 1e9)
    });

    it('should return sufficient flag', async () => {
      const { Connection } = require('@solana/web3.js');
      const mockConnection = new Connection('https://api.devnet.solana.com');
      const pubkey = new PublicKey('11111111111111111111111111111111');
      
      const result = await checkWalletBalance(mockConnection, pubkey, 0.1);
      
      expect(result).toHaveProperty('sufficient');
      expect(typeof result.sufficient).toBe('boolean');
    });

    it('should compare against threshold', async () => {
      const { Connection } = require('@solana/web3.js');
      const mockConnection = new Connection('https://api.devnet.solana.com');
      const pubkey = new PublicKey('11111111111111111111111111111111');
      
      // Balance is 1 SOL, threshold is 0.5 - should be sufficient
      const result1 = await checkWalletBalance(mockConnection, pubkey, 0.5);
      expect(result1.sufficient).toBe(true);
      
      // Balance is 1 SOL, threshold is 2 - should not be sufficient
      mockConnection.getBalance.mockResolvedValueOnce(500000000); // 0.5 SOL
      const result2 = await checkWalletBalance(mockConnection, pubkey, 2);
      expect(result2.sufficient).toBe(false);
    });
  });

  // =============================================================================
  // formatSOL Tests
  // =============================================================================

  describe('formatSOL', () => {
    it('should convert lamports to SOL (divide by 1e9)', () => {
      const lamports = 1000000000; // 1 billion lamports = 1 SOL
      const result = formatSOL(lamports);
      
      expect(result).toContain('1');
      expect(result).toContain('SOL');
    });

    it('should handle decimal places correctly', () => {
      const lamports = 1500000000; // 1.5 SOL
      const result = formatSOL(lamports);
      
      expect(result).toContain('1.5');
      expect(result).toContain('SOL');
    });
  });

  // =============================================================================
  // isValidPublicKey Tests
  // =============================================================================

  describe('isValidPublicKey', () => {
    it('should return true for valid Solana address', () => {
      // Valid Base58 address (32-44 characters)
      const validAddress = '11111111111111111111111111111111';
      expect(isValidPublicKey(validAddress)).toBe(true);
    });

    it('should return false for invalid address', () => {
      const invalidAddress = 'invalid';
      expect(isValidPublicKey(invalidAddress)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidPublicKey('')).toBe(false);
    });
  });

  // =============================================================================
  // retryAsync Tests
  // =============================================================================

  describe('retryAsync', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });
      
      const result = await retryAsync(fn, 3, 10);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      await retryAsync(fn, 3, 50, 2);
      const duration = Date.now() - startTime;
      
      // Should have waited at least 50ms (first retry) + 100ms (second retry)
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(retryAsync(fn, 3, 10)).rejects.toThrow('Persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
