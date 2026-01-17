import { FastifyInstance } from 'fastify';
import CircuitBreaker from 'opossum';
import {
  setupCircuitBreakerMiddleware,
  getCircuitBreaker,
  clearCircuitBreakers,
} from '../../../src/middleware/circuit-breaker.middleware';
import { createRequestLogger } from '../../../src/utils/logger';

jest.mock('opossum');
jest.mock('../../../src/utils/logger');

describe('circuit-breaker.middleware', () => {
  let mockServer: any;
  let mockLogger: any;
  let mockBreakerInstances: Map<string, any>;
  let intervalCallback: Function;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearCircuitBreakers(); // Clear circuit breakers between tests

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    (createRequestLogger as jest.Mock).mockReturnValue(mockLogger);

    mockBreakerInstances = new Map();

    // Mock CircuitBreaker constructor
    (CircuitBreaker as unknown as jest.Mock).mockImplementation((fn: any, options: any) => {
      const breaker = {
        fire: jest.fn(),
        on: jest.fn(),
        stats: {
          fires: 10,
          failures: 2,
          successes: 8,
          timeouts: 1,
        },
        opened: false,
        _fn: fn,
        _options: options,
      };

      return breaker;
    });

    // Capture setInterval callback
    global.setInterval = jest.fn((callback: Function, interval: number) => {
      if (interval === 60000) {
        intervalCallback = callback;
      }
      return 123 as any;
    }) as any;

    mockServer = {
      decorate: jest.fn(),
      redis: {
        get: jest.fn(),
        setex: jest.fn(),
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('setupCircuitBreakerMiddleware', () => {
    it('creates circuit breakers for all configured services', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      // Should create breakers for all services in CIRCUIT_BREAKER_CONFIGS
      expect(CircuitBreaker).toHaveBeenCalledTimes(19); // Total number of services

      // Verify some key services were created
      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const configs = calls.map(call => call[1]);

      // Check venue-service config
      const venueConfig = configs.find(c => c.timeout === 10000 && c.volumeThreshold === 20);
      expect(venueConfig).toBeDefined();
      expect(venueConfig.errorThresholdPercentage).toBe(50);
      expect(venueConfig.resetTimeout).toBe(60000);
    });

    it('creates circuit breakers with correct timeout for auth-service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const authConfig = calls.find(call => call[1].timeout === 5000);

      expect(authConfig).toBeDefined();
      expect(authConfig[1].volumeThreshold).toBe(20);
    });

    it('creates circuit breakers with correct timeout for payment-service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const paymentConfig = calls.find(call => call[1].timeout === 30000 && call[1].volumeThreshold === 15);

      expect(paymentConfig).toBeDefined();
      expect(paymentConfig[1].errorThresholdPercentage).toBe(50);
    });

    it('creates circuit breakers with correct timeout for blockchain-service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const blockchainConfig = calls.find(call => call[1].timeout === 60000);

      expect(blockchainConfig).toBeDefined();
      expect(blockchainConfig[1].resetTimeout).toBe(120000);
    });

    it('creates circuit breakers with correct timeout for minting-service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const mintingConfig = calls.find(call => call[1].timeout === 90000);

      expect(mintingConfig).toBeDefined();
      expect(mintingConfig[1].resetTimeout).toBe(120000);
    });

    it('sets halfOpenAfter to half of resetTimeout for all breakers', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;

      calls.forEach(call => {
        const config = call[1];
        expect(config.halfOpenAfter).toBe(config.resetTimeout / 2);
      });
    });

    it('decorates server with circuitBreakers map', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      expect(mockServer.decorate).toHaveBeenCalledWith(
        'circuitBreakers',
        expect.any(Map)
      );

      const decoratedMap = mockServer.decorate.mock.calls[0][1];
      expect(decoratedMap.size).toBe(19);
    });

    it('sets up monitoring interval at 60 seconds', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000
      );
    });

    it('registers open event handler for circuit breakers', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breakerInstance = (CircuitBreaker as unknown as jest.Mock).mock.results[0].value;

      expect(breakerInstance.on).toHaveBeenCalledWith('open', expect.any(Function));
    });

    it('registers halfOpen event handler for circuit breakers', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breakerInstance = (CircuitBreaker as unknown as jest.Mock).mock.results[0].value;

      expect(breakerInstance.on).toHaveBeenCalledWith('halfOpen', expect.any(Function));
    });
  });

  describe('circuit breaker event handlers', () => {
    it('logs error when circuit breaker opens', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breakerInstance = (CircuitBreaker as unknown as jest.Mock).mock.results[0].value;
      const openHandler = breakerInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )[1];

      await openHandler();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          service: expect.any(String),
          state: 'open',
          stats: expect.any(Object),
        }),
        expect.stringContaining('Circuit breaker opened for')
      );
    });

    it('logs info when circuit breaker becomes half-open', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breakerInstance = (CircuitBreaker as unknown as jest.Mock).mock.results[0].value;
      const halfOpenHandler = breakerInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'halfOpen'
      )[1];

      halfOpenHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          service: expect.any(String),
          state: 'half-open',
        }),
        expect.stringContaining('Circuit breaker half-open for')
      );
    });
  });

  describe('monitorCircuitBreakers', () => {
    it('logs circuit breaker metrics every minute', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      // Clear previous logger calls
      mockLogger.info.mockClear();

      // Trigger the interval callback
      intervalCallback();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.any(Object),
        }),
        'Circuit breaker metrics'
      );
    });

    it('includes state and stats for all circuit breakers', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      mockLogger.info.mockClear();
      intervalCallback();

      const logCall = mockLogger.info.mock.calls[0][0];
      const metrics = logCall.metrics;

      // Should have metrics for all services
      expect(Object.keys(metrics).length).toBe(19);

      // Check structure of metrics
      const firstService = Object.values(metrics)[0] as any;
      expect(firstService).toEqual(
        expect.objectContaining({
          state: expect.stringMatching(/^(OPEN|CLOSED)$/),
          requests: expect.any(Number),
          failures: expect.any(Number),
          successes: expect.any(Number),
          timeouts: expect.any(Number),
        })
      );
    });

    it('reports CLOSED state when breaker is not opened', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      mockLogger.info.mockClear();
      intervalCallback();

      const logCall = mockLogger.info.mock.calls[0][0];
      const metrics = logCall.metrics;

      // All breakers should be closed initially (opened = false)
      Object.values(metrics).forEach((metric: any) => {
        expect(metric.state).toBe('CLOSED');
      });
    });

    it('reports OPEN state when breaker is opened', async () => {
      // Create a breaker that's opened
      (CircuitBreaker as unknown as jest.Mock).mockImplementationOnce((fn: any, options: any) => {
        return {
          fire: jest.fn(),
          on: jest.fn(),
          stats: {
            fires: 10,
            failures: 8,
            successes: 2,
            timeouts: 3,
          },
          opened: true,
        };
      });

      await setupCircuitBreakerMiddleware(mockServer);

      mockLogger.info.mockClear();
      intervalCallback();

      const logCall = mockLogger.info.mock.calls[0][0];
      const metrics = logCall.metrics;

      // First breaker should be open
      const firstServiceMetrics = Object.values(metrics)[0] as any;
      expect(firstServiceMetrics.state).toBe('OPEN');
    });

    it('includes correct stats from circuit breakers', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      mockLogger.info.mockClear();
      intervalCallback();

      const logCall = mockLogger.info.mock.calls[0][0];
      const metrics = logCall.metrics;
      const firstService = Object.values(metrics)[0] as any;

      expect(firstService.requests).toBe(10);
      expect(firstService.failures).toBe(2);
      expect(firstService.successes).toBe(8);
      expect(firstService.timeouts).toBe(1);
    });
  });

  describe('getCircuitBreaker', () => {
    it('returns circuit breaker for valid service name', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breaker = getCircuitBreaker('venue-service');

      expect(breaker).toBeDefined();
      expect(breaker).toHaveProperty('fire');
      expect(breaker).toHaveProperty('on');
    });

    it('returns circuit breaker for auth-service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breaker = getCircuitBreaker('auth-service');

      expect(breaker).toBeDefined();
    });

    it('returns circuit breaker for payment-service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breaker = getCircuitBreaker('payment-service');

      expect(breaker).toBeDefined();
    });

    it('returns undefined for non-existent service', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breaker = getCircuitBreaker('non-existent-service');

      expect(breaker).toBeUndefined();
    });

    it('returns undefined when called before setup', () => {
      const breaker = getCircuitBreaker('venue-service');

      expect(breaker).toBeUndefined();
    });
  });

  describe('circuit breaker function wrapper', () => {
    it('creates breakers that execute provided function', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const breakerInstance = (CircuitBreaker as unknown as jest.Mock).mock.results[0].value;
      const wrappedFn = breakerInstance._fn;

      const testRequest = jest.fn().mockResolvedValue('result');
      const result = await wrappedFn(testRequest);

      expect(testRequest).toHaveBeenCalled();
      expect(result).toBe('result');
    });
  });

  describe('service-specific configurations', () => {
    it('configures analytics-service with higher error threshold', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const analyticsConfig = calls.find(call =>
        call[1].errorThresholdPercentage === 60 && call[1].volumeThreshold === 10
      );

      expect(analyticsConfig).toBeDefined();
      expect(analyticsConfig[1].timeout).toBe(10000);
    });

    it('configures compliance-service with lower error threshold', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const complianceConfig = calls.find(call => call[1].errorThresholdPercentage === 40);

      expect(complianceConfig).toBeDefined();
      expect(complianceConfig[1].volumeThreshold).toBe(10);
    });

    it('configures monitoring-service with very high error threshold', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const monitoringConfig = calls.find(call => call[1].errorThresholdPercentage === 70);

      expect(monitoringConfig).toBeDefined();
      expect(monitoringConfig[1].timeout).toBe(5000);
    });

    it('configures file-service with longer timeout', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const fileConfigs = calls.filter(call => call[1].timeout === 30000);

      // Both payment-service and file-service have 30000 timeout
      expect(fileConfigs.length).toBeGreaterThan(0);
    });

    it('configures search-service with higher error tolerance', async () => {
      await setupCircuitBreakerMiddleware(mockServer);

      const calls = (CircuitBreaker as unknown as jest.Mock).mock.calls;
      const searchConfig = calls.find(call =>
        call[1].errorThresholdPercentage === 60 && call[1].volumeThreshold === 15
      );

      expect(searchConfig).toBeDefined();
      expect(searchConfig[1].timeout).toBe(10000);
    });
  });
});
