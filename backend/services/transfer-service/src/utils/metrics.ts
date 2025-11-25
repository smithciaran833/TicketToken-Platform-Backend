import { Counter, Histogram, Gauge, register } from './base-metrics';

export const transfersInitiatedTotal = new Counter({
  name: 'transfers_initiated_total',
  help: 'Total number of transfers initiated',
  registers: [register]
});

export const transfersCompletedTotal = new Counter({
  name: 'transfers_completed_total',
  help: 'Total number of transfers completed',
  registers: [register]
});

export const transferLatency = new Histogram({
  name: 'transfer_latency_seconds',
  help: 'Transfer operation latency in seconds',
  registers: [register]
});

export { Counter, Histogram, Gauge, register };
