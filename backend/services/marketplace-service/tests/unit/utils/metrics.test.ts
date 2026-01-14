/**
 * Unit Tests for Metrics Utility
 * Tests the Prometheus metrics collection and export functionality
 */

import {
  registry,
  MetricNames,
  BusinessMetrics,
  DatabaseMetrics,
  ExternalServiceMetrics,
  CacheMetrics,
  getMetrics,
  resetMetrics,
  metricsMiddleware
} from '../../../src/utils/metrics';

describe('Metrics Utility', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('MetricNames', () => {
    it('should define HTTP metric names', () => {
      expect(MetricNames.HTTP_REQUESTS_TOTAL).toBe('marketplace_http_requests_total');
      expect(MetricNames.HTTP_REQUEST_DURATION_SECONDS).toBe('marketplace_http_request_duration_seconds');
      expect(MetricNames.HTTP_REQUEST_SIZE_BYTES).toBe('marketplace_http_request_size_bytes');
      expect(MetricNames.HTTP_RESPONSE_SIZE_BYTES).toBe('marketplace_http_response_size_bytes');
    });

    it('should define business metric names', () => {
      expect(MetricNames.LISTINGS_CREATED_TOTAL).toBe('marketplace_listings_created_total');
      expect(MetricNames.LISTINGS_SOLD_TOTAL).toBe('marketplace_listings_sold_total');
      expect(MetricNames.LISTINGS_CANCELLED_TOTAL).toBe('marketplace_listings_cancelled_total');
      expect(MetricNames.LISTINGS_EXPIRED_TOTAL).toBe('marketplace_listings_expired_total');
      expect(MetricNames.PURCHASES_TOTAL).toBe('marketplace_purchases_total');
      expect(MetricNames.PURCHASE_AMOUNT_CENTS).toBe('marketplace_purchase_amount_cents');
      expect(MetricNames.FEES_COLLECTED_CENTS).toBe('marketplace_fees_collected_cents');
      expect(MetricNames.DISPUTES_TOTAL).toBe('marketplace_disputes_total');
    });

    it('should define database metric names', () => {
      expect(MetricNames.DB_QUERY_DURATION_SECONDS).toBe('marketplace_db_query_duration_seconds');
      expect(MetricNames.DB_POOL_SIZE).toBe('marketplace_db_pool_size');
      expect(MetricNames.DB_POOL_AVAILABLE).toBe('marketplace_db_pool_available');
      expect(MetricNames.DB_DEADLOCKS_TOTAL).toBe('marketplace_db_deadlocks_total');
    });

    it('should define external service metric names', () => {
      expect(MetricNames.EXTERNAL_REQUEST_DURATION_SECONDS).toBe('marketplace_external_request_duration_seconds');
      expect(MetricNames.EXTERNAL_REQUEST_ERRORS_TOTAL).toBe('marketplace_external_request_errors_total');
      expect(MetricNames.CIRCUIT_BREAKER_STATE).toBe('marketplace_circuit_breaker_state');
    });

    it('should define cache metric names', () => {
      expect(MetricNames.CACHE_HITS_TOTAL).toBe('marketplace_cache_hits_total');
      expect(MetricNames.CACHE_MISSES_TOTAL).toBe('marketplace_cache_misses_total');
    });

    it('should define service health metric names', () => {
      expect(MetricNames.UPTIME_SECONDS).toBe('marketplace_uptime_seconds');
      expect(MetricNames.ACTIVE_CONNECTIONS).toBe('marketplace_active_connections');
    });
  });

  describe('registry', () => {
    describe('incrementCounter', () => {
      it('should increment counter with no labels', () => {
        registry.incrementCounter('test_counter');
        registry.incrementCounter('test_counter');
        
        const output = registry.export();
        expect(output).toContain('test_counter 2');
      });

      it('should increment counter with labels', () => {
        registry.incrementCounter('test_counter', { method: 'GET' });
        registry.incrementCounter('test_counter', { method: 'GET' });
        registry.incrementCounter('test_counter', { method: 'POST' });
        
        const output = registry.export();
        expect(output).toContain('test_counter{method="GET"} 2');
        expect(output).toContain('test_counter{method="POST"} 1');
      });

      it('should increment counter by custom value', () => {
        registry.incrementCounter('test_counter', {}, 5);
        
        const output = registry.export();
        expect(output).toContain('test_counter 5');
      });
    });

    describe('observeHistogram', () => {
      it('should observe histogram values', () => {
        registry.observeHistogram('test_histogram', 0.5);
        registry.observeHistogram('test_histogram', 1.5);
        
        const output = registry.export();
        expect(output).toContain('# TYPE test_histogram histogram');
        expect(output).toContain('test_histogram_count 2');
        expect(output).toContain('test_histogram_sum 2');
      });

      it('should observe histogram with labels', () => {
        registry.observeHistogram('test_histogram', 0.1, { path: '/api' });
        
        const output = registry.export();
        expect(output).toContain('test_histogram_count{path="/api"} 1');
      });

      it('should populate histogram buckets correctly', () => {
        registry.observeHistogram('test_histogram', 0.008); // <= 0.01 bucket
        
        const output = registry.export();
        expect(output).toContain('test_histogram_bucket{le="0.01"} 1');
        expect(output).toContain('test_histogram_bucket{le="0.025"} 1');
      });
    });

    describe('setGauge', () => {
      it('should set gauge value', () => {
        registry.setGauge('test_gauge', 42);
        
        const output = registry.export();
        expect(output).toContain('test_gauge 42');
      });

      it('should overwrite gauge value', () => {
        registry.setGauge('test_gauge', 10);
        registry.setGauge('test_gauge', 20);
        
        const output = registry.export();
        expect(output).toContain('test_gauge 20');
        expect(output).not.toContain('test_gauge 10');
      });

      it('should set gauge with labels', () => {
        registry.setGauge('test_gauge', 5, { type: 'active' });
        
        const output = registry.export();
        expect(output).toContain('test_gauge{type="active"} 5');
      });
    });

    describe('incGauge', () => {
      it('should increment gauge value', () => {
        registry.incGauge('test_gauge');
        registry.incGauge('test_gauge');
        
        const output = registry.export();
        expect(output).toContain('test_gauge 2');
      });

      it('should decrement gauge with negative value', () => {
        registry.setGauge('test_gauge', 5);
        registry.incGauge('test_gauge', {}, -2);
        
        const output = registry.export();
        expect(output).toContain('test_gauge 3');
      });
    });

    describe('export', () => {
      it('should export metrics in Prometheus format', () => {
        registry.incrementCounter('test_counter');
        registry.setGauge('test_gauge', 10);
        
        const output = registry.export();
        expect(output).toContain('# TYPE test_counter counter');
        expect(output).toContain('# TYPE test_gauge gauge');
      });

      it('should format labels correctly', () => {
        registry.incrementCounter('test_counter', { method: 'GET', status: '200' });
        
        const output = registry.export();
        expect(output).toMatch(/test_counter\{.*method="GET".*\}/);
        expect(output).toMatch(/test_counter\{.*status="200".*\}/);
      });

      it('should return empty string when no metrics', () => {
        const output = registry.export();
        expect(output).toBe('');
      });
    });

    describe('reset', () => {
      it('should clear all metrics', () => {
        registry.incrementCounter('test_counter');
        registry.setGauge('test_gauge', 10);
        registry.observeHistogram('test_histogram', 0.5);
        
        registry.reset();
        
        const output = registry.export();
        expect(output).toBe('');
      });
    });
  });

  describe('BusinessMetrics', () => {
    describe('recordListingCreated', () => {
      it('should increment listings created counter', () => {
        BusinessMetrics.recordListingCreated('venue-123', 10000);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.LISTINGS_CREATED_TOTAL);
        expect(output).toContain('venue_id="venue-123"');
      });
    });

    describe('recordListingSold', () => {
      it('should increment listings sold counter', () => {
        BusinessMetrics.recordListingSold('venue-123', 15000);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.LISTINGS_SOLD_TOTAL);
      });

      it('should record purchase amount histogram', () => {
        BusinessMetrics.recordListingSold('venue-123', 15000);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.PURCHASE_AMOUNT_CENTS);
      });
    });

    describe('recordListingCancelled', () => {
      it('should increment listings cancelled counter', () => {
        BusinessMetrics.recordListingCancelled('venue-456');
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.LISTINGS_CANCELLED_TOTAL);
        expect(output).toContain('venue_id="venue-456"');
      });
    });

    describe('recordListingExpired', () => {
      it('should increment listings expired counter', () => {
        BusinessMetrics.recordListingExpired(5);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.LISTINGS_EXPIRED_TOTAL);
        expect(output).toContain('5');
      });
    });

    describe('recordPurchase', () => {
      it('should record purchase with payment method', () => {
        BusinessMetrics.recordPurchase('venue-123', 20000, 'stripe');
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.PURCHASES_TOTAL);
        expect(output).toContain('payment_method="stripe"');
      });
    });

    describe('recordFeesCollected', () => {
      it('should record fees histogram', () => {
        BusinessMetrics.recordFeesCollected('platform', 500);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.FEES_COLLECTED_CENTS);
        expect(output).toContain('fee_type="platform"');
      });
    });

    describe('recordDispute', () => {
      it('should increment disputes counter', () => {
        BusinessMetrics.recordDispute('venue-123', 'fraud');
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.DISPUTES_TOTAL);
        expect(output).toContain('reason="fraud"');
      });
    });
  });

  describe('DatabaseMetrics', () => {
    describe('recordQueryDuration', () => {
      it('should record query duration histogram', () => {
        DatabaseMetrics.recordQueryDuration('select', 0.05);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.DB_QUERY_DURATION_SECONDS);
        expect(output).toContain('query_type="select"');
      });
    });

    describe('recordDeadlock', () => {
      it('should increment deadlock counter', () => {
        DatabaseMetrics.recordDeadlock();
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.DB_DEADLOCKS_TOTAL);
      });
    });

    describe('updatePoolStats', () => {
      it('should set pool size gauges', () => {
        DatabaseMetrics.updatePoolStats(10, 5);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.DB_POOL_SIZE);
        expect(output).toContain('10');
        expect(output).toContain(MetricNames.DB_POOL_AVAILABLE);
        expect(output).toContain('5');
      });
    });
  });

  describe('ExternalServiceMetrics', () => {
    describe('recordRequest', () => {
      it('should record successful request', () => {
        ExternalServiceMetrics.recordRequest('stripe', true, 0.2);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.EXTERNAL_REQUEST_DURATION_SECONDS);
        expect(output).toContain('service="stripe"');
        expect(output).toContain('success="true"');
      });

      it('should record failed request and increment errors', () => {
        ExternalServiceMetrics.recordRequest('blockchain', false, 5.0);
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.EXTERNAL_REQUEST_ERRORS_TOTAL);
        expect(output).toContain('service="blockchain"');
      });
    });

    describe('updateCircuitBreaker', () => {
      it('should set circuit breaker state to closed', () => {
        ExternalServiceMetrics.updateCircuitBreaker('stripe', 'closed');
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.CIRCUIT_BREAKER_STATE);
        expect(output).toContain('circuit="stripe"');
        expect(output).toContain(' 0');
      });

      it('should set circuit breaker state to half_open', () => {
        ExternalServiceMetrics.updateCircuitBreaker('stripe', 'half_open');
        
        const output = getMetrics();
        expect(output).toContain(' 1');
      });

      it('should set circuit breaker state to open', () => {
        ExternalServiceMetrics.updateCircuitBreaker('stripe', 'open');
        
        const output = getMetrics();
        expect(output).toContain(' 2');
      });
    });
  });

  describe('CacheMetrics', () => {
    describe('recordHit', () => {
      it('should increment cache hits counter', () => {
        CacheMetrics.recordHit('listing');
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.CACHE_HITS_TOTAL);
        expect(output).toContain('cache="listing"');
      });
    });

    describe('recordMiss', () => {
      it('should increment cache misses counter', () => {
        CacheMetrics.recordMiss('listing');
        
        const output = getMetrics();
        expect(output).toContain(MetricNames.CACHE_MISSES_TOTAL);
        expect(output).toContain('cache="listing"');
      });
    });
  });

  describe('getMetrics', () => {
    it('should include uptime in output', () => {
      const output = getMetrics();
      expect(output).toContain(MetricNames.UPTIME_SECONDS);
    });

    it('should return all registered metrics', () => {
      registry.incrementCounter('test_counter');
      registry.setGauge('test_gauge', 5);
      
      const output = getMetrics();
      expect(output).toContain('test_counter');
      expect(output).toContain('test_gauge');
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics', () => {
      registry.incrementCounter('test_counter');
      registry.setGauge('test_gauge', 10);
      
      resetMetrics();
      
      // After reset, only uptime should be present from getMetrics
      const output = registry.export();
      expect(output).not.toContain('test_counter');
      expect(output).not.toContain('test_gauge');
    });
  });

  describe('metricsMiddleware', () => {
    it('should be a function', () => {
      expect(typeof metricsMiddleware).toBe('function');
    });

    it('should call done callback', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' }
      } as any;
      
      const mockReply = {
        statusCode: 200,
        raw: {
          on: jest.fn()
        }
      } as any;
      
      const done = jest.fn();
      
      metricsMiddleware(mockRequest, mockReply, done);
      
      expect(done).toHaveBeenCalled();
    });

    it('should register finish event listener', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' }
      } as any;
      
      const mockReply = {
        statusCode: 200,
        raw: {
          on: jest.fn()
        }
      } as any;
      
      const done = jest.fn();
      
      metricsMiddleware(mockRequest, mockReply, done);
      
      expect(mockReply.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should increment active connections', () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' }
      } as any;
      
      const mockReply = {
        statusCode: 200,
        raw: {
          on: jest.fn()
        }
      } as any;
      
      const done = jest.fn();
      
      metricsMiddleware(mockRequest, mockReply, done);
      
      const output = getMetrics();
      expect(output).toContain(MetricNames.ACTIVE_CONNECTIONS);
    });
  });
});
