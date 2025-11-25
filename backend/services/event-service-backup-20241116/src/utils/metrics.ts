import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics (CPU, memory, GC, etc.)
collectDefaultMetrics({ register });

// Custom metrics for event service

// Event operations
export const eventCreatedTotal = new Counter({
  name: 'event_created_total',
  help: 'Total number of events created',
  labelNames: ['status', 'event_type'],
  registers: [register]
});

export const eventUpdatedTotal = new Counter({
  name: 'event_updated_total',
  help: 'Total number of events updated',
  labelNames: ['status'],
  registers: [register]
});

export const eventPublishedTotal = new Counter({
  name: 'event_published_total',
  help: 'Total number of events published',
  labelNames: ['status'],
  registers: [register]
});

export const eventDeletedTotal = new Counter({
  name: 'event_deleted_total',
  help: 'Total number of events deleted',
  labelNames: ['status'],
  registers: [register]
});

// Capacity operations
export const capacityReservedTotal = new Counter({
  name: 'capacity_reserved_total',
  help: 'Total capacity reservations',
  labelNames: ['status'],
  registers: [register]
});

export const capacityCheckedTotal = new Counter({
  name: 'capacity_checked_total',
  help: 'Total capacity availability checks',
  labelNames: ['available'],
  registers: [register]
});

export const capacityAvailable = new Gauge({
  name: 'capacity_available',
  help: 'Current available capacity',
  labelNames: ['event_id', 'section_name'],
  registers: [register]
});

// Pricing operations
export const pricingCreatedTotal = new Counter({
  name: 'pricing_created_total',
  help: 'Total pricing tiers created',
  labelNames: ['status'],
  registers: [register]
});

export const pricingCalculatedTotal = new Counter({
  name: 'pricing_calculated_total',
  help: 'Total price calculations',
  registers: [register]
});

export const priceLockCreatedTotal = new Counter({
  name: 'price_lock_created_total',
  help: 'Total price locks created',
  registers: [register]
});

// Schedule operations
export const scheduleCreatedTotal = new Counter({
  name: 'schedule_created_total',
  help: 'Total schedules created',
  labelNames: ['status'],
  registers: [register]
});

export const scheduleUpdatedTotal = new Counter({
  name: 'schedule_updated_total',
  help: 'Total schedules updated',
  labelNames: ['status'],
  registers: [register]
});

// Performance metrics
export const eventOperationDuration = new Histogram({
  name: 'event_operation_duration_seconds',
  help: 'Duration of event operations in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const capacityOperationDuration = new Histogram({
  name: 'capacity_operation_duration_seconds',
  help: 'Duration of capacity operations in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

// HTTP request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Reservation cleanup job metrics
export const reservationCleanupRunsTotal = new Counter({
  name: 'reservation_cleanup_runs_total',
  help: 'Total reservation cleanup job runs',
  labelNames: ['status'],
  registers: [register]
});

export const reservationsExpiredTotal = new Counter({
  name: 'reservations_expired_total',
  help: 'Total expired reservations cleaned up',
  registers: [register]
});

export const reservationCleanupDuration = new Histogram({
  name: 'reservation_cleanup_duration_seconds',
  help: 'Duration of reservation cleanup in seconds',
  buckets: [0.1, 0.5, 1, 5, 10, 30],
  registers: [register]
});
