/**
 * Blockchain Config Integration Tests
 *
 * Tests the blockchain configuration including:
 * - Solana config (RPC, commitment, priority fees)
 * - Polygon config (RPC, chainId, gas limits)
 * - Batch sizes
 * - Retry config
 */

import { blockchainConfig } from '../../../src/config/blockchain';

describe('config/blockchain', () => {
  // ==========================================================================
  // solana
  // ==========================================================================
  describe('solana', () => {
    it('should have rpcUrl as string', () => {
      expect(typeof blockchainConfig.solana.rpcUrl).toBe('string');
      expect(blockchainConfig.solana.rpcUrl.length).toBeGreaterThan(0);
    });

    it('should have commitment as confirmed', () => {
      expect(blockchainConfig.solana.commitment).toBe('confirmed');
    });

    it('should have programId as string', () => {
      expect(typeof blockchainConfig.solana.programId).toBe('string');
    });

    it('should have priorityFees.low as 1000', () => {
      expect(blockchainConfig.solana.priorityFees.low).toBe(1000);
    });

    it('should have priorityFees.medium as 10000', () => {
      expect(blockchainConfig.solana.priorityFees.medium).toBe(10000);
    });

    it('should have priorityFees.high as 100000', () => {
      expect(blockchainConfig.solana.priorityFees.high).toBe(100000);
    });

    it('should have priority fees in ascending order', () => {
      expect(blockchainConfig.solana.priorityFees.low).toBeLessThan(blockchainConfig.solana.priorityFees.medium);
      expect(blockchainConfig.solana.priorityFees.medium).toBeLessThan(blockchainConfig.solana.priorityFees.high);
    });
  });

  // ==========================================================================
  // polygon
  // ==========================================================================
  describe('polygon', () => {
    it('should have rpcUrl as string', () => {
      expect(typeof blockchainConfig.polygon.rpcUrl).toBe('string');
      expect(blockchainConfig.polygon.rpcUrl.length).toBeGreaterThan(0);
    });

    it('should have chainId as 80001 (Mumbai testnet)', () => {
      expect(blockchainConfig.polygon.chainId).toBe(80001);
    });

    it('should have contractAddress as string', () => {
      expect(typeof blockchainConfig.polygon.contractAddress).toBe('string');
    });

    it('should have gasLimits.mint as 150000', () => {
      expect(blockchainConfig.polygon.gasLimits.mint).toBe(150000);
    });

    it('should have gasLimits.transfer as 65000', () => {
      expect(blockchainConfig.polygon.gasLimits.transfer).toBe(65000);
    });

    it('should have mint gas limit greater than transfer', () => {
      expect(blockchainConfig.polygon.gasLimits.mint).toBeGreaterThan(blockchainConfig.polygon.gasLimits.transfer);
    });
  });

  // ==========================================================================
  // batchSizes
  // ==========================================================================
  describe('batchSizes', () => {
    it('should have solana batch size as 50', () => {
      expect(blockchainConfig.batchSizes.solana).toBe(50);
    });

    it('should have polygon batch size as 100', () => {
      expect(blockchainConfig.batchSizes.polygon).toBe(100);
    });

    it('should have positive batch sizes', () => {
      expect(blockchainConfig.batchSizes.solana).toBeGreaterThan(0);
      expect(blockchainConfig.batchSizes.polygon).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // retryConfig
  // ==========================================================================
  describe('retryConfig', () => {
    it('should have maxAttempts as 3', () => {
      expect(blockchainConfig.retryConfig.maxAttempts).toBe(3);
    });

    it('should have baseDelay as 5000', () => {
      expect(blockchainConfig.retryConfig.baseDelay).toBe(5000);
    });

    it('should have maxDelay as 60000', () => {
      expect(blockchainConfig.retryConfig.maxDelay).toBe(60000);
    });

    it('should have maxDelay greater than baseDelay', () => {
      expect(blockchainConfig.retryConfig.maxDelay).toBeGreaterThan(blockchainConfig.retryConfig.baseDelay);
    });

    it('should have positive maxAttempts', () => {
      expect(blockchainConfig.retryConfig.maxAttempts).toBeGreaterThan(0);
    });
  });
});
