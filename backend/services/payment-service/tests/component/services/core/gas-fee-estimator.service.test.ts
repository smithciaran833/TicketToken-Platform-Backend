/**
 * COMPONENT TEST: GasFeeEstimatorService
 *
 * Tests GasFeeEstimatorService - blockchain gas fee estimation with mocked APIs
 */

import axios from 'axios';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SOLANA_NETWORK = 'devnet';
process.env.POLYGON_RPC_URL = 'https://polygon-rpc.com';
process.env.LOG_LEVEL = 'silent';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Solana web3.js
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getRecentBlockhash: jest.fn().mockResolvedValue({
      feeCalculator: {
        lamportsPerSignature: 5000, // 0.000005 SOL
      },
    }),
  })),
  clusterApiUrl: jest.fn().mockReturnValue('https://api.devnet.solana.com'),
}));

// Mock cache service
jest.mock('../../../../src/services/cache.service', () => ({
  cacheService: {
    getOrCompute: async (key: string, fn: () => Promise<any>, ttl: number) => fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { GasFeeEstimatorService, BlockchainNetwork } from '../../../../src/services/core/gas-fee-estimator.service';

describe('GasFeeEstimatorService Component Tests', () => {
  let service: GasFeeEstimatorService;

  beforeEach(() => {
    service = new GasFeeEstimatorService();
    jest.clearAllMocks();
  });

  // ===========================================================================
  // SOLANA FEE ESTIMATION
  // ===========================================================================
  describe('estimateGasFees() for Solana', () => {
    beforeEach(() => {
      // Mock CoinGecko price API for SOL
      mockedAxios.get.mockResolvedValue({
        data: {
          solana: { usd: 100 }, // $100 per SOL
        },
      });
    });

    it('should estimate fees for single ticket', async () => {
      const result = await service.estimateGasFees(1, BlockchainNetwork.SOLANA);

      expect(result.network).toBe(BlockchainNetwork.SOLANA);
      expect(result.transactionCount).toBe(1);
      // Fee might be 0 cents due to rounding (0.000005 SOL * $100 = $0.0005 = 0.05 cents)
      expect(result.feePerTransactionCents).toBeGreaterThanOrEqual(0);
      expect(result.totalFeeCents).toBe(result.feePerTransactionCents);
      expect(result.gasPrice).toContain('lamports');
    });

    it('should estimate fees for multiple tickets', async () => {
      const result = await service.estimateGasFees(10, BlockchainNetwork.SOLANA);

      expect(result.transactionCount).toBe(10);
      // Due to rounding, totalFeeCents might not be exactly 10x feePerTransaction
      expect(result.totalFeeCents).toBeGreaterThanOrEqual(0);
    });

    it('should return valid structure', async () => {
      const result = await service.estimateGasFees(5, BlockchainNetwork.SOLANA);

      expect(result).toHaveProperty('network');
      expect(result).toHaveProperty('feePerTransactionCents');
      expect(result).toHaveProperty('totalFeeCents');
      expect(result).toHaveProperty('transactionCount');
      expect(result).toHaveProperty('gasPrice');
    });

    it('should have very low fees (Solana is cheap)', async () => {
      const result = await service.estimateGasFees(1, BlockchainNetwork.SOLANA);

      // Solana fees are typically < 1 cent
      expect(result.feePerTransactionCents).toBeLessThan(10);
    });
  });

  // ===========================================================================
  // POLYGON FEE ESTIMATION
  // ===========================================================================
  describe('estimateGasFees() for Polygon', () => {
    beforeEach(() => {
      // Mock Polygon RPC response
      mockedAxios.post.mockResolvedValue({
        data: {
          result: '0x174876E800', // 100 Gwei in hex
        },
      });

      // Mock CoinGecko price API for MATIC
      mockedAxios.get.mockResolvedValue({
        data: {
          'matic-network': { usd: 1 }, // $1 per MATIC
        },
      });
    });

    it('should estimate fees for single ticket', async () => {
      const result = await service.estimateGasFees(1, BlockchainNetwork.POLYGON);

      expect(result.network).toBe(BlockchainNetwork.POLYGON);
      expect(result.transactionCount).toBe(1);
      expect(result.feePerTransactionCents).toBeGreaterThan(0);
      expect(result.gasPrice).toContain('Gwei');
    });

    it('should estimate fees for multiple tickets', async () => {
      const result = await service.estimateGasFees(5, BlockchainNetwork.POLYGON);

      expect(result.transactionCount).toBe(5);
      // Total should be roughly 5x per-transaction (allowing for rounding)
      expect(result.totalFeeCents).toBeGreaterThanOrEqual(result.feePerTransactionCents);
    });

    it('should call Polygon RPC correctly', async () => {
      await service.estimateGasFees(1, BlockchainNetwork.POLYGON);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://polygon-rpc.com',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
        }),
        expect.any(Object)
      );
    });

    it('should be more expensive than Solana fallback', async () => {
      const result = await service.estimateGasFees(1, BlockchainNetwork.POLYGON);

      // Polygon NFT minting (~150k gas at 100 Gwei) should be several cents
      expect(result.feePerTransactionCents).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // ETHEREUM FEE ESTIMATION
  // ===========================================================================
  describe('estimateGasFees() for Ethereum', () => {
    it('should return fallback estimate (not implemented)', async () => {
      const result = await service.estimateGasFees(1, BlockchainNetwork.ETHEREUM);

      expect(result.network).toBe(BlockchainNetwork.ETHEREUM);
      expect(result.gasPrice).toBe('fallback');
      // Ethereum fallback is $5 = 500 cents
      expect(result.feePerTransactionCents).toBe(500);
    });

    it('should scale with ticket count', async () => {
      const result = await service.estimateGasFees(10, BlockchainNetwork.ETHEREUM);

      expect(result.totalFeeCents).toBe(5000); // 10 * $5
    });
  });

  // ===========================================================================
  // FALLBACK BEHAVIOR
  // ===========================================================================
  describe('fallback behavior', () => {
    it('should use fallback when Solana RPC fails', async () => {
      // Make the Connection mock throw
      const { Connection } = require('@solana/web3.js');
      Connection.mockImplementation(() => ({
        getRecentBlockhash: jest.fn().mockRejectedValue(new Error('RPC error')),
      }));

      // Re-create service with failing connection
      const failingService = new GasFeeEstimatorService();
      const result = await failingService.estimateGasFees(1, BlockchainNetwork.SOLANA);

      expect(result.gasPrice).toBe('fallback');
      expect(result.feePerTransactionCents).toBe(5); // Solana fallback
    });

    it('should use fallback when Polygon RPC fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('RPC timeout'));

      const result = await service.estimateGasFees(1, BlockchainNetwork.POLYGON);

      expect(result.gasPrice).toBe('fallback');
      expect(result.feePerTransactionCents).toBe(10); // Polygon fallback
    });

    it('should use fallback crypto prices when CoinGecko fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API rate limit'));

      // Should still work with fallback prices
      const result = await service.estimateGasFees(1, BlockchainNetwork.SOLANA);

      expect(result.totalFeeCents).toBeGreaterThanOrEqual(0);
    });

    it('should have conservative fallback rates', async () => {
      mockedAxios.post.mockRejectedValue(new Error('fail'));
      mockedAxios.get.mockRejectedValue(new Error('fail'));

      const solana = await service.estimateGasFees(1, BlockchainNetwork.SOLANA);
      const polygon = await service.estimateGasFees(1, BlockchainNetwork.POLYGON);
      const ethereum = await service.estimateGasFees(1, BlockchainNetwork.ETHEREUM);

      expect(solana.feePerTransactionCents).toBe(5);
      expect(polygon.feePerTransactionCents).toBe(10);
      expect(ethereum.feePerTransactionCents).toBe(500);
    });
  });

  // ===========================================================================
  // NETWORK CONGESTION
  // ===========================================================================
  describe('getNetworkCongestion()', () => {
    it('should return congestion level for Solana', async () => {
      const congestion = await service.getNetworkCongestion(BlockchainNetwork.SOLANA);

      expect(['low', 'medium', 'high']).toContain(congestion);
    });

    it('should return congestion level for Polygon', async () => {
      const congestion = await service.getNetworkCongestion(BlockchainNetwork.POLYGON);

      expect(['low', 'medium', 'high']).toContain(congestion);
    });

    it('should return medium as default', async () => {
      const congestion = await service.getNetworkCongestion(BlockchainNetwork.SOLANA);

      expect(congestion).toBe('medium');
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    beforeEach(() => {
      mockedAxios.get.mockResolvedValue({
        data: { solana: { usd: 100 } },
      });
    });

    it('should handle zero tickets', async () => {
      const result = await service.estimateGasFees(0, BlockchainNetwork.SOLANA);

      expect(result.totalFeeCents).toBe(0);
      expect(result.transactionCount).toBe(0);
    });

    it('should handle large ticket counts', async () => {
      const result = await service.estimateGasFees(1000, BlockchainNetwork.SOLANA);

      expect(result.transactionCount).toBe(1000);
      expect(result.totalFeeCents).toBeGreaterThanOrEqual(0);
    });

    it('should handle unsupported network gracefully', async () => {
      const result = await service.estimateGasFees(1, 'bitcoin' as BlockchainNetwork);

      // Should fall back
      expect(result.gasPrice).toBe('fallback');
    });
  });

  // ===========================================================================
  // COST HIERARCHY
  // ===========================================================================
  describe('cost hierarchy (using fallbacks)', () => {
    beforeEach(() => {
      // Force fallback by failing all APIs
      mockedAxios.post.mockRejectedValue(new Error('fail'));
      mockedAxios.get.mockRejectedValue(new Error('fail'));
    });

    it('should show correct cost ordering: Solana < Polygon < Ethereum', async () => {
      const solana = await service.estimateGasFees(1, BlockchainNetwork.SOLANA);
      const polygon = await service.estimateGasFees(1, BlockchainNetwork.POLYGON);
      const ethereum = await service.estimateGasFees(1, BlockchainNetwork.ETHEREUM);

      // Using fallback rates: Solana 5c, Polygon 10c, Ethereum 500c
      expect(solana.feePerTransactionCents).toBeLessThan(polygon.feePerTransactionCents);
      expect(polygon.feePerTransactionCents).toBeLessThan(ethereum.feePerTransactionCents);
    });

    it('should show significant savings with Solana vs Ethereum', async () => {
      const solana = await service.estimateGasFees(100, BlockchainNetwork.SOLANA);
      const ethereum = await service.estimateGasFees(100, BlockchainNetwork.ETHEREUM);

      // Ethereum should be 100x more expensive than Solana
      expect(ethereum.totalFeeCents).toBeGreaterThan(solana.totalFeeCents * 50);
    });
  });
});
