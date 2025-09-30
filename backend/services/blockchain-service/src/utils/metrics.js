const baseMetrics = require('./base-metrics');
const { Counter, Histogram, register } = baseMetrics;

const chainEventsProcessedTotal = new Counter({
  name: 'chain_events_processed_total',
  help: 'Total number of blockchain events processed',
  labelNames: ['program'],
  registers: [register]
});

const chainReorgsDetectedTotal = new Counter({
  name: 'chain_reorgs_detected_total',
  help: 'Total number of chain reorganizations detected',
  registers: [register]
});

const chainEventProcessingLatency = new Histogram({
  name: 'chain_event_processing_latency_seconds',
  help: 'Blockchain event processing latency in seconds',
  registers: [register]
});

module.exports = {
  ...baseMetrics,
  chainEventsProcessedTotal,
  chainReorgsDetectedTotal,
  chainEventProcessingLatency
};
