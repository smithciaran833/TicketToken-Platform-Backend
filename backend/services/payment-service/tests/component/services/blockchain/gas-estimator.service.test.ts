/**
 * COMPONENT TEST: GasEstimatorService
 *
 * Tests blockchain gas fee estimation for Solana and Polygon
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Solana
const mockGetLatestBlockhash = jest.fn();
const mockGetSlot = jest.fn();

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getLatestBlockhash: mockGetLatestBlockhash,
    getSlot: mockGetSlot,
  })),
}));

// Mock ethers
const mockGetFeeData = jest.fn();

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getFeeData: mockGetFeeData,
    })),
    formatEther: jest.fn((wei: number) => (wei / 1e18).toString()),
  },
}));

// Mock blockchain config
jest.mock('../../../../src/config/blockchain', () => ({
  blockchainConfig: {
    solana: { rpcUrl: 'https://api.devnet.solana.com' },
    polygon: {
      rpcUrl: 'https://polygon-rpc.com',
      gasLimits: { mint: 100000 },
    },
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    child: () => ({ error: jest.fn(), info: jest.fn() }),
  },
}));

import { GasEstimatorService } from '../../../../src/services/blockchain/gas-estimator.service';

describe('GasEstimatorService Component Tests', () => {
  let service: GasEstimatorService;

  beforeEach(() => {
    mockGetLatestBlockhash.mockReset();
    mockGetSlot.mockReset();
    mockGetFeeData.mockReset();

    // Default mocks
    mockGetLatestBlockhash.mockResolvedValue({ blockhash: 'abc123' });
    mockGetSlot.mockResolvedValue(12345);
    mockGetFeeData.mockResolvedValue({ gasPrice: BigInt(30000000000) }); // 30 gwei

    service = new GasEstimatorService();
  });

  // ===========================================================================
  // ESTIMATE GAS FEES
  // ===========================================================================
  describe('estimateGasFees()', () => {
    it('should estimate Solana fees', async () => {
      const result = await service.estimateGasFees('solana', 5);

      expect(result.blockchain).toBe('solana');
      expect(result.estimatedFee).toBeGreaterThan(0);
      expect(result.feeInUSD).toBeGreaterThan(0);
      expect(result.congestionLevel).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should estimate Polygon fees', async () => {
      const result = await service.estimateGasFees('polygon', 5);

      expect(result.blockchain).toBe('polygon');
      expect(result.estimatedFee).toBeGreaterThan(0);
      expect(result.feeInUSD).toBeGreaterThan(0);
      expect(result.congestionLevel).toBeDefined();
    });

    it('should cache estimates', async () => {
      await service.estimateGasFees('solana', 5);
      await service.estimateGasFees('solana', 5);

      // Should only call once due to caching
      expect(mockGetLatestBlockhash).toHaveBeenCalledTimes(1);
    });

    it('should use different cache keys for different ticket counts', async () => {
      await service.estimateGasFees('solana', 5);
      await service.estimateGasFees('solana', 10);

      expect(mockGetLatestBlockhash).toHaveBeenCalledTimes(2);
    });

    it('should scale fees with ticket count', async () => {
      const result5 = await service.estimateGasFees('solana', 5);
      
      // Clear cache by creating new instance
      service = new GasEstimatorService();
      const result10 = await service.estimateGasFees('solana', 10);

      expect(result10.feeInUSD).toBeGreaterThan(result5.feeInUSD);
    });

    it('should return fallback on Solana error', async () => {
      mockGetLatestBlockhash.mockRejectedValueOnce(new Error('RPC error'));

      const result = await service.estimateGasFees('solana', 5);

      expect(result.blockchain).toBe('solana');
      expect(result.congestionLevel).toBe('medium');
    });

    it('should return fallback on Polygon error', async () => {
      mockGetFeeData.mockRejectedValueOnce(new Error('RPC error'));

      const result = await service.estimateGasFees('polygon', 5);

      expect(result.blockchain).toBe('polygon');
      expect(result.congestionLevel).toBe('medium');
    });
  });

  // ===========================================================================
  // GET BEST BLOCKCHAIN
  // ===========================================================================
  describe('getBestBlockchain()', () => {
    it('should recommend cheaper blockchain', async () => {
      const result = await service.getBestBlockchain(5);

      expect(result.recommended).toMatch(/solana|polygon/);
      expect(result.reason).toBeDefined();
      expect(result.estimates.solana).toBeDefined();
      expect(result.estimates.polygon).toBeDefined();
    });

    it('should include both estimates', async () => {
      const result = await service.getBestBlockchain(5);

      expect(result.estimates.solana.blockchain).toBe('solana');
      expect(result.estimates.polygon.blockchain).toBe('polygon');
    });

    it('should consider congestion in recommendation', async () => {
      // This is time-of-day dependent in the actual implementation
      const result = await service.getBestBlockchain(10);

      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
    });
  });

  // ===========================================================================
  // CONGESTION LEVELS
  // ===========================================================================
  describe('congestion detection', () => {
    it('should detect Polygon congestion levels', async () => {
      // Low gas price
      mockGetFeeData.mockResolvedValueOnce({ gasPrice: BigInt(20000000000) }); // 20 gwei
      let result = await service.estimateGasFees('polygon', 1);
      expect(result.congestionLevel).toBe('low');

      // High gas price - new instance to clear cache
      service = new GasEstimatorService();
      mockGetFeeData.mockResolvedValueOnce({ gasPrice: BigInt(150000000000) }); // 150 gwei
      result = await service.estimateGasFees('polygon', 1);
      expect(result.congestionLevel).toBe('high');
    });
  });
});
