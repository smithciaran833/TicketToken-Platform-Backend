/**
 * Unit Tests for Metrics Service
 * 
 * Tests Prometheus metrics collection and recording.
 */

// Mock dependencies before imports
jest.mock('prom-client', () => {
  const mockCounter = {
    inc: jest.fn(),
  };
  const mockHistogram = {
    observe: jest.fn(),
  };
  const mockGauge = {
    set: jest.fn(),
  };
  const mockRegistry = {
    metrics: jest.fn().mockResolvedValue('# Prometheus metrics'),
    getMetricsAsJSON: jest.fn().mockResolvedValue([]),
    resetMetrics: jest.fn(),
  };

  return {
    Registry: jest.fn(() => mockRegistry),
    Counter: jest.fn(() => mockCounter),
    Histogram: jest.fn(() => mockHistogram),
    Gauge: jest.fn(() => mockGauge),
  };
});

jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { MetricsService, metricsService } from '../../../src/services/metrics.service';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MetricsService();
  });

  describe('constructor', () => {
    it('should create a registry', () => {
      expect(Registry).toHaveBeenCalled();
    });

    it('should initialize payment metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_total',
          help: expect.any(String),
        })
      );
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_amount_cents',
        })
      );
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_duration_seconds',
        })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_errors_total',
        })
      );
    });

    it('should initialize fee metrics', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'fee_calculation_duration_seconds',
        })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'fee_calculation_total',
        })
      );
    });

    it('should initialize tax metrics', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tax_calculation_duration_seconds',
        })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'taxjar_api_calls_total',
        })
      );
    });

    it('should initialize gas fee metrics', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'gas_fee_estimation_duration_seconds',
        })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'blockchain_rpc_calls_total',
        })
      );
    });

    it('should initialize cache metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cache_hits_total',
        })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cache_misses_total',
        })
      );
    });

    it('should initialize circuit breaker metrics', () => {
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'circuit_breaker_state',
        })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'circuit_breaker_trips_total',
        })
      );
    });

    it('should initialize venue metrics', () => {
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'venues_by_tier',
        })
      );
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'monthly_volume_by_venue_cents',
        })
      );
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus format metrics', async () => {
      const metrics = await service.getMetrics();
      expect(typeof metrics).toBe('string');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return metrics as JSON', async () => {
      const metrics = await service.getMetricsJSON();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      service.resetMetrics();
      // Registry resetMetrics should be called
      expect((service as any).register.resetMetrics).toHaveBeenCalled();
    });
  });

  describe('recordPayment', () => {
    it('should record successful payment metrics', () => {
      service.recordPayment('success', 10000, 1.5, 'card');

      expect(service.paymentTotal.inc).toHaveBeenCalledWith({
        status: 'success',
        payment_method: 'card',
      });
      expect(service.paymentAmount.observe).toHaveBeenCalledWith(
        { payment_method: 'card' },
        10000
      );
      expect(service.paymentDuration.observe).toHaveBeenCalledWith(
        { payment_method: 'card' },
        1.5
      );
    });

    it('should record failed payment metrics', () => {
      service.recordPayment('failed', 5000, 0.5, 'bank_transfer');

      expect(service.paymentTotal.inc).toHaveBeenCalledWith({
        status: 'failed',
        payment_method: 'bank_transfer',
      });
    });

    it('should record payment with different payment methods', () => {
      service.recordPayment('success', 1000, 0.3, 'apple_pay');

      expect(service.paymentAmount.observe).toHaveBeenCalledWith(
        { payment_method: 'apple_pay' },
        1000
      );
    });
  });

  describe('recordPaymentError', () => {
    it('should record payment error', () => {
      service.recordPaymentError('card_declined', 'card');

      expect(service.paymentErrors.inc).toHaveBeenCalledWith({
        error_type: 'card_declined',
        payment_method: 'card',
      });
    });

    it('should record different error types', () => {
      service.recordPaymentError('insufficient_funds', 'card');

      expect(service.paymentErrors.inc).toHaveBeenCalledWith({
        error_type: 'insufficient_funds',
        payment_method: 'card',
      });
    });
  });

  describe('recordFeeCalculation', () => {
    it('should record successful fee calculation', () => {
      service.recordFeeCalculation('standard', 0.05, true);

      expect(service.feeCalculationTotal.inc).toHaveBeenCalledWith({
        venue_tier: 'standard',
      });
      expect(service.feeCalculationDuration.observe).toHaveBeenCalledWith(
        { venue_tier: 'standard' },
        0.05
      );
      expect(service.feeCalculationErrors.inc).not.toHaveBeenCalled();
    });

    it('should record failed fee calculation', () => {
      service.recordFeeCalculation('premium', 0.1, false);

      expect(service.feeCalculationErrors.inc).toHaveBeenCalledWith({
        error_type: 'calculation_failed',
      });
    });

    it('should record fee calculation for different tiers', () => {
      service.recordFeeCalculation('enterprise', 0.02);

      expect(service.feeCalculationTotal.inc).toHaveBeenCalledWith({
        venue_tier: 'enterprise',
      });
    });
  });

  describe('recordTaxCalculation', () => {
    it('should record successful TaxJar calculation', () => {
      service.recordTaxCalculation('CA', 'taxjar', 0.5, true);

      expect(service.taxCalculationTotal.inc).toHaveBeenCalledWith({
        state: 'CA',
        source: 'taxjar',
      });
      expect(service.taxCalculationDuration.observe).toHaveBeenCalledWith(
        { state: 'CA', source: 'taxjar' },
        0.5
      );
      expect(service.taxJarApiCalls.inc).toHaveBeenCalledWith({
        status: 'success',
      });
    });

    it('should record failed TaxJar calculation', () => {
      service.recordTaxCalculation('NY', 'taxjar', 1.0, false);

      expect(service.taxJarApiCalls.inc).toHaveBeenCalledWith({
        status: 'failed',
      });
      expect(service.taxCalculationErrors.inc).toHaveBeenCalledWith({
        state: 'NY',
        error_type: 'calculation_failed',
      });
    });

    it('should record fallback calculation without TaxJar API call', () => {
      service.recordTaxCalculation('TX', 'fallback', 0.01, true);

      expect(service.taxCalculationTotal.inc).toHaveBeenCalledWith({
        state: 'TX',
        source: 'fallback',
      });
      // taxJarApiCalls should not be called for fallback
      expect(service.taxJarApiCalls.inc).not.toHaveBeenCalled();
    });
  });

  describe('recordGasFeeEstimation', () => {
    it('should record successful gas fee estimation', () => {
      service.recordGasFeeEstimation('solana', 0.3, true);

      expect(service.gasFeeEstimationTotal.inc).toHaveBeenCalledWith({
        network: 'solana',
      });
      expect(service.gasFeeEstimationDuration.observe).toHaveBeenCalledWith(
        { network: 'solana' },
        0.3
      );
    });

    it('should record failed gas fee estimation', () => {
      service.recordGasFeeEstimation('ethereum', 0.5, false);

      expect(service.gasFeeEstimationErrors.inc).toHaveBeenCalledWith({
        network: 'ethereum',
        error_type: 'estimation_failed',
      });
    });
  });

  describe('recordBlockchainRpcCall', () => {
    it('should record successful RPC call', () => {
      service.recordBlockchainRpcCall('solana', 'getTransaction', 'success');

      expect(service.blockchainRpcCalls.inc).toHaveBeenCalledWith({
        network: 'solana',
        method: 'getTransaction',
        status: 'success',
      });
    });

    it('should record failed RPC call', () => {
      service.recordBlockchainRpcCall('solana', 'getBalance', 'failed');

      expect(service.blockchainRpcCalls.inc).toHaveBeenCalledWith({
        network: 'solana',
        method: 'getBalance',
        status: 'failed',
      });
    });
  });

  describe('recordCacheOperation', () => {
    it('should record cache hit', () => {
      service.recordCacheOperation('hit', 'payment');

      expect(service.cacheHits.inc).toHaveBeenCalledWith({
        cache_key_prefix: 'payment',
      });
    });

    it('should record cache miss', () => {
      service.recordCacheOperation('miss', 'tax_rate');

      expect(service.cacheMisses.inc).toHaveBeenCalledWith({
        cache_key_prefix: 'tax_rate',
      });
    });

    it('should record cache error', () => {
      service.recordCacheOperation('error', 'fee');

      expect(service.cacheErrors.inc).toHaveBeenCalledWith({
        operation: 'get',
        error_type: 'redis_error',
      });
    });
  });

  describe('updateCircuitBreakerState', () => {
    it('should set closed state to 0', () => {
      service.updateCircuitBreakerState('stripe', 'closed');

      expect(service.circuitBreakerState.set).toHaveBeenCalledWith(
        { breaker_name: 'stripe' },
        0
      );
      expect(service.circuitBreakerTrips.inc).not.toHaveBeenCalled();
    });

    it('should set open state to 1 and increment trips', () => {
      service.updateCircuitBreakerState('taxjar', 'open');

      expect(service.circuitBreakerState.set).toHaveBeenCalledWith(
        { breaker_name: 'taxjar' },
        1
      );
      expect(service.circuitBreakerTrips.inc).toHaveBeenCalledWith({
        breaker_name: 'taxjar',
      });
    });

    it('should set half-open state to 2', () => {
      service.updateCircuitBreakerState('solana', 'half-open');

      expect(service.circuitBreakerState.set).toHaveBeenCalledWith(
        { breaker_name: 'solana' },
        2
      );
    });
  });

  describe('updateVenueMetrics', () => {
    it('should update monthly volume for venue', () => {
      service.updateVenueMetrics('venue_123', 'premium', 1000000);

      expect(service.monthlyVolumeByVenue.set).toHaveBeenCalledWith(
        { venue_id: 'venue_123', tier: 'premium' },
        1000000
      );
    });
  });

  describe('updateVenueTierCounts', () => {
    it('should update tier counts', () => {
      const counts = {
        standard: 50,
        premium: 20,
        enterprise: 5,
      };

      service.updateVenueTierCounts(counts);

      expect(service.venuesByTier.set).toHaveBeenCalledWith({ tier: 'standard' }, 50);
      expect(service.venuesByTier.set).toHaveBeenCalledWith({ tier: 'premium' }, 20);
      expect(service.venuesByTier.set).toHaveBeenCalledWith({ tier: 'enterprise' }, 5);
    });

    it('should handle empty counts', () => {
      service.updateVenueTierCounts({});

      expect(service.venuesByTier.set).not.toHaveBeenCalled();
    });
  });

  describe('Singleton Export', () => {
    it('should export metricsService singleton', () => {
      expect(metricsService).toBeDefined();
      expect(metricsService).toBeInstanceOf(MetricsService);
    });
  });

  describe('Metric Buckets', () => {
    it('should configure appropriate buckets for payment amount', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_amount_cents',
          buckets: expect.arrayContaining([100, 500, 1000, 5000, 10000]),
        })
      );
    });

    it('should configure appropriate buckets for duration metrics', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_duration_seconds',
          buckets: expect.arrayContaining([0.1, 0.5, 1, 2, 5, 10]),
        })
      );
    });
  });

  describe('Label Names', () => {
    it('should configure correct labels for payment metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_total',
          labelNames: ['status', 'payment_method'],
        })
      );
    });

    it('should configure correct labels for error metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_errors_total',
          labelNames: ['error_type', 'payment_method'],
        })
      );
    });
  });
});
