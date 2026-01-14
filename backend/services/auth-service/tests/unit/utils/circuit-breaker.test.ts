const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Need to reset module between tests due to breaker caching
let circuitBreakerModule: typeof import('../../../src/utils/circuit-breaker');

describe('circuit-breaker utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('getCircuitBreaker', () => {
    it('returns same breaker for same name', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker1 = circuitBreakerModule.getCircuitBreaker('test1', fn);
      const breaker2 = circuitBreakerModule.getCircuitBreaker('test1', fn);

      expect(breaker1).toBe(breaker2);
    });

    it('returns different breakers for different names', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker1 = circuitBreakerModule.getCircuitBreaker('nameA', fn);
      const breaker2 = circuitBreakerModule.getCircuitBreaker('nameB', fn);

      expect(breaker1).not.toBe(breaker2);
    });
  });

  describe('withCircuitBreaker', () => {
    it('wraps function and executes', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockResolvedValue('result');
      const wrapped = circuitBreakerModule.withCircuitBreaker('wrap-test', fn);

      const result = await wrapped('arg1', 'arg2');

      expect(result).toBe('result');
    });

    it('executes fallback when breaker is open', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback-value');
      
      const wrapped = circuitBreakerModule.withCircuitBreaker(
        'fallback-test',
        fn,
        fallback,
        { volumeThreshold: 1, errorThresholdPercentage: 1 }
      );

      // First call fails
      try { await wrapped(); } catch {}
      // Second call should use fallback
      const result = await wrapped();

      expect(result).toBe('fallback-value');
    });
  });

  describe('getCircuitBreakerStats', () => {
    it('returns null for unknown breaker', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const stats = circuitBreakerModule.getCircuitBreakerStats('nonexistent');

      expect(stats).toBeNull();
    });

    it('returns stats for known breaker', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockResolvedValue('ok');
      circuitBreakerModule.getCircuitBreaker('stats-test', fn);

      const stats = circuitBreakerModule.getCircuitBreakerStats('stats-test');

      expect(stats).toHaveProperty('name', 'stats-test');
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('stats');
    });
  });

  describe('resetCircuitBreaker', () => {
    it('returns false for unknown breaker', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const result = circuitBreakerModule.resetCircuitBreaker('unknown');

      expect(result).toBe(false);
    });

    it('closes breaker and returns true', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockResolvedValue('ok');
      circuitBreakerModule.getCircuitBreaker('reset-test', fn);

      const result = circuitBreakerModule.resetCircuitBreaker('reset-test');

      expect(result).toBe(true);
    });
  });

  describe('getAllCircuitBreakerStats', () => {
    it('returns array of all breaker stats', async () => {
      circuitBreakerModule = await import('../../../src/utils/circuit-breaker');
      
      const fn = jest.fn().mockResolvedValue('ok');
      circuitBreakerModule.getCircuitBreaker('all-stats-1', fn);
      circuitBreakerModule.getCircuitBreaker('all-stats-2', fn);

      const allStats = circuitBreakerModule.getAllCircuitBreakerStats();

      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThanOrEqual(2);
    });
  });
});
