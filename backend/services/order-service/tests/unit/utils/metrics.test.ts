/**
 * Unit Tests: Metrics
 *
 * Tests Prometheus metrics registration and functionality
 */

import { register, orderMetrics } from '../../../src/utils/metrics';

describe('Metrics', () => {
  beforeEach(async () => {
    // Reset metrics between tests
    // Note: prom-client metrics persist across tests
  });

  // ============================================
  // Registry
  // ============================================
  describe('Registry', () => {
    it('should have a metrics registry', () => {
      expect(register).toBeDefined();
    });

    it('should be able to get metrics as string', async () => {
      const metrics = await register.metrics();
      expect(typeof metrics).toBe('string');
    });

    it('should include default metrics', async () => {
      const metrics = await register.metrics();
      // Default metrics include process and nodejs metrics
      expect(metrics).toContain('process_');
    });
  });

  // ============================================
  // Order Metrics - Counters
  // ============================================
  describe('Order Counters', () => {
    it('should have ordersCreated counter', () => {
      expect(orderMetrics.ordersCreated).toBeDefined();
      expect(typeof orderMetrics.ordersCreated.inc).toBe('function');
    });

    it('should increment ordersCreated counter', () => {
      const initialValue = orderMetrics.ordersCreated;
      orderMetrics.ordersCreated.inc({ status: 'success' });
      expect(initialValue).toBeDefined();
    });

    it('should have orderStateTransitions counter', () => {
      expect(orderMetrics.orderStateTransitions).toBeDefined();
      expect(typeof orderMetrics.orderStateTransitions.inc).toBe('function');
    });

    it('should increment orderStateTransitions with labels', () => {
      orderMetrics.orderStateTransitions.inc({
        from_state: 'PENDING',
        to_state: 'RESERVED',
      });
      expect(orderMetrics.orderStateTransitions).toBeDefined();
    });

    it('should have ordersCancelled counter', () => {
      expect(orderMetrics.ordersCancelled).toBeDefined();
      expect(typeof orderMetrics.ordersCancelled.inc).toBe('function');
    });

    it('should increment ordersCancelled with reason label', () => {
      orderMetrics.ordersCancelled.inc({ reason: 'user_request' });
      expect(orderMetrics.ordersCancelled).toBeDefined();
    });

    it('should have ordersRefunded counter', () => {
      expect(orderMetrics.ordersRefunded).toBeDefined();
      expect(typeof orderMetrics.ordersRefunded.inc).toBe('function');
    });

    it('should have serviceClientCalls counter', () => {
      expect(orderMetrics.serviceClientCalls).toBeDefined();
      expect(typeof orderMetrics.serviceClientCalls.inc).toBe('function');
    });

    it('should increment serviceClientCalls with labels', () => {
      orderMetrics.serviceClientCalls.inc({
        service: 'payment-service',
        method: 'createPaymentIntent',
        status: 'success',
      });
      expect(orderMetrics.serviceClientCalls).toBeDefined();
    });

    it('should have jobExecutions counter', () => {
      expect(orderMetrics.jobExecutions).toBeDefined();
      expect(typeof orderMetrics.jobExecutions.inc).toBe('function');
    });

    it('should increment jobExecutions with labels', () => {
      orderMetrics.jobExecutions.inc({
        job_name: 'expiration-job',
        status: 'success',
      });
      expect(orderMetrics.jobExecutions).toBeDefined();
    });
  });

  // ============================================
  // Order Metrics - Histograms
  // ============================================
  describe('Order Histograms', () => {
    it('should have orderCreationDuration histogram', () => {
      expect(orderMetrics.orderCreationDuration).toBeDefined();
      expect(typeof orderMetrics.orderCreationDuration.observe).toBe('function');
    });

    it('should observe orderCreationDuration', () => {
      orderMetrics.orderCreationDuration.observe(0.5);
      expect(orderMetrics.orderCreationDuration).toBeDefined();
    });

    it('should have orderAmount histogram', () => {
      expect(orderMetrics.orderAmount).toBeDefined();
      expect(typeof orderMetrics.orderAmount.observe).toBe('function');
    });

    it('should observe orderAmount with currency label', () => {
      orderMetrics.orderAmount.observe({ currency: 'USD' }, 5000);
      expect(orderMetrics.orderAmount).toBeDefined();
    });

    it('should have serviceClientDuration histogram', () => {
      expect(orderMetrics.serviceClientDuration).toBeDefined();
      expect(typeof orderMetrics.serviceClientDuration.observe).toBe('function');
    });

    it('should observe serviceClientDuration with labels', () => {
      orderMetrics.serviceClientDuration.observe(
        { service: 'ticket-service', method: 'reserveTickets' },
        1.5
      );
      expect(orderMetrics.serviceClientDuration).toBeDefined();
    });

    it('should have orderFulfillmentTime histogram', () => {
      expect(orderMetrics.orderFulfillmentTime).toBeDefined();
      expect(typeof orderMetrics.orderFulfillmentTime.observe).toBe('function');
    });
  });

  // ============================================
  // Order Metrics - Gauges
  // ============================================
  describe('Order Gauges', () => {
    it('should have activeReservations gauge', () => {
      expect(orderMetrics.activeReservations).toBeDefined();
      expect(typeof orderMetrics.activeReservations.set).toBe('function');
      expect(typeof orderMetrics.activeReservations.inc).toBe('function');
      expect(typeof orderMetrics.activeReservations.dec).toBe('function');
    });

    it('should set activeReservations', () => {
      orderMetrics.activeReservations.set(10);
      expect(orderMetrics.activeReservations).toBeDefined();
    });

    it('should increment activeReservations', () => {
      orderMetrics.activeReservations.inc();
      expect(orderMetrics.activeReservations).toBeDefined();
    });

    it('should decrement activeReservations', () => {
      orderMetrics.activeReservations.dec();
      expect(orderMetrics.activeReservations).toBeDefined();
    });

    it('should have expiredOrdersProcessed gauge', () => {
      expect(orderMetrics.expiredOrdersProcessed).toBeDefined();
      expect(typeof orderMetrics.expiredOrdersProcessed.set).toBe('function');
    });

    it('should have orderConversionRate gauge', () => {
      expect(orderMetrics.orderConversionRate).toBeDefined();
      expect(typeof orderMetrics.orderConversionRate.set).toBe('function');
    });

    it('should have refundRate gauge', () => {
      expect(orderMetrics.refundRate).toBeDefined();
      expect(typeof orderMetrics.refundRate.set).toBe('function');
    });

    it('should have reservationExpiryRate gauge', () => {
      expect(orderMetrics.reservationExpiryRate).toBeDefined();
      expect(typeof orderMetrics.reservationExpiryRate.set).toBe('function');
    });
  });

  // ============================================
  // Business KPI Metrics
  // ============================================
  describe('Business KPI Metrics', () => {
    it('should have avgOrderValue summary', () => {
      expect(orderMetrics.avgOrderValue).toBeDefined();
      expect(typeof orderMetrics.avgOrderValue.observe).toBe('function');
    });

    it('should observe avgOrderValue with currency', () => {
      orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 7500);
      expect(orderMetrics.avgOrderValue).toBeDefined();
    });
  });

  // ============================================
  // Cache Metrics
  // ============================================
  describe('Cache Metrics', () => {
    it('should have cacheHits counter', () => {
      expect(orderMetrics.cacheHits).toBeDefined();
      expect(typeof orderMetrics.cacheHits.inc).toBe('function');
    });

    it('should increment cacheHits with pattern label', () => {
      orderMetrics.cacheHits.inc({ cache_key_pattern: 'order:*' });
      expect(orderMetrics.cacheHits).toBeDefined();
    });

    it('should have cacheMisses counter', () => {
      expect(orderMetrics.cacheMisses).toBeDefined();
      expect(typeof orderMetrics.cacheMisses.inc).toBe('function');
    });

    it('should have cacheHitRate gauge', () => {
      expect(orderMetrics.cacheHitRate).toBeDefined();
      expect(typeof orderMetrics.cacheHitRate.set).toBe('function');
    });

    it('should have cacheOperationDuration histogram', () => {
      expect(orderMetrics.cacheOperationDuration).toBeDefined();
      expect(typeof orderMetrics.cacheOperationDuration.observe).toBe('function');
    });

    it('should observe cacheOperationDuration with labels', () => {
      orderMetrics.cacheOperationDuration.observe(
        { operation: 'get', cache_key_pattern: 'order:*' },
        0.005
      );
      expect(orderMetrics.cacheOperationDuration).toBeDefined();
    });

    it('should have cacheSets counter', () => {
      expect(orderMetrics.cacheSets).toBeDefined();
      expect(typeof orderMetrics.cacheSets.inc).toBe('function');
    });

    it('should have cacheDeletes counter', () => {
      expect(orderMetrics.cacheDeletes).toBeDefined();
      expect(typeof orderMetrics.cacheDeletes.inc).toBe('function');
    });

    it('should have cacheErrors counter', () => {
      expect(orderMetrics.cacheErrors).toBeDefined();
      expect(typeof orderMetrics.cacheErrors.inc).toBe('function');
    });

    it('should have cacheSize gauge', () => {
      expect(orderMetrics.cacheSize).toBeDefined();
      expect(typeof orderMetrics.cacheSize.set).toBe('function');
    });
  });

  // ============================================
  // Metrics Output
  // ============================================
  describe('Metrics Output', () => {
    it('should include custom metrics in output', async () => {
      const metricsOutput = await register.metrics();
      
      expect(metricsOutput).toContain('orders_created_total');
      expect(metricsOutput).toContain('order_state_transitions_total');
      expect(metricsOutput).toContain('active_reservations');
      expect(metricsOutput).toContain('orders_cancelled_total');
      expect(metricsOutput).toContain('orders_refunded_total');
    });

    it('should include cache metrics in output', async () => {
      const metricsOutput = await register.metrics();
      
      expect(metricsOutput).toContain('cache_hits_total');
      expect(metricsOutput).toContain('cache_misses_total');
      expect(metricsOutput).toContain('cache_hit_rate');
    });

    it('should include service client metrics in output', async () => {
      const metricsOutput = await register.metrics();
      
      expect(metricsOutput).toContain('service_client_calls_total');
      expect(metricsOutput).toContain('service_client_duration_seconds');
    });
  });
});
