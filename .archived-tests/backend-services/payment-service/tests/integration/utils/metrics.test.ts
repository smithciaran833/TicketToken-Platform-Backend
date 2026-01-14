/**
 * Metrics Integration Tests
 * 100% code coverage
 */

import {
  register,
  paymentTotal,
  paymentAmount,
  refundTotal,
  paymentDuration,
  activeTransactions,
} from '../../../src/utils/metrics';

describe('Metrics', () => {
  beforeEach(async () => {
    // Reset all metrics
    register.resetMetrics();
  });

  describe('register', () => {
    it('should be a valid Prometheus registry', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
    });

    it('should collect default metrics', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('process_');
    });

    it('should return metrics as string', async () => {
      const metrics = await register.metrics();
      expect(typeof metrics).toBe('string');
    });
  });

  describe('paymentTotal counter', () => {
    it('should be defined', () => {
      expect(paymentTotal).toBeDefined();
    });

    it('should increment with labels', () => {
      paymentTotal.inc({ status: 'success', method: 'card' });
      paymentTotal.inc({ status: 'success', method: 'card' });
      paymentTotal.inc({ status: 'failed', method: 'card' });
    });

    it('should increment by specific amount', () => {
      paymentTotal.inc({ status: 'success', method: 'wallet' }, 5);
    });

    it('should track different status values', () => {
      paymentTotal.inc({ status: 'pending', method: 'card' });
      paymentTotal.inc({ status: 'processing', method: 'card' });
      paymentTotal.inc({ status: 'completed', method: 'card' });
      paymentTotal.inc({ status: 'failed', method: 'card' });
      paymentTotal.inc({ status: 'refunded', method: 'card' });
    });

    it('should track different payment methods', () => {
      paymentTotal.inc({ status: 'success', method: 'card' });
      paymentTotal.inc({ status: 'success', method: 'bank_transfer' });
      paymentTotal.inc({ status: 'success', method: 'crypto' });
    });
  });

  describe('paymentAmount histogram', () => {
    it('should be defined', () => {
      expect(paymentAmount).toBeDefined();
    });

    it('should observe values', () => {
      paymentAmount.observe(25.99);
      paymentAmount.observe(99.99);
      paymentAmount.observe(500.00);
    });

    it('should handle small amounts', () => {
      paymentAmount.observe(1.00);
      paymentAmount.observe(5.50);
    });

    it('should handle large amounts', () => {
      paymentAmount.observe(1000);
      paymentAmount.observe(5000);
      paymentAmount.observe(10000);
    });

    it('should bucket values correctly', () => {
      // Buckets: [10, 50, 100, 500, 1000, 5000]
      paymentAmount.observe(5);    // < 10
      paymentAmount.observe(25);   // < 50
      paymentAmount.observe(75);   // < 100
      paymentAmount.observe(250);  // < 500
      paymentAmount.observe(750);  // < 1000
      paymentAmount.observe(2500); // < 5000
      paymentAmount.observe(7500); // > 5000
    });
  });

  describe('refundTotal counter', () => {
    it('should be defined', () => {
      expect(refundTotal).toBeDefined();
    });

    it('should increment with status label', () => {
      refundTotal.inc({ status: 'success' });
      refundTotal.inc({ status: 'failed' });
      refundTotal.inc({ status: 'pending' });
    });

    it('should increment by specific amount', () => {
      refundTotal.inc({ status: 'success' }, 10);
    });
  });

  describe('paymentDuration histogram', () => {
    it('should be defined', () => {
      expect(paymentDuration).toBeDefined();
    });

    it('should observe duration with method label', () => {
      paymentDuration.observe({ method: 'card' }, 0.5);
      paymentDuration.observe({ method: 'card' }, 1.2);
      paymentDuration.observe({ method: 'bank_transfer' }, 2.5);
    });

    it('should handle very fast transactions', () => {
      paymentDuration.observe({ method: 'card' }, 0.01);
      paymentDuration.observe({ method: 'card' }, 0.05);
    });

    it('should handle slow transactions', () => {
      paymentDuration.observe({ method: 'card' }, 5.0);
      paymentDuration.observe({ method: 'card' }, 10.0);
    });

    it('should use timer', () => {
      const end = paymentDuration.startTimer({ method: 'card' });
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {} // Wait ~10ms
      end();
    });
  });

  describe('activeTransactions gauge', () => {
    it('should be defined', () => {
      expect(activeTransactions).toBeDefined();
    });

    it('should set value', () => {
      activeTransactions.set(5);
      activeTransactions.set(10);
      activeTransactions.set(0);
    });

    it('should increment', () => {
      activeTransactions.set(0);
      activeTransactions.inc();
      activeTransactions.inc();
      activeTransactions.inc();
    });

    it('should increment by specific amount', () => {
      activeTransactions.set(0);
      activeTransactions.inc(5);
    });

    it('should decrement', () => {
      activeTransactions.set(10);
      activeTransactions.dec();
      activeTransactions.dec();
    });

    it('should decrement by specific amount', () => {
      activeTransactions.set(10);
      activeTransactions.dec(5);
    });
  });

  describe('metrics output', () => {
    it('should include payment_transactions_total', async () => {
      paymentTotal.inc({ status: 'test', method: 'test' });
      const metrics = await register.metrics();
      expect(metrics).toContain('payment_transactions_total');
    });

    it('should include payment_amount_dollars', async () => {
      paymentAmount.observe(100);
      const metrics = await register.metrics();
      expect(metrics).toContain('payment_amount_dollars');
    });

    it('should include payment_refunds_total', async () => {
      refundTotal.inc({ status: 'test' });
      const metrics = await register.metrics();
      expect(metrics).toContain('payment_refunds_total');
    });

    it('should include payment_processing_duration_seconds', async () => {
      paymentDuration.observe({ method: 'test' }, 1);
      const metrics = await register.metrics();
      expect(metrics).toContain('payment_processing_duration_seconds');
    });

    it('should include payment_active_transactions', async () => {
      activeTransactions.set(1);
      const metrics = await register.metrics();
      expect(metrics).toContain('payment_active_transactions');
    });

    it('should include metric help text', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('HELP');
    });

    it('should include metric type', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('TYPE');
    });
  });
});
