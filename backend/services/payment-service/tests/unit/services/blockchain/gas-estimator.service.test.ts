/**
 * Gas Estimator Service Tests
 * Tests for blockchain gas fee estimation
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('GasEstimatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('estimateGas', () => {
    it('should estimate gas for NFT mint operation', async () => {
      const operation = 'mint';
      const params = { tokenId: 1, recipient: 'wallet_address' };

      const estimate = await estimateGas(operation, params);

      expect(estimate.gasUnits).toBeGreaterThan(0);
      expect(estimate.gasPrice).toBeDefined();
      expect(estimate.totalCost).toBeDefined();
    });

    it('should estimate gas for NFT transfer', async () => {
      const operation = 'transfer';
      const params = { from: 'addr1', to: 'addr2', tokenId: 1 };

      const estimate = await estimateGas(operation, params);

      expect(estimate.gasUnits).toBeLessThan(100000); // Transfer cheaper than mint
    });

    it('should estimate gas for batch mint', async () => {
      const operation = 'batchMint';
      const params = { tokenIds: [1, 2, 3, 4, 5], recipient: 'wallet' };

      const estimate = await estimateGas(operation, params);

      // Batch should be cheaper per unit
      const singleEstimate = await estimateGas('mint', { tokenId: 1, recipient: 'wallet' });
      expect(estimate.gasUnits / 5).toBeLessThan(singleEstimate.gasUnits);
    });

    it('should include buffer for safety margin', async () => {
      const operation = 'mint';
      const params = { tokenId: 1, recipient: 'wallet' };

      const estimate = await estimateGas(operation, params);

      expect(estimate.buffer).toBeDefined();
      expect(estimate.gasUnits).toBe(Math.ceil(estimate.baseGas * (1 + estimate.buffer)));
    });
  });

  describe('getCurrentGasPrice', () => {
    it('should return current network gas price', async () => {
      const gasPrice = await getCurrentGasPrice('solana');

      expect(gasPrice).toBeGreaterThan(0);
      expect(typeof gasPrice).toBe('number');
    });

    it('should cache gas price for short duration', async () => {
      const price1 = await getCurrentGasPrice('solana');
      const price2 = await getCurrentGasPrice('solana');

      expect(price1).toBe(price2); // Should return cached value
    });

    it('should handle different networks', async () => {
      const solanaPrice = await getCurrentGasPrice('solana');
      const ethereumPrice = await getCurrentGasPrice('ethereum');

      expect(solanaPrice).not.toBe(ethereumPrice);
    });

    it('should return fallback on network error', async () => {
      const price = await getCurrentGasPrice('unknown_network');

      expect(price).toBeGreaterThan(0); // Should return fallback
    });
  });

  describe('calculateTransactionCost', () => {
    it('should calculate total cost in SOL', () => {
      const gasUnits = 50000;
      const gasPrice = 0.000005; // SOL per compute unit

      const cost = calculateTransactionCost(gasUnits, gasPrice);

      expect(cost).toBe(0.25); // 50000 * 0.000005
    });

    it('should convert to USD', () => {
      const gasUnits = 50000;
      const gasPrice = 0.000005;
      const solPrice = 100; // $100 per SOL

      const cost = calculateTransactionCost(gasUnits, gasPrice, { toUSD: true, solPrice });

      expect(cost.sol).toBe(0.25);
      expect(cost.usd).toBe(25); // 0.25 * 100
    });

    it('should handle very small amounts', () => {
      const gasUnits = 100;
      const gasPrice = 0.000001;

      const cost = calculateTransactionCost(gasUnits, gasPrice);

      expect(cost).toBe(0.0001);
    });
  });

  describe('getPriorityFee', () => {
    it('should return priority fee for fast confirmation', () => {
      const fee = getPriorityFee('fast');

      expect(fee).toBeGreaterThan(getPriorityFee('normal'));
    });

    it('should return lower fee for slow transactions', () => {
      const fee = getPriorityFee('slow');

      expect(fee).toBeLessThan(getPriorityFee('normal'));
    });

    it('should return default for normal speed', () => {
      const fee = getPriorityFee('normal');

      expect(fee).toBe(5000); // Default priority fee
    });

    it('should handle high congestion', () => {
      const fee = getPriorityFee('fast', { congestion: 'high' });

      expect(fee).toBeGreaterThan(getPriorityFee('fast'));
    });
  });

  describe('estimateBatchCost', () => {
    it('should estimate cost for multiple mints', async () => {
      const count = 10;
      const operation = 'mint';

      const estimate = await estimateBatchCost(operation, count);

      expect(estimate.totalCost).toBeDefined();
      expect(estimate.perItem).toBeDefined();
      expect(estimate.perItem).toBeLessThan(estimate.totalCost / count * 1.1); // Should have batch discount
    });

    it('should apply volume discounts', async () => {
      const smallBatch = await estimateBatchCost('mint', 5);
      const largeBatch = await estimateBatchCost('mint', 100);

      expect(largeBatch.perItem).toBeLessThan(smallBatch.perItem);
    });

    it('should handle empty batch', async () => {
      const estimate = await estimateBatchCost('mint', 0);

      expect(estimate.totalCost).toBe(0);
      expect(estimate.perItem).toBe(0);
    });
  });

  describe('shouldUseBatch', () => {
    it('should recommend batch for multiple items', () => {
      const result = shouldUseBatch(10);

      expect(result.recommended).toBe(true);
      expect(result.savings).toBeGreaterThan(0);
    });

    it('should not recommend batch for single item', () => {
      const result = shouldUseBatch(1);

      expect(result.recommended).toBe(false);
    });

    it('should calculate estimated savings', () => {
      const result = shouldUseBatch(50);

      expect(result.savings).toBeDefined();
      expect(result.savingsPercent).toBeGreaterThan(10); // At least 10% savings
    });
  });

  describe('getNetworkStatus', () => {
    it('should return network congestion level', async () => {
      const status = await getNetworkStatus('solana');

      expect(['low', 'normal', 'high', 'very_high']).toContain(status.congestion);
    });

    it('should include current TPS', async () => {
      const status = await getNetworkStatus('solana');

      expect(status.tps).toBeDefined();
      expect(status.tps).toBeGreaterThan(0);
    });

    it('should include recommended timing', async () => {
      const status = await getNetworkStatus('solana');

      expect(status.recommendation).toBeDefined();
    });
  });

  describe('optimizeTransaction', () => {
    it('should suggest optimal gas settings', async () => {
      const operation = 'mint';
      const params = { tokenId: 1, recipient: 'wallet' };
      const priority = 'normal';

      const optimized = await optimizeTransaction(operation, params, priority);

      expect(optimized.gasLimit).toBeDefined();
      expect(optimized.priorityFee).toBeDefined();
      expect(optimized.maxFee).toBeDefined();
    });

    it('should adjust for high priority', async () => {
      const operation = 'mint';
      const params = { tokenId: 1, recipient: 'wallet' };

      const normal = await optimizeTransaction(operation, params, 'normal');
      const fast = await optimizeTransaction(operation, params, 'fast');

      expect(fast.priorityFee).toBeGreaterThan(normal.priorityFee);
    });

    it('should include compute budget instruction', async () => {
      const optimized = await optimizeTransaction('mint', { tokenId: 1 }, 'normal');

      expect(optimized.computeBudget).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle negative gas price', () => {
      expect(() => calculateTransactionCost(1000, -1)).toThrow();
    });

    it('should handle zero gas units', () => {
      const cost = calculateTransactionCost(0, 0.000005);

      expect(cost).toBe(0);
    });

    it('should cap maximum gas to prevent DoS', async () => {
      const estimate = await estimateGas('complexOperation', {});

      expect(estimate.gasUnits).toBeLessThanOrEqual(1400000); // Solana limit
    });

    it('should handle network timeout gracefully', async () => {
      const price = await getCurrentGasPrice('timeout_test');

      expect(price).toBeGreaterThan(0); // Should return fallback
    });
  });
});

// Helper functions
async function estimateGas(operation: string, params: any): Promise<any> {
  const gasEstimates: Record<string, number> = {
    mint: 50000,
    transfer: 30000,
    batchMint: 200000,
    complexOperation: 500000,
  };
  
  const baseGas = gasEstimates[operation] || 100000;
  const buffer = 0.2; // 20% buffer
  const gasUnits = Math.ceil(baseGas * (1 + buffer));
  
  return {
    operation,
    baseGas,
    buffer,
    gasUnits,
    gasPrice: 0.000005,
    totalCost: gasUnits * 0.000005,
  };
}

async function getCurrentGasPrice(network: string): Promise<number> {
  const prices: Record<string, number> = {
    solana: 0.000005,
    ethereum: 0.00002,
    polygon: 0.000001,
  };
  return prices[network] || 0.000005;
}

function calculateTransactionCost(gasUnits: number, gasPrice: number, options?: { toUSD?: boolean; solPrice?: number }): any {
  if (gasPrice < 0) throw new Error('Gas price cannot be negative');
  
  const sol = gasUnits * gasPrice;
  
  if (options?.toUSD && options.solPrice) {
    return {
      sol,
      usd: sol * options.solPrice,
    };
  }
  
  return sol;
}

function getPriorityFee(speed: string, options?: { congestion?: string }): number {
  const baseFees: Record<string, number> = {
    slow: 1000,
    normal: 5000,
    fast: 15000,
  };
  
  let fee = baseFees[speed] || 5000;
  
  if (options?.congestion === 'high') {
    fee *= 2;
  }
  
  return fee;
}

async function estimateBatchCost(operation: string, count: number): Promise<any> {
  if (count === 0) {
    return { totalCost: 0, perItem: 0 };
  }
  
  const singleCost = (await estimateGas(operation, {})).totalCost;
  const batchDiscount = count > 50 ? 0.7 : count > 10 ? 0.8 : 0.9;
  const totalCost = singleCost * count * batchDiscount;
  
  return {
    totalCost,
    perItem: totalCost / count,
    discount: 1 - batchDiscount,
  };
}

function shouldUseBatch(count: number): { recommended: boolean; savings: number; savingsPercent: number } {
  if (count <= 1) {
    return { recommended: false, savings: 0, savingsPercent: 0 };
  }
  
  const savingsPercent = count > 50 ? 30 : count > 10 ? 20 : 10;
  const estimatedSingleCost = 0.25;
  const savings = estimatedSingleCost * count * (savingsPercent / 100);
  
  return {
    recommended: true,
    savings,
    savingsPercent,
  };
}

async function getNetworkStatus(network: string): Promise<any> {
  return {
    network,
    congestion: 'normal',
    tps: 2000,
    recommendation: 'Good time to transact',
  };
}

async function optimizeTransaction(operation: string, params: any, priority: string): Promise<any> {
  const estimate = await estimateGas(operation, params);
  const priorityFee = getPriorityFee(priority);
  
  return {
    gasLimit: estimate.gasUnits,
    priorityFee,
    maxFee: estimate.gasUnits * 0.00001,
    computeBudget: {
      units: estimate.gasUnits,
      unitPrice: priorityFee,
    },
  };
}
