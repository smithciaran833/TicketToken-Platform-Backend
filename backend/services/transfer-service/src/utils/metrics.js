const baseMetrics = require('./base-metrics');
const { Counter, Histogram, register } = baseMetrics;

const transfersInitiatedTotal = new Counter({
  name: 'transfers_initiated_total',
  help: 'Total number of transfers initiated',
  registers: [register]
});

const transfersCompletedTotal = new Counter({
  name: 'transfers_completed_total',
  help: 'Total number of transfers completed',
  registers: [register]
});

const transferLatency = new Histogram({
  name: 'transfer_latency_seconds',
  help: 'Transfer operation latency in seconds',
  registers: [register]
});

module.exports = {
  ...baseMetrics,
  transfersInitiatedTotal,
  transfersCompletedTotal,
  transferLatency
};
