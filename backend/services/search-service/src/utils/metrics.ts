import { Counter, Histogram, register } from 'prom-client';

export const searchCounter = new Counter({
  name: 'search_requests_total',
  help: 'Total number of search requests',
  labelNames: ['type', 'status']
});

export const searchDuration = new Histogram({
  name: 'search_duration_seconds',
  help: 'Search request duration in seconds',
  labelNames: ['type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

export const cacheHitRate = new Counter({
  name: 'cache_hits_total',
  help: 'Number of cache hits',
  labelNames: ['type']
});

register.registerMetric(searchCounter);
register.registerMetric(searchDuration);
register.registerMetric(cacheHitRate);

export { register };
