import { register, Counter, Histogram, Gauge } from 'prom-client';

// Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

export const venueOperations = new Counter({
  name: 'venue_operations_total',
  help: 'Total number of venue operations',
  labelNames: ['operation', 'status']
});

export const activeVenues = new Gauge({
  name: 'active_venues_total',
  help: 'Total number of active venues'
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(venueOperations);
register.registerMetric(activeVenues);

export { register };
