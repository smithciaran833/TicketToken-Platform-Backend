const baseMetrics = require('./base-metrics');
const { Counter, Histogram, Gauge, register } = baseMetrics;

const mintsSucceededTotal = new Counter({
  name: 'mints_succeeded_total',
  help: 'Total number of successful mints',
  registers: [register]
});

const mintsFailedTotal = new Counter({
  name: 'mints_failed_total',
  help: 'Total number of failed mints',
  registers: [register]
});

const mintRetriesTotal = new Counter({
  name: 'mint_retries_total',
  help: 'Total number of mint retry attempts',
  registers: [register]
});

const mintDuration = new Histogram({
  name: 'mint_duration_seconds',
  help: 'Minting operation duration in seconds',
  registers: [register]
});

const mintQueueDepth = new Gauge({
  name: 'mint_queue_depth',
  help: 'Current depth of the minting queue',
  registers: [register]
});

module.exports = {
  ...baseMetrics,
  mintsSucceededTotal,
  mintsFailedTotal,
  mintRetriesTotal,
  mintDuration,
  mintQueueDepth
};
