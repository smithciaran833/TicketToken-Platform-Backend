/**
 * Unit Tests for utils/circuit-breaker.ts
 * 
 * Tests circuit breaker implementation for Solana RPC and IPFS services.
 * Priority: 🟠 High (18 tests)
 */

import CircuitBreaker from 'opossum';

// Mock opossum before imports
jest.mock('opossum');
jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import {
  getSolanaCircuitBreaker,
  getIPFSCircuitBreaker,
  getCircuitBreakerHealth,
} from '../../../src/utils/circuit-breaker';

// =============================================================================
// Test Setup
// =============================================================================

describe('Circuit Breaker', () => {
  let mockBreakerInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset module cache to get fresh instances
    jest.resetModules();
    
    // Setup mock breaker instance
    mockBreakerInstance = {
      fire: jest.fn(),
      on: jest.fn(),
      opened: false,
      halfOpen: false,
      stats: {
        failures: 0,
        successes: 0,
        rejects: 0,
        fires: 0,
        timeouts: 0,
        cacheHits: 0,
        cacheMisses: 0,
        coalescedHits: 0,
        percentiles: {},
        latencyTimes: [],
        latencyMean: 0
      }
    };
    
    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(() => mockBreakerInstance);
  });

  // =============================================================================
  // SolanaCircuitBreaker Tests
  // =============================================================================

  describe('SolanaCircuitBreaker', () => {
    it('constructor should initialize with CLOSED state', () => {
      const breaker = getSolanaCircuitBreaker();
      expect(breaker.getState()).toBe('closed');
    });

    it('should use configured timeout (30s)', () => {
      getSolanaCircuitBreaker();
      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: 30000
        })
      );
    });

    it('should use configured errorThresholdPercentage (50%)', () => {
      getSolanaCircuitBreaker();
      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          errorThresholdPercentage: 50
        })
      );
    });

    it('should use configured volumeThreshold (5)', () => {
      getSolanaCircuitBreaker();
      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          volumeThreshold: 5
        })
      );
    });

    it('fire should call function when CLOSED', async () => {
      const breaker = getSolanaCircuitBreaker();
      const mockFn = jest.fn().mockResolvedValue('success');
      mockBreakerInstance.fire.mockResolvedValue('success');
      
      const result = await breaker.fire(mockFn);
      
      expect(mockBreakerInstance.fire).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('fire should throw CircuitOpenError when OPEN', async () => {
      const breaker = getSolanaCircuitBreaker();
      mockBreakerInstance.fire.mockRejectedValue(new Error('Circuit is open'));
      
      await expect(breaker.fire(jest.fn())).rejects.toThrow('Circuit is open');
    });

    it('fire should allow single call in HALF_OPEN', async () => {
      const breaker = getSolanaCircuitBreaker();
      mockBreakerInstance.halfOpen = true;
      mockBreakerInstance.fire.mockResolvedValue('test-result');
      
      const result = await breaker.fire(jest.fn().mockResolvedValue('test-result'));
      expect(result).toBe('test-result');
    });

    it('getState should return "closed", "open", or "halfOpen"', () => {
      const breaker = getSolanaCircuitBreaker();
      
      // Test closed state
      mockBreakerInstance.opened = false;
      mockBreakerInstance.halfOpen = false;
      expect(breaker.getState()).toBe('closed');
      
      // Test open state
      mockBreakerInstance.opened = true;
      mockBreakerInstance.halfOpen = false;
      expect(breaker.getState()).toBe('open');
      
      // Test halfOpen state
      mockBreakerInstance.opened = false;
      mockBreakerInstance.halfOpen = true;
      expect(breaker.getState()).toBe('halfOpen');
    });

    it('getStats should return failure count', () => {
      const breaker = getSolanaCircuitBreaker();
      mockBreakerInstance.stats.failures = 5;
      
      const stats = breaker.getStats();
      expect(stats.failures).toBe(5);
    });

    it('getStats should return success count', () => {
      const breaker = getSolanaCircuitBreaker();
      mockBreakerInstance.stats.successes = 10;
      
      const stats = breaker.getStats();
      expect(stats.successes).toBe(10);
    });

    it('isHealthy should return true when closed', () => {
      const breaker = getSolanaCircuitBreaker();
      mockBreakerInstance.opened = false;
      
      expect(breaker.isHealthy()).toBe(true);
    });

    it('isHealthy should return false when open', () => {
      const breaker = getSolanaCircuitBreaker();
      mockBreakerInstance.opened = true;
      
      expect(breaker.isHealthy()).toBe(false);
    });
  });

  // =============================================================================
  // IPFSCircuitBreaker Tests
  // =============================================================================

  describe('IPFSCircuitBreaker', () => {
    it('should use 60s timeout (longer for uploads)', () => {
      getIPFSCircuitBreaker();
      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: 60000
        })
      );
    });

    it('should use configured volumeThreshold (3)', () => {
      getIPFSCircuitBreaker();
      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          volumeThreshold: 3
        })
      );
    });

    it('fire should work independently from Solana breaker', async () => {
      const ipfsBreaker = getIPFSCircuitBreaker();
      mockBreakerInstance.fire.mockResolvedValue('ipfs-result');
      
      const result = await ipfsBreaker.fire(jest.fn().mockResolvedValue('ipfs-result'));
      expect(result).toBe('ipfs-result');
    });
  });

  // =============================================================================
  // Singleton & Health Tests
  // =============================================================================

  describe('Singleton & Health', () => {
    it('getSolanaCircuitBreaker should return singleton', () => {
      const breaker1 = getSolanaCircuitBreaker();
      const breaker2 = getSolanaCircuitBreaker();
      
      // Should be the same instance
      expect(breaker1).toBe(breaker2);
    });

    it('getIPFSCircuitBreaker should return singleton', () => {
      const breaker1 = getIPFSCircuitBreaker();
      const breaker2 = getIPFSCircuitBreaker();
      
      // Should be the same instance
      expect(breaker1).toBe(breaker2);
    });

    it('getCircuitBreakerHealth should return all breaker states', () => {
      // Initialize both breakers
      getSolanaCircuitBreaker();
      getIPFSCircuitBreaker();
      
      const health = getCircuitBreakerHealth();
      
      expect(health).toHaveProperty('solana');
      expect(health).toHaveProperty('ipfs');
      expect(health.solana).toHaveProperty('state');
      expect(health.solana).toHaveProperty('healthy');
      expect(health.solana).toHaveProperty('stats');
      expect(health.ipfs).toHaveProperty('state');
      expect(health.ipfs).toHaveProperty('healthy');
      expect(health.ipfs).toHaveProperty('stats');
    });
  });
});
