import { GasEstimatorService } from '../../../../src/services/blockchain/gas-estimator.service';

// Mock Solana
const mockSolanaConnection = {
  getLatestBlockhash: jest.fn().mockResolvedValue({
    blockhash: 'mock_blockhash'
  }),
  getSlot: jest.fn().mockResolvedValue(12345)
};

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => mockSolanaConnection)
}));

// Mock Ethers
const mockPolygonProvider = {
  getFeeData: jest.fn().mockResolvedValue({
    gasPrice: BigInt(30_000_000_000) // 30 gwei
  })
};

jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => mockPolygonProvider),
  formatEther: jest.fn((wei) => (Number(wei) / 1e18).toString())
}));

// Mock blockchain config
jest.mock('../../../../src/config/blockchain', () => ({
  blockchainConfig: {
    solana: {
      rpcUrl: 'https://api.devnet.solana.com'
    },
    polygon: {
      rpcUrl: 'https://polygon-rpc.com',
      gasLimits: {
        mint: 100000
      }
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('GasEstimatorService', () => {
  let service: GasEstimatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GasEstimatorService();
  });

  describe('estimateGasFees - Solana', () => {
    it('should estimate Solana gas fees correctly', async () => {
      const estimate = await service.estimateGasFees('solana', 5);

      expect(estimate.blockchain).toBe('solana');
      expect(estimate.estimatedFee).toBeGreaterThan(0);
      expect(estimate.feeInUSD).toBeGreaterThan(0);
      expect(estimate.congestionLevel).toBeDefined();
      expect(estimate.timestamp).toBeInstanceOf(Date);
    });

    it('should scale fees with ticket count', async () => {
      const estimate1 = await service.estimateGasFees('solana', 1);
      const estimate5 = await service.estimateGasFees('solana', 5);

      expect(estimate5.estimatedFee).toBeGreaterThan(estimate1.estimatedFee);
    });

    it('should cache Solana estimates', async () => {
      await service.estimateGasFees('solana', 3);
      await service.estimateGasFees('solana', 3);

      // Should only call getLatestBlockhash once due to cache
      expect(mockSolanaConnection.getLatestBlockhash).toHaveBeenCalledTimes(1);
    });

    it('should handle Solana RPC errors with fallback', async () => {
      mockSolanaConnection.getLatestBlockhash.mockRejectedValueOnce(
        new Error('RPC error')
      );

      const estimate = await service.estimateGasFees('solana', 2);

      expect(estimate).toBeDefined();
      expect(estimate.blockchain).toBe('solana');
      expect(estimate.congestionLevel).toBe('medium');
    });
  });

  describe('estimateGasFees - Polygon', () => {
    it('should estimate Polygon gas fees correctly', async () => {
      const estimate = await service.estimateGasFees('polygon', 5);

      expect(estimate.blockchain).toBe('polygon');
      expect(estimate.estimatedFee).toBeGreaterThan(0);
      expect(estimate.feeInUSD).toBeGreaterThan(0);
      expect(estimate.congestionLevel).toBeDefined();
    });

    it('should scale fees with ticket count', async () => {
      const estimate1 = await service.estimateGasFees('polygon', 1);
      const estimate10 = await service.estimateGasFees('polygon', 10);

      expect(estimate10.estimatedFee).toBeGreaterThan(estimate1.estimatedFee);
    });

    it('should cache Polygon estimates', async () => {
      await service.estimateGasFees('polygon', 3);
      await service.estimateGasFees('polygon', 3);

      // Should only call getFeeData once due to cache
      expect(mockPolygonProvider.getFeeData).toHaveBeenCalledTimes(1);
    });

    it('should handle Polygon RPC errors with fallback', async () => {
      mockPolygonProvider.getFeeData.mockRejectedValueOnce(
        new Error('RPC error')
      );

      const estimate = await service.estimateGasFees('polygon', 2);

      expect(estimate).toBeDefined();
      expect(estimate.blockchain).toBe('polygon');
      expect(estimate.congestionLevel).toBe('medium');
    });

    it('should determine congestion level based on gas price', async () => {
      // Low gas price
      mockPolygonProvider.getFeeData.mockResolvedValueOnce({
        gasPrice: BigInt(20_000_000_000) // 20 gwei  
      });

      const lowEstimate = await service.estimateGasFees('polygon', 1);
      expect(lowEstimate.congestionLevel).toBe('low');

      // High gas price  
      mockPolygonProvider.getFeeData.mockResolvedValueOnce({
        gasPrice: BigInt(150_000_000_000) // 150 gwei
      });

      const highEstimate = await service.estimateGasFees('polygon', 1);
      expect(highEstimate.congestionLevel).toBe('high');
    });
  });

  describe('getBestBlockchain', () => {
    it('should recommend cheaper blockchain', async () => {
      // Make Solana cheaper  
      mockSolanaConnection.getLatestBlockhash.mockResolvedValue({
        blockhash: 'mock'
      });
      mockPolygonProvider.getFeeData.mockResolvedValue({
        gasPrice: BigInt(100_000_000_000) // High gas = expensive
      });

      const result = await service.getBestBlockchain(5);

      expect(result.recommended).toBe('solana');
      expect(result.reason).toContain('cheaper');
      expect(result.estimates.solana).toBeDefined();
      expect(result.estimates.polygon).toBeDefined();
    });

    it('should override price with congestion level', async () => {
      // Set time to business hours for high congestion
      const spy = jest.spyOn(global.Date.prototype, 'getHours');
      spy.mockReturnValue(14); // 2 PM

      mockPolygonProvider.getFeeData.mockResolvedValue({
        gasPrice: BigInt(20_000_000_000) // Low congestion
      });

      const result = await service.getBestBlockchain(5);

      // Should recommend Polygon despite Solana being cheaper because Solana is congested
      expect(result.recommended).toBe('polygon');
      expect(result.reason).toContain('congested');

      spy.mockRestore();
    });

    it('should provide both estimates for comparison', async () => {
      const result = await service.getBestBlockchain(3);

      expect(result.estimates.solana.blockchain).toBe('solana');
      expect(result.estimates.polygon.blockchain).toBe('polygon');
    });

    it('should calculate savings percentage', async () => {
      const result = await service.getBestBlockchain(10);

      expect(result.reason).toMatch(/\d+% cheaper/);
    });
  });

  describe('Caching', () => {
    it('should expire cache after TTL', async () => {
      // First call
      await service.estimateGasFees('solana', 2);
      expect(mockSolanaConnection.getLatestBlockhash).toHaveBeenCalledTimes(1);

      // Advance time by more than cache TTL (1 minute)
      jest.advanceTimersByTime(65000);

      // Second call should hit RPC again
      await service.estimateGasFees('solana', 2);
      expect(mockSolanaConnection.getLatestBlockhash).toHaveBeenCalledTimes(2);
    });

    it('should cache different ticket counts separately', async () => {
      await service.estimateGasFees('solana', 1);
      await service.estimateGasFees('solana', 5);

      // Should make 2 RPC calls for different ticket counts
      expect(mockSolanaConnection.getLatestBlockhash).toHaveBeenCalledTimes(2);
    });

    it('should cache different blockchains separately', async () => {
      await service.estimateGasFees('solana', 3);
      await service.estimateGasFees('polygon', 3);

      expect(mockSolanaConnection.getLatestBlockhash).toHaveBeenCalledTimes(1);
      expect(mockPolygonProvider.getFeeData).toHaveBeenCalledTimes(1);
    });
  });

  describe('Congestion Level', () => {
    it('should detect low congestion at night', () => {
      const spy = jest.spyOn(global.Date.prototype, 'getHours');
      spy.mockReturnValue(3); // 3 AM

      const level = (service as any).determineCongestionLevel(12345);
      expect(level).toBe('low');

      spy.mockRestore();
    });

    it('should detect high congestion during business hours', () => {
      const spy = jest.spyOn(global.Date.prototype, 'getHours');
      spy.mockReturnValue(14); // 2 PM

      const level = (service as any).determineCongestionLevel(12345);
      expect(level).toBe('high');

      spy.mockRestore();
    });

    it('should detect medium congestion in evening', () => {
      const spy = jest.spyOn(global.Date.prototype, 'getHours');
      spy.mockReturnValue(20); // 8 PM

      const level = (service as any).determineCongestionLevel(12345);
      expect(level).toBe('medium');

      spy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero ticket count', async () => {
      const estimate = await service.estimateGasFees('solana', 0);

      expect(estimate).toBeDefined();
      expect(estimate.estimatedFee).toBeGreaterThanOrEqual(0);
    });

    it('should handle large ticket counts', async () => {
      const estimate = await service.estimateGasFees('polygon', 1000);

      expect(estimate).toBeDefined();
      expect(estimate.estimatedFee).toBeGreaterThan(0);
    });

    it('should handle concurrent estimation requests', async () => {
      const promises = [
        service.estimateGasFees('solana', 1),
        service.estimateGasFees('polygon', 1),
        service.estimateGasFees('solana', 2)
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].blockchain).toBe('solana');
      expect(results[1].blockchain).toBe('polygon');
    });
  });
});
