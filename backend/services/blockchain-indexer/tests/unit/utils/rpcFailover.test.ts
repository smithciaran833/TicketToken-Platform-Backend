/**
 * Comprehensive Unit Tests for src/utils/rpcFailover.ts
 *
 * Tests RPC failover logic with circuit breakers and health checks
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock metrics
const mockRpcErrorsTotal = {
  inc: jest.fn(),
};
jest.mock('../../../src/utils/metrics', () => ({
  rpcErrorsTotal: mockRpcErrorsTotal,
}));

// Mock CircuitBreaker
const mockCircuitBreakerExecute = jest.fn();
const mockCircuitBreakerReset = jest.fn();
const mockCircuitBreakerGetState = jest.fn(() => 'CLOSED');

const MockCircuitBreaker = jest.fn().mockImplementation(() => ({
  execute: mockCircuitBreakerExecute,
  reset: mockCircuitBreakerReset,
  getState: mockCircuitBreakerGetState,
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  CircuitBreaker: MockCircuitBreaker,
}));

// Mock Solana Connection
const mockConnectionGetSlot = jest.fn();
const MockConnection = jest.fn().mockImplementation(() => ({
  getSlot: mockConnectionGetSlot,
}));

jest.mock('@solana/web3.js', () => ({
  Connection: MockConnection,
}));

import { RPCFailoverManager } from '../../../src/utils/rpcFailover';

describe('src/utils/rpcFailover.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCircuitBreakerExecute.mockImplementation((fn) => fn());
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // =============================================================================
  // CONSTRUCTOR
  // =============================================================================

  describe('Constructor', () => {
    it('should initialize with single endpoint', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      expect(manager).toBeInstanceOf(RPCFailoverManager);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoints: ['https://rpc1.example.com'],
        }),
        'RPC Failover Manager initialized'
      );

      manager.stop();
    });

    it('should initialize with multiple endpoints', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com'],
      });

      expect(manager).toBeInstanceOf(RPCFailoverManager);
      expect(MockCircuitBreaker).toHaveBeenCalledTimes(3);

      manager.stop();
    });

    it('should use custom health check interval', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
        healthCheckIntervalMs: 60000,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          healthCheckIntervalMs: 60000,
        }),
        'RPC Failover Manager initialized'
      );

      manager.stop();
    });

    it('should use custom max consecutive failures', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
        maxConsecutiveFailures: 5,
      });

      expect(manager).toBeInstanceOf(RPCFailoverManager);

      manager.stop();
    });

    it('should throw error with no endpoints', () => {
      expect(() => new RPCFailoverManager({ endpoints: [] })).toThrow(
        'At least one RPC endpoint must be configured'
      );
    });

    it('should start health checks on initialization', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      expect(mockLogger.info).toHaveBeenCalledWith('RPC health checks started');

      manager.stop();
    });
  });

  // =============================================================================
  // GET CONNECTION
  // =============================================================================

  describe('getConnection()', () => {
    it('should return connection to current endpoint', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const connection = manager.getConnection();

      expect(MockConnection).toHaveBeenCalledWith('https://rpc1.example.com', undefined);
      expect(connection).toBeDefined();

      manager.stop();
    });

    it('should use connection config when provided', () => {
      const connectionConfig = { commitment: 'confirmed' as const };
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
        connectionConfig,
      });

      manager.getConnection();

      expect(MockConnection).toHaveBeenCalledWith('https://rpc1.example.com', connectionConfig);

      manager.stop();
    });
  });

  // =============================================================================
  // EXECUTE WITH FAILOVER
  // =============================================================================

  describe('executeWithFailover()', () => {
    it('should execute function successfully', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const fn = jest.fn().mockResolvedValue('success');
      const result = await manager.executeWithFailover(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);

      manager.stop();
    });

    it('should pass connection to function', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const fn = jest.fn().mockResolvedValue('success');
      await manager.executeWithFailover(fn);

      expect(fn).toHaveBeenCalledWith(expect.any(Object));

      manager.stop();
    });

    it('should execute through circuit breaker', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const fn = jest.fn().mockResolvedValue('success');
      await manager.executeWithFailover(fn);

      expect(mockCircuitBreakerExecute).toHaveBeenCalled();

      manager.stop();
    });

    it('should reset consecutive failures on success', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const fn = jest.fn().mockResolvedValue('success');
      await manager.executeWithFailover(fn);

      const status = manager.getStatus();
      expect(status[0].consecutiveFailures).toBe(0);

      manager.stop();
    });

    it('should failover on error', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('RPC failed'))
        .mockResolvedValue('success');

      const result = await manager.executeWithFailover(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://rpc1.example.com',
        }),
        'RPC call failed, attempting failover'
      );

      manager.stop();
    });

    it('should track consecutive failures', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
        maxConsecutiveFailures: 2,
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('RPC failed'))
        .mockResolvedValue('success');

      await manager.executeWithFailover(fn);

      const status = manager.getStatus();
      expect(status[0].consecutiveFailures).toBe(1);

      manager.stop();
    });

    it('should mark endpoint as unhealthy after max failures', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
        maxConsecutiveFailures: 2,
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      await manager.executeWithFailover(fn);

      const status = manager.getStatus();
      expect(status[0].isHealthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://rpc1.example.com',
        }),
        'RPC endpoint marked as unhealthy'
      );

      manager.stop();
    });

    it('should record metrics on error', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const error = new Error('RPC failed');
      error.name = 'RPCError';
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      await manager.executeWithFailover(fn);

      expect(mockRpcErrorsTotal.inc).toHaveBeenCalledWith({ error_type: 'RPCError' });

      manager.stop();
    });

    it('should throw error when all endpoints fail', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const fn = jest.fn().mockRejectedValue(new Error('All failed'));

      await expect(manager.executeWithFailover(fn)).rejects.toThrow(
        'All RPC endpoints failed. Last error: All failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          triedEndpoints: expect.any(Array),
        }),
        'All RPC endpoints failed'
      );

      manager.stop();
    });

    it('should include context in error logs', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');

      await manager.executeWithFailover(fn, 'getTransaction');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'getTransaction',
        }),
        'RPC call failed, attempting failover'
      );

      manager.stop();
    });

    it('should skip unhealthy endpoints during failover', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com'],
        maxConsecutiveFailures: 1,
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1')) // First endpoint fails
        .mockResolvedValue('success'); // Third endpoint succeeds

      await manager.executeWithFailover(fn);

      const status = manager.getStatus();
      expect(status[0].isHealthy).toBe(false);

      manager.stop();
    });
  });

  // =============================================================================
  // GET STATUS
  // =============================================================================

  describe('getStatus()', () => {
    it('should return status of all endpoints', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const status = manager.getStatus();

      expect(status).toHaveLength(2);
      expect(status[0]).toEqual({
        url: 'https://rpc1.example.com',
        isHealthy: true,
        isCurrent: true,
        consecutiveFailures: 0,
        circuitBreakerState: 'CLOSED',
      });
      expect(status[1]).toEqual({
        url: 'https://rpc2.example.com',
        isHealthy: true,
        isCurrent: false,
        consecutiveFailures: 0,
        circuitBreakerState: 'CLOSED',
      });

      manager.stop();
    });

    it('should show current endpoint after failover', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');

      await manager.executeWithFailover(fn);

      const status = manager.getStatus();
      expect(status[0].isCurrent).toBe(false);
      expect(status[1].isCurrent).toBe(true);

      manager.stop();
    });

    it('should show consecutive failures', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');

      await manager.executeWithFailover(fn);

      const status = manager.getStatus();
      expect(status[0].consecutiveFailures).toBe(1);

      manager.stop();
    });
  });

  // =============================================================================
  // HEALTH CHECKS
  // =============================================================================

  describe('Health Checks', () => {
    it('should perform health checks periodically', async () => {
      jest.useFakeTimers();

      mockConnectionGetSlot.mockResolvedValue(12345);

      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
        healthCheckIntervalMs: 1000,
      });

      // Advance past first health check
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockConnectionGetSlot).toHaveBeenCalled();

      manager.stop();
      jest.useRealTimers();
    });

    it('should mark endpoint as healthy on successful health check', async () => {
      jest.useFakeTimers();

      mockConnectionGetSlot.mockResolvedValue(12345);

      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
        healthCheckIntervalMs: 1000,
        maxConsecutiveFailures: 1,
      });

      // Fail the endpoint first
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');
      await manager.executeWithFailover(fn);

      // Run health check
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockCircuitBreakerReset).toHaveBeenCalled();

      manager.stop();
      jest.useRealTimers();
    });

    it('should log when unhealthy endpoint recovers', async () => {
      jest.useFakeTimers();

      mockConnectionGetSlot.mockResolvedValue(12345);

      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
        healthCheckIntervalMs: 1000,
        maxConsecutiveFailures: 1,
      });

      // Mark endpoint as unhealthy
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');
      await manager.executeWithFailover(fn);

      mockLogger.info.mockClear();

      // Health check should mark it healthy again
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://rpc1.example.com',
        }),
        'RPC endpoint recovered and is now healthy'
      );

      manager.stop();
      jest.useRealTimers();
    });

    it('should handle health check failures gracefully', async () => {
      jest.useFakeTimers();

      mockConnectionGetSlot.mockRejectedValue(new Error('Health check failed'));

      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
        healthCheckIntervalMs: 1000,
      });

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://rpc1.example.com',
        }),
        'RPC endpoint health check failed'
      );

      manager.stop();
      jest.useRealTimers();
    });
  });

  // =============================================================================
  // STOP
  // =============================================================================

  describe('stop()', () => {
    it('should stop all health checks', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      manager.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('RPC health checks stopped');
    });

    it('should clear all intervals', () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      manager.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle complete failover cycle', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com'],
        maxConsecutiveFailures: 2,
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await manager.executeWithFailover(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);

      const status = manager.getStatus();
      expect(status[0].consecutiveFailures).toBe(2);
      expect(status[1].consecutiveFailures).toBe(1);
      expect(status[2].consecutiveFailures).toBe(0);

      manager.stop();
    });

    it('should cycle through all endpoints', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com'],
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockResolvedValue('success');

      // This should try all 3, then cycle back to first
      await expect(manager.executeWithFailover(fn)).rejects.toThrow('All RPC endpoints failed');

      expect(fn).toHaveBeenCalledTimes(3);

      manager.stop();
    });

    it('should prefer healthy endpoints during failover', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com'],
        maxConsecutiveFailures: 1,
      });

      // First call - fail first endpoint, succeed on second
      const fn1 = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');
      await manager.executeWithFailover(fn1);

      // Second call - should start with second (healthy) endpoint
      const fn2 = jest.fn().mockResolvedValue('success');
      await manager.executeWithFailover(fn2);

      expect(fn2).toHaveBeenCalledTimes(1); // Should succeed immediately on healthy endpoint

      manager.stop();
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle endpoint with no name in error', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
      });

      const error = new Error('No name');
      delete (error as any).name;

      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      await manager.executeWithFailover(fn);

      expect(mockRpcErrorsTotal.inc).toHaveBeenCalledWith({ error_type: 'unknown' });

      manager.stop();
    });

    it('should handle single endpoint exhaustion', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com'],
      });

      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(manager.executeWithFailover(fn)).rejects.toThrow('All RPC endpoints failed');

      expect(fn).toHaveBeenCalledTimes(1);

      manager.stop();
    });

    it('should handle all endpoints unhealthy', async () => {
      const manager = new RPCFailoverManager({
        endpoints: ['https://rpc1.example.com', 'https://rpc2.example.com'],
        maxConsecutiveFailures: 1,
      });

      // Mark both as unhealthy
      const fn1 = jest.fn().mockRejectedValue(new Error('Fail'));
      await expect(manager.executeWithFailover(fn1)).rejects.toThrow();

      // Should still try to use them
      const fn2 = jest.fn().mockResolvedValue('success');
      const result = await manager.executeWithFailover(fn2);

      expect(result).toBe('success');

      manager.stop();
    });
  });
});
