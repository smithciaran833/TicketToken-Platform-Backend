import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics
collectDefaultMetrics({ register });

// Custom metrics for payment service
export const paymentTotal = new Counter({
  name: 'payment_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['status', 'method'],
  registers: [register]
});

export const paymentAmount = new Histogram({
  name: 'payment_amount_dollars',
  help: 'Payment amounts in dollars',
  buckets: [10, 50, 100, 500, 1000, 5000],
  registers: [register]
});

export const refundTotal = new Counter({
  name: 'payment_refunds_total',
  help: 'Total number of refunds processed',
  labelNames: ['status'],
  registers: [register]
});

export const paymentDuration = new Histogram({
  name: 'payment_processing_duration_seconds',
  help: 'Payment processing duration in seconds',
  labelNames: ['method'],
  registers: [register]
});

export const activeTransactions = new Gauge({
  name: 'payment_active_transactions',
  help: 'Number of active transactions',
  registers: [register]
});
