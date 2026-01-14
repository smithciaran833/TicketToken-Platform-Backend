/**
 * Gas Fee Estimator Service Integration Tests
 */

import { GasFeeEstimatorService, BlockchainNetwork } from '../../../../src/services/core/gas-fee-estimator.service';
import { RedisService } from '../../../../src/services/redisService';
import axios from 'axios';

// Mock external APIs
jest.mock('axios');
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getRecentBlockhash: jest.fn().mockResolvedValue({
      feeCalculator: { lamportsPerSignature: 5000 },
    }),
  })),
  clusterApiUrl: jest.fn().mockReturnValue('https://api.mainnet-beta.solana.com'),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GasFeeEstimatorService Integration Tests', () => {
  let gasFeeEstimator: GasFeeEstimatorService;

  beforeAll(async () => {
    await RedisService.initialize();
  });

  beforeEach(async () => {
    // Clear cache
    const redis = RedisService.getClient();
    const gasKeys = await redis.keys('gas:*');
    if (gasKeys.length > 0) await redis.del(...gasKeys);
    const cryptoKeys = await redis.keys('crypto:*');
    if (cryptoKeys.length > 0) await redis.del(...cryptoKeys);

    jest.clearAllMocks();

    // Default mock for crypto prices
    mockedAxios.get.mockResolvedValue({
      data: {
        solana: { usd: 100 },
        'matic-network': { usd: 1 },
        ethereum: { usd: 3000 },
      },
    });

    // Default mock for Polygon RPC
    mockedAxios.post.mockResolvedValue({
      data: {
        result: '0x3B9ACA00', // 1 Gwei in hex
      },
    });

    gasFeeEstimator = new GasFeeEstimatorService();
  });

  describe('estimateGasFees', () => {
    describe('Solana network', () => {
      it('should estimate Solana fees', async () => {
        const result = await gasFeeEstimator.estimateGasFees(2, BlockchainNetwork.SOLANA);

        expect(result.network).toBe(BlockchainNetwork.SOLANA);
        expect(result.transactionCount).toBe(2);
        expect(result.feePerTransactionCents).toBeGreaterThanOrEqual(0);
        expect(result.totalFeeCents).toBeGreaterThanOrEqual(0);
      });

      it('should return result with expected structure', async () => {
        const result = await gasFeeEstimator.estimateGasFees(1, BlockchainNetwork.SOLANA);

        expect(result).toHaveProperty('network');
        expect(result).toHaveProperty('feePerTransactionCents');
        expect(result).toHaveProperty('totalFeeCents');
        expect(result).toHaveProperty('transactionCount');
        expect(result).toHaveProperty('gasPrice');
      });

      it('should include gas price in result', async () => {
        const result = await gasFeeEstimator.estimateGasFees(1, BlockchainNetwork.SOLANA);

        expect(result.gasPrice).toBeDefined();
        expect(result.gasPrice).toContain('lamports');
      });
    });

    describe('Polygon network', () => {
      it('should estimate Polygon fees', async () => {
        const result = await gasFeeEstimator.estimateGasFees(2, BlockchainNetwork.POLYGON);

        expect(result.network).toBe(BlockchainNetwork.POLYGON);
        expect(result.transactionCount).toBe(2);
        expect(result.feePerTransactionCents).toBeGreaterThanOrEqual(0);
        expect(result.totalFeeCents).toBeGreaterThanOrEqual(0);
      });

      it('should call Polygon RPC for gas price', async () => {
        await gasFeeEstimator.estimateGasFees(1, BlockchainNetwork.POLYGON);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'eth_gasPrice',
          }),
          expect.any(Object)
        );
      });

      it('should include Gwei in gas price', async () => {
        const result = await gasFeeEstimator.estimateGasFees(1, BlockchainNetwork.POLYGON);

        expect(result.gasPrice).toBeDefined();
        expect(result.gasPrice).toContain('Gwei');
      });
    });

    describe('Ethereum network', () => {
      it('should return fallback for Ethereum (not implemented)', async () => {
        const result = await gasFeeEstimator.estimateGasFees(1, BlockchainNetwork.ETHEREUM);

        expect(result.network).toBe(BlockchainNetwork.ETHEREUM);
        expect(result.gasPrice).toBe('fallback');
        expect(result.feePerTransactionCents).toBe(500); // $5 fallback
      });
    });

    describe('fallback behavior', () => {
      it('should use fallback on Solana error', async () => {
        const { Connection } = require('@solana/web3.js');
        Connection.mockImplementation(() => ({
          getRecentBlockhash: jest.fn().mockRejectedValue(new Error('Network error')),
        }));

        const service = new GasFeeEstimatorService();
        const result = await service.estimateGasFees(2, BlockchainNetwork.SOLANA);

        expect(result.gasPrice).toBe('fallback');
        expect(result.feePerTransactionCents).toBe(5); // Solana fallback
        expect(result.totalFeeCents).toBe(10);
      });

      it('should use fallback on Polygon error', async () => {
        mockedAxios.post.mockRejectedValue(new Error('RPC error'));

        const result = await gasFeeEstimator.estimateGasFees(2, BlockchainNetwork.POLYGON);

        expect(result.gasPrice).toBe('fallback');
        expect(result.feePerTransactionCents).toBe(10); // Polygon fallback
        expect(result.totalFeeCents).toBe(20);
      });

      it('should use fallback crypto prices on API error', async () => {
        mockedAxios.get.mockRejectedValue(new Error('CoinGecko down'));

        const result = await gasFeeEstimator.estimateGasFees(1, BlockchainNetwork.SOLANA);

        // Should still return a result using fallback price
        expect(result).toBeDefined();
        expect(result.totalFeeCents).toBeGreaterThanOrEqual(0);
      });
    });

    describe('caching', () => {
      it('should cache gas fee results', async () => {
        await gasFeeEstimator.estimateGasFees(2, BlockchainNetwork.SOLANA);
        await gasFeeEstimator.estimateGasFees(2, BlockchainNetwork.SOLANA);

        // Solana connection should only be called once (cached)
        const { Connection } = require('@solana/web3.js');
        const mockConnection = Connection.mock.results[0].value;
        expect(mockConnection.getRecentBlockhash).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('getNetworkCongestion', () => {
    it('should return congestion level', async () => {
      const congestion = await gasFeeEstimator.getNetworkCongestion(BlockchainNetwork.SOLANA);

      expect(['low', 'medium', 'high']).toContain(congestion);
    });
  });
});
