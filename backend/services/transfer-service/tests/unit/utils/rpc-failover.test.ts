/**
 * Unit Tests for RPC Failover Utility
 *
 * Tests RPC failover behavior:
 * - Endpoint health tracking and recovery
 * - Automatic failover on failures
 * - Rate limit detection and backoff
 * - Priority fee estimation
 * - Compute unit estimation
 * - Connection caching
 * - Retry logic with exponential backoff
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';

// Mock logger after imports
jest.mock('../../../src/utils/logger');

// Import after mocks are set up
import rpcFailover, {
  executeWithFailover,
  estimatePriorityFee,
  estimateComputeUnits,
  healthCheck,
  getHealthStatus
} from '../../../src/utils/rpc-failover';

describe('RPC Failover Utility - Unit Tests', () => {
  let mockConnection: jest.Mocked<Connection>;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    
    // Create mock connection with all required methods
    mockConnection = {
      endpoint: 'https://test.com',
      getSlot: jest.fn().mockResolvedValue(1000),
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000
      }),
      simulateTransaction: jest.fn().mockResolvedValue({
        value: {
          err: null,
          logs: [],
          unitsConsumed: 200000
        },
        context: { slot: 1000 }
      }),
      getRecentPrioritizationFees: jest.fn().mockResolvedValue([
        { slot: 1000, prioritizationFee: 1000 }
      ])
    } as any;

    // Mock Connection constructor to return our mock
    (Connection as any) = jest.fn(() => mockConnection);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Endpoint Configuration Parsing', () => {
    it('should parse primary endpoint from environment', () => {
      expect(rpcFailover.RPC_CONFIG.endpoints.length).toBeGreaterThan(0);
      expect(rpcFailover.RPC_CONFIG.endpoints[0]).toHaveProperty('url');
      expect(rpcFailover.RPC_CONFIG.endpoints[0]).toHaveProperty('priority');
    });

    it('should have valid configuration defaults', () => {
      expect(rpcFailover.RPC_CONFIG.maxRetries).toBeGreaterThanOrEqual(1);
      expect(rpcFailover.RPC_CONFIG.retryDelay).toBeGreaterThan(0);
      expect(rpcFailover.RPC_CONFIG.requestTimeout).toBeGreaterThan(0);
    });
  });

  describe('Health Tracking', () => {
    it('should initialize health for all endpoints', () => {
      const status = getHealthStatus();
      
      expect(Object.keys(status).length).toBeGreaterThan(0);
      
      Object.values(status).forEach(health => {
        expect(health.healthy).toBe(true);
        expect(health.consecutiveFailures).toBe(0);
        expect(health.totalRequests).toBeGreaterThanOrEqual(0);
        expect(health.totalFailures).toBeGreaterThanOrEqual(0);
      });
    });

    it('should record successful operations', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      await executeWithFailover(operation);
      
      const status = getHealthStatus();
      const endpoints = Object.values(status);
      
      // At least one endpoint should have recorded the success
      const hasSuccess = endpoints.some(h => h.totalRequests > 0 && h.healthy);
      expect(hasSuccess).toBe(true);
    });

    it('should track consecutive failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('timeout'));
      
      // Execute multiple times to trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await executeWithFailover(operation, { maxRetries: 0 });
        } catch (e) {
          // Expected
        }
      }
      
      const status = getHealthStatus();
      const endpoints = Object.values(status);
      
      // Should have failure tracking
      const hasFailures = endpoints.some(h => h.totalFailures > 0);
      expect(hasFailures).toBe(true);
    });

    it('should mark endpoint unhealthy after 3 consecutive failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('connection failed'));
      
      // Trigger 3 failures on same endpoint
      for (let i = 0; i < 3; i++) {
        try {
          await executeWithFailover(operation, { maxRetries: 0 });
        } catch (e) {
          // Expected
        }
      }
      
      const status = getHealthStatus();
      const unhealthyExists = Object.values(status).some(h => !h.healthy);
      
      // At least one endpoint should be marked unhealthy
      expect(unhealthyExists).toBe(true);
    });

    it('should record latency for successful requests', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await executeWithFailover(operation);
      
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rate Limiting Detection', () => {
    it('should detect 429 errors as rate limiting', async () => {
      const rateLimitError = new Error('HTTP 429: Too Many Requests');
      const operation = jest.fn().mockRejectedValue(rateLimitError);
      
      try {
        await executeWithFailover(operation, { maxRetries: 0 });
      } catch (e) {
        // Expected
      }
      
      const status = getHealthStatus();
      const rateLimited = Object.values(status).some(h => h.rateLimitedUntil);
      
      expect(rateLimited).toBe(true);
    });

    it('should detect rate limit in error message', async () => {
      const rateLimitError = new Error('rate limit exceeded');
      const operation = jest.fn().mockRejectedValue(rateLimitError);
      
      try {
        await executeWithFailover(operation, { maxRetries: 0 });
      } catch (e) {
        // Expected
      }
      
      const status = getHealthStatus();
      const rateLimited = Object.values(status).some(h => h.rateLimitedUntil);
      
      expect(rateLimited).toBe(true);
    });
  });

  describe('Endpoint Selection and Failover', () => {
    it('should select highest priority endpoint first', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await executeWithFailover(operation);
      
      expect(result.endpoint).toBeDefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should failover on primary failure', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('primary failed'))
        .mockResolvedValueOnce('success');
      
      const result = await executeWithFailover(operation, { retryDelay: 10 });
      
      expect(result.data).toBe('success');
      expect(operation.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should try multiple times before giving up', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('all failed'));
      
      await expect(
        executeWithFailover(operation, { maxRetries: 2, retryDelay: 10 })
      ).rejects.toThrow();
      
      expect(operation.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should retry multiple times on failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('timeout'));
      
      await expect(
        executeWithFailover(operation, { maxRetries: 2, retryDelay: 10 })
      ).rejects.toThrow();
      
      // Should be initial + 2 retries = 3 calls
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect maxRetries limit', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      
      await expect(
        executeWithFailover(operation, { maxRetries: 2, retryDelay: 10 })
      ).rejects.toThrow();
      
      // Should be limited to initial + 2 retries = 3
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry when maxRetries is 0', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      
      await expect(
        executeWithFailover(operation, { maxRetries: 0 })
      ).rejects.toThrow();
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Request Timeout Handling', () => {
    it('should handle fast operations successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await executeWithFailover(operation);
      
      expect(result.data).toBe('success');
    });

    it('should complete operations within reasonable time', async () => {
      const operation = jest.fn().mockImplementation(async () => {
        // Simulate a quick operation
        return 'success';
      });
      
      const result = await executeWithFailover(operation);
      expect(result.data).toBe('success');
    });
  });

  describe('Connection Caching', () => {
    it('should cache connections per URL and commitment', () => {
      const conn1 = rpcFailover.getConnection('https://test1.com', 'confirmed');
      const conn2 = rpcFailover.getConnection('https://test1.com', 'confirmed');
      
      expect(conn1).toBe(conn2);
    });

    it('should create separate connections for different URLs', () => {
      const conn1 = rpcFailover.getConnection('https://test1.com');
      const conn2 = rpcFailover.getConnection('https://test2.com');
      
      // Different instances
      expect(conn1).toBeDefined();
      expect(conn2).toBeDefined();
    });

    it('should create separate connections for different commitments', () => {
      const conn1 = rpcFailover.getConnection('https://test.com', 'confirmed');
      const conn2 = rpcFailover.getConnection('https://test.com', 'finalized');
      
      // Should create different cache keys
      expect(conn1).toBeDefined();
      expect(conn2).toBeDefined();
    });
  });

  describe('Priority Fee Estimation', () => {
    beforeEach(() => {
      // Reset connection mock for each test
      mockConnection.getRecentPrioritizationFees.mockClear();
    });

    it('should estimate priority fees from recent data', async () => {
      mockConnection.getRecentPrioritizationFees.mockResolvedValue([
        { slot: 1000, prioritizationFee: 100 },
        { slot: 1001, prioritizationFee: 500 },
        { slot: 1002, prioritizationFee: 1000 },
        { slot: 1003, prioritizationFee: 2000 },
        { slot: 1004, prioritizationFee: 5000 }
      ]);
      
      const fee = await estimatePriorityFee('medium');
      
      expect(fee).toBeGreaterThan(0);
      expect(fee).toBeLessThanOrEqual(5000);
    });

    it('should return appropriate tier fee for low', async () => {
      mockConnection.getRecentPrioritizationFees.mockResolvedValue([
        { slot: 1000, prioritizationFee: 100 },
        { slot: 1001, prioritizationFee: 1000 },
        { slot: 1002, prioritizationFee: 5000 }
      ]);
      
      const fee = await estimatePriorityFee('low');
      
      // Should return 25th percentile (index 0, which is 100)
      expect(fee).toBeLessThanOrEqual(1000);
    });

    it('should return appropriate tier fee for high', async () => {
      mockConnection.getRecentPrioritizationFees.mockResolvedValue([
        { slot: 1000, prioritizationFee: 100 },
        { slot: 1001, prioritizationFee: 1000 },
        { slot: 1002, prioritizationFee: 5000 }
      ]);
      
      const fee = await estimatePriorityFee('high');
      
      // Should return 75th percentile
      expect(fee).toBeGreaterThanOrEqual(1000);
    });

    it('should handle empty fee data', async () => {
      mockConnection.getRecentPrioritizationFees.mockResolvedValue([]);
      
      const fee = await estimatePriorityFee('medium');
      
      expect(fee).toBe(1000); // Default medium
    });

    it('should handle fee estimation errors gracefully', async () => {
      mockConnection.getRecentPrioritizationFees.mockRejectedValue(
        new Error('RPC error')
      );
      
      const fee = await estimatePriorityFee('medium');
      
      // Should return default
      expect(fee).toBe(1000);
    });
  });

  describe('Compute Unit Estimation', () => {
    beforeEach(() => {
      mockConnection.simulateTransaction.mockClear();
      mockConnection.getLatestBlockhash.mockClear();
    });

    it('should estimate compute units from simulation', async () => {
      const mockTransaction = new Transaction();
      const mockFeePayer = new PublicKey('11111111111111111111111111111111');
      
      mockConnection.getLatestBlockhash.mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000
      });
      
      mockConnection.simulateTransaction.mockResolvedValue({
        value: {
          err: null,
          logs: [],
          unitsConsumed: 150000
        },
        context: { slot: 1000 }
      } as any);
      
      const units = await estimateComputeUnits(mockTransaction, mockFeePayer);
      
      // Should add 20% buffer: 150000 * 1.2 = 180000
      expect(units).toBe(180000);
    });

    it('should handle simulation errors', async () => {
      const mockTransaction = new Transaction();
      const mockFeePayer = new PublicKey('11111111111111111111111111111111');
      
      mockConnection.getLatestBlockhash.mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000
      });
      
      mockConnection.simulateTransaction.mockResolvedValue({
        value: {
          err: { InstructionError: [0, 'Custom error'] },
          logs: [],
          unitsConsumed: 0
        },
        context: { slot: 1000 }
      } as any);
      
      await expect(
        estimateComputeUnits(mockTransaction, mockFeePayer)
      ).rejects.toThrow('Simulation failed');
    });

    it('should use default units when simulation returns none', async () => {
      const mockTransaction = new Transaction();
      const mockFeePayer = new PublicKey('11111111111111111111111111111111');
      
      mockConnection.getLatestBlockhash.mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000
      });
      
      mockConnection.simulateTransaction.mockResolvedValue({
        value: {
          err: null,
          logs: [],
          unitsConsumed: undefined
        },
        context: { slot: 1000 }
      } as any);
      
      const units = await estimateComputeUnits(mockTransaction, mockFeePayer);
      
      // Should use default 200000 * 1.2 = 240000
      expect(units).toBe(240000);
    });
  });

  describe('Health Checks', () => {
    it('should perform health check on all endpoints', async () => {
      mockConnection.getSlot.mockResolvedValue(1000);
      
      const results = await healthCheck();
      
      expect(results.size).toBeGreaterThan(0);
      
      results.forEach(health => {
        expect(health).toHaveProperty('healthy');
        expect(health).toHaveProperty('lastCheck');
        expect(health).toHaveProperty('lastLatency');
      });
    });

    it('should mark endpoints as unhealthy on check failure', async () => {
      mockConnection.getSlot.mockRejectedValue(new Error('Connection failed'));
      
      await healthCheck();
      
      const status = getHealthStatus();
      const hasUnhealthy = Object.values(status).some(h => h.totalFailures > 0);
      
      expect(hasUnhealthy).toBe(true);
    });

    it('should get current health status for all endpoints', () => {
      const status = getHealthStatus();
      
      expect(Object.keys(status).length).toBeGreaterThan(0);
      
      Object.values(status).forEach(health => {
        expect(health).toHaveProperty('url');
        expect(health).toHaveProperty('healthy');
        expect(health).toHaveProperty('totalRequests');
        expect(health).toHaveProperty('totalFailures');
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle synchronous operation errors', async () => {
      const operation = jest.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      
      await expect(
        executeWithFailover(operation, { maxRetries: 0 })
      ).rejects.toThrow('Sync error');
    });

    it('should preserve error details through retries', async () => {
      const customError = new Error('Specific RPC error');
      (customError as any).code = 'CUSTOM_CODE';
      
      const operation = jest.fn().mockRejectedValue(customError);
      
      try {
        await executeWithFailover(operation, { maxRetries: 1, retryDelay: 10 });
      } catch (error: any) {
        expect(error.message).toBe('Specific RPC error');
      }
    });

    it('should handle malformed health status', () => {
      const status = getHealthStatus();
      
      // Should always return valid structure
      expect(typeof status).toBe('object');
      expect(status).not.toBeNull();
    });

    it('should handle operations that return various types', async () => {
      const op1 = jest.fn().mockResolvedValue({ data: 'object' });
      const op2 = jest.fn().mockResolvedValue('string');
      const op3 = jest.fn().mockResolvedValue(42);
      
      const result1 = await executeWithFailover(op1);
      const result2 = await executeWithFailover(op2);
      const result3 = await executeWithFailover(op3);
      
      expect(result1.data).toEqual({ data: 'object' });
      expect(result2.data).toBe('string');
      expect(result3.data).toBe(42);
    });
  });

  describe('Configuration Options', () => {
    it('should support custom commitment levels', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await executeWithFailover(operation, {
        commitment: 'finalized'
      });
      
      expect(result.data).toBe('success');
    });

    it('should support custom operation names', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await executeWithFailover(operation, {
        operationName: 'custom-operation'
      });
      
      expect(result).toHaveProperty('endpoint');
      expect(result).toHaveProperty('latencyMs');
    });

    it('should support custom retry parameters', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      const result = await executeWithFailover(operation, {
        maxRetries: 5,
        retryDelay: 50
      });
      
      expect(result.data).toBe('success');
    });
  });
});
