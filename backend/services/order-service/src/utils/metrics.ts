import client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics for order service
export const orderMetrics = {
  // Counter: Total orders created
  ordersCreated: new client.Counter({
    name: 'orders_created_total',
    help: 'Total number of orders created',
    labelNames: ['status'],
    registers: [register],
  }),

  // Counter: Order state transitions
  orderStateTransitions: new client.Counter({
    name: 'order_state_transitions_total',
    help: 'Total number of order state transitions',
    labelNames: ['from_state', 'to_state'],
    registers: [register],
  }),

  // Histogram: Order creation duration
  orderCreationDuration: new client.Histogram({
    name: 'order_creation_duration_seconds',
    help: 'Duration of order creation in seconds',
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  // Gauge: Active reservations
  activeReservations: new client.Gauge({
    name: 'active_reservations',
    help: 'Number of currently active order reservations',
    registers: [register],
  }),

  // Counter: Order cancellations
  ordersCancelled: new client.Counter({
    name: 'orders_cancelled_total',
    help: 'Total number of orders cancelled',
    labelNames: ['reason'],
    registers: [register],
  }),

  // Counter: Order refunds
  ordersRefunded: new client.Counter({
    name: 'orders_refunded_total',
    help: 'Total number of orders refunded',
    registers: [register],
  }),

  // Histogram: Order total amount
  orderAmount: new client.Histogram({
    name: 'order_amount_cents',
    help: 'Order total amount in cents',
    buckets: [1000, 5000, 10000, 50000, 100000, 500000],
    labelNames: ['currency'],
    registers: [register],
  }),

  // Counter: Service client calls
  serviceClientCalls: new client.Counter({
    name: 'service_client_calls_total',
    help: 'Total number of calls to external services',
    labelNames: ['service', 'method', 'status'],
    registers: [register],
  }),

  // Histogram: Service client call duration
  serviceClientDuration: new client.Histogram({
    name: 'service_client_duration_seconds',
    help: 'Duration of service client calls in seconds',
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    labelNames: ['service', 'method'],
    registers: [register],
  }),

  // Counter: Background job executions
  jobExecutions: new client.Counter({
    name: 'job_executions_total',
    help: 'Total number of background job executions',
    labelNames: ['job_name', 'status'],
    registers: [register],
  }),

  // Gauge: Expired orders processed
  expiredOrdersProcessed: new client.Gauge({
    name: 'expired_orders_processed',
    help: 'Number of expired orders processed in last run',
    registers: [register],
  }),

  // ===== BUSINESS KPIs =====

  // Summary: Average order value (for calculating mean, percentiles)
  avgOrderValue: new client.Summary({
    name: 'avg_order_value_cents',
    help: 'Average order value in cents (business KPI)',
    percentiles: [0.5, 0.9, 0.95, 0.99],
    labelNames: ['currency'],
    registers: [register],
  }),

  // Gauge: Order conversion rate (reservations → confirmed)
  orderConversionRate: new client.Gauge({
    name: 'order_conversion_rate',
    help: 'Percentage of reservations that convert to confirmed orders (business KPI)',
    registers: [register],
  }),

  // Histogram: Order fulfillment time (creation → fulfillment)
  orderFulfillmentTime: new client.Histogram({
    name: 'order_fulfillment_time_seconds',
    help: 'Time from order creation to fulfillment in seconds (business KPI)',
    buckets: [60, 300, 600, 1800, 3600, 7200], // 1min, 5min, 10min, 30min, 1hr, 2hr
    registers: [register],
  }),

  // Gauge: Refund rate
  refundRate: new client.Gauge({
    name: 'refund_rate',
    help: 'Percentage of confirmed orders that get refunded (business KPI)',
    registers: [register],
  }),

  // Gauge: Reservation expiry rate
  reservationExpiryRate: new client.Gauge({
    name: 'reservation_expiry_rate',
    help: 'Percentage of reservations that expire without confirmation (business KPI)',
    registers: [register],
  }),

  // ===== CACHE METRICS =====

  // Counter: Cache hits
  cacheHits: new client.Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_key_pattern'],
    registers: [register],
  }),

  // Counter: Cache misses
  cacheMisses: new client.Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_key_pattern'],
    registers: [register],
  }),

  // Gauge: Cache hit rate
  cacheHitRate: new client.Gauge({
    name: 'cache_hit_rate',
    help: 'Cache hit rate percentage',
    registers: [register],
  }),

  // Histogram: Cache operation duration
  cacheOperationDuration: new client.Histogram({
    name: 'cache_operation_duration_seconds',
    help: 'Duration of cache operations in seconds',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
    labelNames: ['operation', 'cache_key_pattern'],
    registers: [register],
  }),

  // Counter: Cache sets
  cacheSets: new client.Counter({
    name: 'cache_sets_total',
    help: 'Total number of cache set operations',
    labelNames: ['cache_key_pattern'],
    registers: [register],
  }),

  // Counter: Cache deletes
  cacheDeletes: new client.Counter({
    name: 'cache_deletes_total',
    help: 'Total number of cache delete operations',
    labelNames: ['cache_key_pattern'],
    registers: [register],
  }),

  // Counter: Cache errors
  cacheErrors: new client.Counter({
    name: 'cache_errors_total',
    help: 'Total number of cache operation errors',
    labelNames: ['operation', 'cache_key_pattern'],
    registers: [register],
  }),

  // Gauge: Cache size
  cacheSize: new client.Gauge({
    name: 'cache_size_bytes',
    help: 'Estimated cache size in bytes',
    registers: [register],
  }),
};
