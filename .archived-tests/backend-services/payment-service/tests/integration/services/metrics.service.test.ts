/**
 * MetricsService Integration Tests
 */

import { MetricsService, metricsService } from '../../../src/services/metrics.service';

describe('MetricsService', () => {
  beforeEach(() => {
    metricsService.resetMetrics();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(metricsService).toBeDefined();
    });

    it('should have payment metrics', () => {
      expect(metricsService.paymentTotal).toBeDefined();
      expect(metricsService.paymentAmount).toBeDefined();
      expect(metricsService.paymentDuration).toBeDefined();
      expect(metricsService.paymentErrors).toBeDefined();
    });

    it('should have fee metrics', () => {
      expect(metricsService.feeCalculationDuration).toBeDefined();
      expect(metricsService.feeCalculationTotal).toBeDefined();
    });

    it('should have cache metrics', () => {
      expect(metricsService.cacheHits).toBeDefined();
      expect(metricsService.cacheMisses).toBeDefined();
    });

    it('should have circuit breaker metrics', () => {
      expect(metricsService.circuitBreakerState).toBeDefined();
      expect(metricsService.circuitBreakerTrips).toBeDefined();
    });
  });

  describe('recordPayment', () => {
    it('should record successful payment', () => {
      metricsService.recordPayment('success', 5000, 1.5, 'card');
      // No error thrown means success
    });

    it('should record failed payment', () => {
      metricsService.recordPayment('failed', 5000, 0.5, 'card');
    });
  });

  describe('recordPaymentError', () => {
    it('should record payment error', () => {
      metricsService.recordPaymentError('card_declined', 'card');
      metricsService.recordPaymentError('insufficient_funds', 'card');
    });
  });

  describe('recordFeeCalculation', () => {
    it('should record successful fee calculation', () => {
      metricsService.recordFeeCalculation('standard', 0.05, true);
    });

    it('should record failed fee calculation', () => {
      metricsService.recordFeeCalculation('premium', 0.1, false);
    });
  });

  describe('recordTaxCalculation', () => {
    it('should record TaxJar calculation', () => {
      metricsService.recordTaxCalculation('CA', 'taxjar', 0.5, true);
    });

    it('should record fallback calculation', () => {
      metricsService.recordTaxCalculation('TX', 'fallback', 0.01, true);
    });
  });

  describe('recordGasFeeEstimation', () => {
    it('should record gas fee estimation', () => {
      metricsService.recordGasFeeEstimation('solana', 0.3, true);
      metricsService.recordGasFeeEstimation('polygon', 0.2, false);
    });
  });

  describe('recordBlockchainRpcCall', () => {
    it('should record RPC calls', () => {
      metricsService.recordBlockchainRpcCall('solana', 'getRecentBlockhash', 'success');
      metricsService.recordBlockchainRpcCall('polygon', 'eth_gasPrice', 'failed');
    });
  });

  describe('recordCacheOperation', () => {
    it('should record cache hits', () => {
      metricsService.recordCacheOperation('hit', 'payment');
    });

    it('should record cache misses', () => {
      metricsService.recordCacheOperation('miss', 'venue');
    });

    it('should record cache errors', () => {
      metricsService.recordCacheOperation('error', 'session');
    });
  });

  describe('updateCircuitBreakerState', () => {
    it('should update circuit breaker state', () => {
      metricsService.updateCircuitBreakerState('stripe', 'closed');
      metricsService.updateCircuitBreakerState('stripe', 'open');
      metricsService.updateCircuitBreakerState('stripe', 'half-open');
    });
  });

  describe('updateVenueMetrics', () => {
    it('should update venue metrics', () => {
      metricsService.updateVenueMetrics('venue-123', 'premium', 500000);
    });
  });

  describe('updateVenueTierCounts', () => {
    it('should update tier counts', () => {
      metricsService.updateVenueTierCounts({
        standard: 100,
        premium: 25,
        enterprise: 5,
      });
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus format', async () => {
      metricsService.recordPayment('success', 1000, 1.0, 'card');
      const metrics = await metricsService.getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('payment_total');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return JSON format', async () => {
      const metrics = await metricsService.getMetricsJSON();

      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      metricsService.recordPayment('success', 1000, 1.0, 'card');
      metricsService.resetMetrics();
      // No error means success
    });
  });
});
