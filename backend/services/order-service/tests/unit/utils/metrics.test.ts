import client from 'prom-client';
import { register, orderMetrics } from '../../../src/utils/metrics';

describe('Metrics', () => {
  beforeEach(() => {
    // Reset all metrics before each test
    register.resetMetrics();
  });

  describe('Registry', () => {
    it('should export a registry instance', () => {
      expect(register).toBeInstanceOf(client.Registry);
    });

    it('should have default metrics registered', () => {
      const metrics = register.metrics();
      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('nodejs_heap_size_total_bytes');
    });

    it('should contain custom order metrics', async () => {
      orderMetrics.ordersCreated.inc();
      const metrics = await register.metrics();
      expect(metrics).toContain('orders_created_total');
    });
  });

  describe('Counter Metrics', () => {
    describe('ordersCreated', () => {
      it('should be a Counter instance', () => {
        expect(orderMetrics.ordersCreated).toBeInstanceOf(client.Counter);
      });

      it('should increment without labels', () => {
        orderMetrics.ordersCreated.inc();
        orderMetrics.ordersCreated.inc();
        expect(orderMetrics.ordersCreated.get().values[0].value).toBe(2);
      });

      it('should increment with status label', () => {
        orderMetrics.ordersCreated.inc({ status: 'confirmed' });
        orderMetrics.ordersCreated.inc({ status: 'confirmed' });
        orderMetrics.ordersCreated.inc({ status: 'pending' });
        
        const metrics = orderMetrics.ordersCreated.get();
        const confirmed = metrics.values.find(v => v.labels.status === 'confirmed');
        const pending = metrics.values.find(v => v.labels.status === 'pending');
        
        expect(confirmed?.value).toBe(2);
        expect(pending?.value).toBe(1);
      });

      it('should increment by specific amount', () => {
        orderMetrics.ordersCreated.inc({ status: 'confirmed' }, 5);
        const metrics = orderMetrics.ordersCreated.get();
        expect(metrics.values[0].value).toBe(5);
      });
    });

    describe('orderStateTransitions', () => {
      it('should be a Counter instance', () => {
        expect(orderMetrics.orderStateTransitions).toBeInstanceOf(client.Counter);
      });

      it('should track state transitions with labels', () => {
        orderMetrics.orderStateTransitions.inc({ from_state: 'pending', to_state: 'confirmed' });
        orderMetrics.orderStateTransitions.inc({ from_state: 'confirmed', to_state: 'fulfilled' });
        
        const metrics = orderMetrics.orderStateTransitions.get();
        expect(metrics.values).toHaveLength(2);
      });
    });

    describe('ordersCancelled', () => {
      it('should track cancellations with reason', () => {
        orderMetrics.ordersCancelled.inc({ reason: 'customer_request' }, 3);
        orderMetrics.ordersCancelled.inc({ reason: 'payment_failed' }, 2);
        
        const metrics = orderMetrics.ordersCancelled.get();
        const customerReq = metrics.values.find(v => v.labels.reason === 'customer_request');
        const paymentFailed = metrics.values.find(v => v.labels.reason === 'payment_failed');
        
        expect(customerReq?.value).toBe(3);
        expect(paymentFailed?.value).toBe(2);
      });
    });

    describe('ordersRefunded', () => {
      it('should be a Counter instance', () => {
        expect(orderMetrics.ordersRefunded).toBeInstanceOf(client.Counter);
      });

      it('should track refunds', () => {
        orderMetrics.ordersRefunded.inc();
        orderMetrics.ordersRefunded.inc();
        expect(orderMetrics.ordersRefunded.get().values[0].value).toBe(2);
      });
    });

    describe('serviceClientCalls', () => {
      it('should track service calls with multiple labels', () => {
        orderMetrics.serviceClientCalls.inc({ 
          service: 'payment-service', 
          method: 'POST', 
          status: '200' 
        });
        orderMetrics.serviceClientCalls.inc({ 
          service: 'inventory-service', 
          method: 'GET', 
          status: '200' 
        });
        
        const metrics = orderMetrics.serviceClientCalls.get();
        expect(metrics.values).toHaveLength(2);
      });
    });

    describe('jobExecutions', () => {
      it('should track job executions with status', () => {
        orderMetrics.jobExecutions.inc({ job_name: 'cleanup', status: 'success' }, 10);
        orderMetrics.jobExecutions.inc({ job_name: 'cleanup', status: 'failure' }, 2);
        
        const metrics = orderMetrics.jobExecutions.get();
        const success = metrics.values.find(v => v.labels.status === 'success');
        const failure = metrics.values.find(v => v.labels.status === 'failure');
        
        expect(success?.value).toBe(10);
        expect(failure?.value).toBe(2);
      });
    });
  });

  describe('Histogram Metrics', () => {
    describe('orderCreationDuration', () => {
      it('should be a Histogram instance', () => {
        expect(orderMetrics.orderCreationDuration).toBeInstanceOf(client.Histogram);
      });

      it('should observe durations', () => {
        orderMetrics.orderCreationDuration.observe(0.5);
        orderMetrics.orderCreationDuration.observe(1.5);
        orderMetrics.orderCreationDuration.observe(3.0);
        
        const metrics = orderMetrics.orderCreationDuration.get();
        expect(metrics.values[0].metricName).toBe('order_creation_duration_seconds');
      });

      it('should have correct buckets', () => {
        orderMetrics.orderCreationDuration.observe(0.05);
        orderMetrics.orderCreationDuration.observe(0.3);
        orderMetrics.orderCreationDuration.observe(0.8);
        orderMetrics.orderCreationDuration.observe(1.5);
        orderMetrics.orderCreationDuration.observe(3.0);
        
        const metrics = orderMetrics.orderCreationDuration.get();
        const buckets = metrics.values.filter(v => v.metricName?.includes('bucket'));
        expect(buckets.length).toBeGreaterThan(0);
      });

      it('should track count and sum', () => {
        orderMetrics.orderCreationDuration.observe(1.0);
        orderMetrics.orderCreationDuration.observe(2.0);
        
        const metrics = orderMetrics.orderCreationDuration.get();
        const count = metrics.values.find(v => v.metricName?.includes('count'));
        const sum = metrics.values.find(v => v.metricName?.includes('sum'));
        
        expect(count?.value).toBe(2);
        expect(sum?.value).toBe(3.0);
      });
    });

    describe('orderAmount', () => {
      it('should observe order amounts with currency label', () => {
        orderMetrics.orderAmount.observe({ currency: 'USD' }, 5000);
        orderMetrics.orderAmount.observe({ currency: 'USD' }, 15000);
        orderMetrics.orderAmount.observe({ currency: 'EUR' }, 8000);
        
        const metrics = orderMetrics.orderAmount.get();
        expect(metrics.values.length).toBeGreaterThan(0);
      });

      it('should have appropriate buckets for order amounts', () => {
        orderMetrics.orderAmount.observe({ currency: 'USD' }, 500);
        orderMetrics.orderAmount.observe({ currency: 'USD' }, 7500);
        orderMetrics.orderAmount.observe({ currency: 'USD' }, 75000);
        
        const metrics = orderMetrics.orderAmount.get();
        const buckets = metrics.values.filter(v => v.metricName?.includes('bucket'));
        expect(buckets.length).toBeGreaterThan(0);
      });
    });

    describe('serviceClientDuration', () => {
      it('should observe service call durations', () => {
        orderMetrics.serviceClientDuration.observe({ 
          service: 'payment-service', 
          method: 'POST' 
        }, 0.5);
        
        const metrics = orderMetrics.serviceClientDuration.get();
        expect(metrics.values.length).toBeGreaterThan(0);
      });
    });

    describe('orderFulfillmentTime', () => {
      it('should observe fulfillment times', () => {
        orderMetrics.orderFulfillmentTime.observe(120); // 2 minutes
        orderMetrics.orderFulfillmentTime.observe(600); // 10 minutes
        orderMetrics.orderFulfillmentTime.observe(1800); // 30 minutes
        
        const metrics = orderMetrics.orderFulfillmentTime.get();
        const count = metrics.values.find(v => v.metricName?.includes('count'));
        expect(count?.value).toBe(3);
      });
    });
  });

  describe('Gauge Metrics', () => {
    describe('activeReservations', () => {
      it('should be a Gauge instance', () => {
        expect(orderMetrics.activeReservations).toBeInstanceOf(client.Gauge);
      });

      it('should set gauge value', () => {
        orderMetrics.activeReservations.set(10);
        expect(orderMetrics.activeReservations.get().values[0].value).toBe(10);
      });

      it('should increment gauge', () => {
        orderMetrics.activeReservations.set(5);
        orderMetrics.activeReservations.inc();
        orderMetrics.activeReservations.inc(2);
        expect(orderMetrics.activeReservations.get().values[0].value).toBe(8);
      });

      it('should decrement gauge', () => {
        orderMetrics.activeReservations.set(10);
        orderMetrics.activeReservations.dec();
        orderMetrics.activeReservations.dec(3);
        expect(orderMetrics.activeReservations.get().values[0].value).toBe(6);
      });
    });

    describe('expiredOrdersProcessed', () => {
      it('should set expired orders count', () => {
        orderMetrics.expiredOrdersProcessed.set(25);
        expect(orderMetrics.expiredOrdersProcessed.get().values[0].value).toBe(25);
      });
    });

    describe('orderConversionRate', () => {
      it('should set conversion rate', () => {
        orderMetrics.orderConversionRate.set(0.75); // 75%
        expect(orderMetrics.orderConversionRate.get().values[0].value).toBe(0.75);
      });

      it('should update conversion rate', () => {
        orderMetrics.orderConversionRate.set(0.65);
        orderMetrics.orderConversionRate.set(0.80);
        expect(orderMetrics.orderConversionRate.get().values[0].value).toBe(0.80);
      });
    });

    describe('refundRate', () => {
      it('should set refund rate', () => {
        orderMetrics.refundRate.set(0.05); // 5%
        expect(orderMetrics.refundRate.get().values[0].value).toBe(0.05);
      });
    });

    describe('reservationExpiryRate', () => {
      it('should set expiry rate', () => {
        orderMetrics.reservationExpiryRate.set(0.15); // 15%
        expect(orderMetrics.reservationExpiryRate.get().values[0].value).toBe(0.15);
      });
    });
  });

  describe('Summary Metrics', () => {
    describe('avgOrderValue', () => {
      it('should be a Summary instance', () => {
        expect(orderMetrics.avgOrderValue).toBeInstanceOf(client.Summary);
      });

      it('should observe order values', () => {
        orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 5000);
        orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 10000);
        orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 7500);
        
        const metrics = orderMetrics.avgOrderValue.get();
        expect(metrics.values.length).toBeGreaterThan(0);
      });

      it('should calculate summary statistics', () => {
        for (let i = 0; i < 100; i++) {
          orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 1000 + i * 100);
        }
        
        const metrics = orderMetrics.avgOrderValue.get();
        const count = metrics.values.find(v => v.metricName?.includes('count'));
        const sum = metrics.values.find(v => v.metricName?.includes('sum'));
        
        expect(count?.value).toBe(100);
        expect(sum?.value).toBeGreaterThan(0);
      });
    });
  });

  describe('Metric Registration', () => {
    it('should have all counter metrics registered', async () => {
      orderMetrics.ordersCreated.inc();
      orderMetrics.orderStateTransitions.inc({ from_state: 'pending', to_state: 'confirmed' });
      orderMetrics.ordersCancelled.inc({ reason: 'test' });
      orderMetrics.ordersRefunded.inc();
      orderMetrics.serviceClientCalls.inc({ service: 'test', method: 'GET', status: '200' });
      orderMetrics.jobExecutions.inc({ job_name: 'test', status: 'success' });
      
      const metrics = await register.metrics();
      expect(metrics).toContain('orders_created_total');
      expect(metrics).toContain('order_state_transitions_total');
      expect(metrics).toContain('orders_cancelled_total');
      expect(metrics).toContain('orders_refunded_total');
      expect(metrics).toContain('service_client_calls_total');
      expect(metrics).toContain('job_executions_total');
    });

    it('should have all histogram metrics registered', async () => {
      orderMetrics.orderCreationDuration.observe(1.0);
      orderMetrics.orderAmount.observe({ currency: 'USD' }, 5000);
      orderMetrics.serviceClientDuration.observe({ service: 'test', method: 'GET' }, 0.5);
      orderMetrics.orderFulfillmentTime.observe(300);
      
      const metrics = await register.metrics();
      expect(metrics).toContain('order_creation_duration_seconds');
      expect(metrics).toContain('order_amount_cents');
      expect(metrics).toContain('service_client_duration_seconds');
      expect(metrics).toContain('order_fulfillment_time_seconds');
    });

    it('should have all gauge metrics registered', async () => {
      orderMetrics.activeReservations.set(10);
      orderMetrics.expiredOrdersProcessed.set(5);
      orderMetrics.orderConversionRate.set(0.75);
      orderMetrics.refundRate.set(0.05);
      orderMetrics.reservationExpiryRate.set(0.15);
      
      const metrics = await register.metrics();
      expect(metrics).toContain('active_reservations');
      expect(metrics).toContain('expired_orders_processed');
      expect(metrics).toContain('order_conversion_rate');
      expect(metrics).toContain('refund_rate');
      expect(metrics).toContain('reservation_expiry_rate');
    });

    it('should have summary metrics registered', async () => {
      orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 5000);
      
      const metrics = await register.metrics();
      expect(metrics).toContain('avg_order_value_cents');
    });
  });

  describe('Complex Scenarios', () => {
    it('should track order lifecycle', () => {
      // Order created
      orderMetrics.ordersCreated.inc({ status: 'pending' });
      
      // Transition to reserved
      orderMetrics.orderStateTransitions.inc({ from_state: 'pending', to_state: 'reserved' });
      orderMetrics.activeReservations.inc();
      
      // Record duration
      orderMetrics.orderCreationDuration.observe(0.5);
      
      // Transition to confirmed
      orderMetrics.orderStateTransitions.inc({ from_state: 'reserved', to_state: 'confirmed' });
      orderMetrics.activeReservations.dec();
      orderMetrics.ordersCreated.inc({ status: 'confirmed' });
      
      // Record amount
      orderMetrics.orderAmount.observe({ currency: 'USD' }, 10000);
      
      expect(orderMetrics.ordersCreated.get().values.length).toBeGreaterThan(0);
      expect(orderMetrics.orderStateTransitions.get().values.length).toBe(2);
    });

    it('should track service interactions', () => {
      // Call payment service
      const paymentStart = Date.now();
      orderMetrics.serviceClientCalls.inc({ 
        service: 'payment-service', 
        method: 'POST', 
        status: '200' 
      });
      orderMetrics.serviceClientDuration.observe({ 
        service: 'payment-service', 
        method: 'POST' 
      }, (Date.now() - paymentStart) / 1000);
      
      // Call inventory service
      const inventoryStart = Date.now();
      orderMetrics.serviceClientCalls.inc({ 
        service: 'inventory-service', 
        method: 'GET', 
        status: '200' 
      });
      orderMetrics.serviceClientDuration.observe({ 
        service: 'inventory-service', 
        method: 'GET' 
      }, (Date.now() - inventoryStart) / 1000);
      
      expect(orderMetrics.serviceClientCalls.get().values.length).toBe(2);
    });

    it('should track business KPIs', () => {
      // Track average order values
      for (let i = 0; i < 50; i++) {
        orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 5000 + Math.random() * 10000);
      }
      
      // Set conversation rate
      orderMetrics.orderConversionRate.set(0.85);
      
      // Set refund rate
      orderMetrics.refundRate.set(0.03);
      
      // Set expiry rate
      orderMetrics.reservationExpiryRate.set(0.12);
      
      expect(orderMetrics.avgOrderValue.get().values.length).toBeGreaterThan(0);
      expect(orderMetrics.orderConversionRate.get().values[0].value).toBe(0.85);
      expect(orderMetrics.refundRate.get().values[0].value).toBe(0.03);
    });

    it('should handle multiple currencies', () => {
      orderMetrics.orderAmount.observe({ currency: 'USD' }, 10000);
      orderMetrics.orderAmount.observe({ currency: 'EUR' }, 8000);
      orderMetrics.orderAmount.observe({ currency: 'GBP' }, 7500);
      orderMetrics.avgOrderValue.observe({ currency: 'USD' }, 10000);
      orderMetrics.avgOrderValue.observe({ currency: 'EUR' }, 8000);
      
      const amountMetrics = orderMetrics.orderAmount.get();
      const avgMetrics = orderMetrics.avgOrderValue.get();
      
      expect(amountMetrics.values.length).toBeGreaterThan(0);
      expect(avgMetrics.values.length).toBeGreaterThan(0);
    });
  });
});
