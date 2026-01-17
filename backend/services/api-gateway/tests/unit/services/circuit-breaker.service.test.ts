import { CircuitBreakerService } from '../../../src/services/circuit-breaker.service';

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/config', () => ({
  config: {
    services: {
      'auth-service': 'http://localhost:3001',
      'venue-service': 'http://localhost:3002',
    },
    circuitBreaker: {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 10,
    },
  },
}));

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CircuitBreakerService();
  });

  describe('constructor', () => {
    it('creates circuit breakers for all configured services', () => {
      const allStats = service.getAllStats();

      expect(allStats['auth-service']).toBeDefined();
      expect(allStats['venue-service']).toBeDefined();
    });

    it('initializes breakers with CLOSED state', () => {
      expect(service.getState('auth-service')).toBe('CLOSED');
      expect(service.getState('venue-service')).toBe('CLOSED');
    });
  });

  describe('execute', () => {
    it('executes function successfully and returns result', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await service.execute('auth-service', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes function directly when breaker does not exist', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await service.execute('unknown-service', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes different functions with same breaker', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');

      const result1 = await service.execute('auth-service', fn1);
      const result2 = await service.execute('auth-service', fn2);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getState', () => {
    it('returns CLOSED for initialized breaker', () => {
      const state = service.getState('auth-service');

      expect(state).toBe('CLOSED');
    });

    it('returns CLOSED for non-existent breaker', () => {
      const state = service.getState('does-not-exist');

      expect(state).toBe('CLOSED');
    });
  });

  describe('getStats', () => {
    it('returns stats object for existing breaker', () => {
      const stats = service.getStats('auth-service');

      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('fires');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successes');
      expect(stats).toHaveProperty('rejects');
      expect(stats).toHaveProperty('timeouts');
    });

    it('returns null for non-existent breaker', () => {
      const stats = service.getStats('non-existent');

      expect(stats).toBeNull();
    });
  });

  describe('getAllStats', () => {
    it('returns stats for all configured services', () => {
      const allStats = service.getAllStats();

      expect(Object.keys(allStats)).toHaveLength(2);
      expect(allStats['auth-service']).toBeDefined();
      expect(allStats['venue-service']).toBeDefined();
    });

    it('includes state and stats for each breaker', () => {
      const allStats = service.getAllStats();

      Object.values(allStats).forEach((stat: any) => {
        expect(stat).toHaveProperty('state');
        expect(stat).toHaveProperty('stats');
        expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(stat.state);
      });
    });

    it('returns stats objects with expected properties', () => {
      const allStats = service.getAllStats();

      expect(allStats['auth-service'].stats).toHaveProperty('fires');
      expect(allStats['auth-service'].stats).toHaveProperty('failures');
      expect(allStats['auth-service'].stats).toHaveProperty('successes');
      expect(allStats['venue-service'].stats).toHaveProperty('fires');
      expect(allStats['venue-service'].stats).toHaveProperty('failures');
      expect(allStats['venue-service'].stats).toHaveProperty('successes');
    });
  });
});
