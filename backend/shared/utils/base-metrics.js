const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, heap, event loop, etc.)
client.collectDefaultMetrics({ register });

// Common HTTP metrics for all services
const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register]
});

module.exports = {
  register,
  httpRequestTotal,
  httpRequestDuration,
  Counter: client.Counter,
  Histogram: client.Histogram,
  Gauge: client.Gauge
};
