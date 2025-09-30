const baseMetrics = require('./base-metrics');
const { Counter, Histogram, Gauge, register } = baseMetrics;

const blocksProcessedTotal = new Counter({
  name: 'blocks_processed_total',
  help: 'Total number of blocks processed',
  registers: [register]
});

const currentBlockHeight = new Gauge({
  name: 'current_block_height',
  help: 'Current blockchain height being indexed',
  registers: [register]
});

const indexingLatency = new Histogram({
  name: 'indexing_latency_seconds',
  help: 'Block indexing latency',
  registers: [register]
});

module.exports = {
  ...baseMetrics,
  blocksProcessedTotal,
  currentBlockHeight,
  indexingLatency
};
