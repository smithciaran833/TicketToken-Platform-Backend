const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');

// Create a global registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ 
  register,
  prefix: 'tickettoken_'
});

// =========================
// HTTP Metrics
// =========================
const httpRequestDuration = new promClient.Histogram({
  name: 'tickettoken_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['service', 'method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'tickettoken_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['service', 'method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestsInFlight = new promClient.Gauge({
  name: 'tickettoken_http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['service'],
  registers: [register]
});

// =========================
// Database Metrics
// =========================
const dbQueryDuration = new promClient.Histogram({
  name: 'tickettoken_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['service', 'operation', 'table', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});

const dbConnectionPool = new promClient.Gauge({
  name: 'tickettoken_db_connection_pool_size',
  help: 'Database connection pool metrics',
  labelNames: ['service', 'state'], // state: active, idle, waiting
  registers: [register]
});

// =========================
// Cache Metrics
// =========================
const cacheOperations = new promClient.Counter({
  name: 'tickettoken_cache_operations_total',
  help: 'Total cache operations',
  labelNames: ['service', 'operation', 'result'], // operation: get/set, result: hit/miss
  registers: [register]
});

const cacheSize = new promClient.Gauge({
  name: 'tickettoken_cache_size_bytes',
  help: 'Current cache size in bytes',
  labelNames: ['service', 'cache_type'], // cache_type: redis, memory
  registers: [register]
});

// =========================
// Business Metrics
// =========================
const businessEvents = new promClient.Counter({
  name: 'tickettoken_business_events_total',
  help: 'Business events counter',
  labelNames: ['service', 'event_type', 'status'],
  registers: [register]
});

const paymentMetrics = new promClient.Summary({
  name: 'tickettoken_payment_amount',
  help: 'Payment amounts processed',
  labelNames: ['service', 'provider', 'currency', 'status'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register]
});

const ticketOperations = new promClient.Counter({
  name: 'tickettoken_ticket_operations_total',
  help: 'Ticket operations counter',
  labelNames: ['service', 'operation', 'ticket_type', 'status'],
  registers: [register]
});

const queueMetrics = new promClient.Gauge({
  name: 'tickettoken_queue_depth',
  help: 'Message queue depth',
  labelNames: ['service', 'queue_name'],
  registers: [register]
});

// =========================
// Error Metrics
// =========================
const errorCounter = new promClient.Counter({
  name: 'tickettoken_errors_total',
  help: 'Total number of errors',
  labelNames: ['service', 'error_type', 'severity'],
  registers: [register]
});

// =========================
// Middleware Functions
// =========================
function createMetricsMiddleware(serviceName) {
  return function metricsMiddleware(req, res, next) {
    const start = Date.now();
    
    // Track in-flight requests
    httpRequestsInFlight.inc({ service: serviceName });
    
    // Ensure request has an ID for tracing
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    
    // Store service name for other middleware to use
    req.serviceName = serviceName;

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      
      // Record HTTP metrics
      httpRequestDuration.observe(
        { 
          service: serviceName,
          method: req.method, 
          route, 
          status_code: res.statusCode 
        },
        duration
      );
      
      httpRequestsTotal.inc({
        service: serviceName,
        method: req.method,
        route,
        status_code: res.statusCode
      });
      
      // Decrease in-flight requests
      httpRequestsInFlight.dec({ service: serviceName });
      
      // Track errors
      if (res.statusCode >= 400) {
        const severity = res.statusCode >= 500 ? 'critical' : 'warning';
        errorCounter.inc({
          service: serviceName,
          error_type: 'http',
          severity
        });
      }
    });

    next();
  };
}

// Metrics endpoint handler
function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  register.metrics().then(metrics => {
    res.end(metrics);
  }).catch(err => {
    res.status(500).end(err.message);
  });
}

// Helper to track database queries
function trackDatabaseQuery(serviceName, operation, table, success, duration) {
  dbQueryDuration.observe(
    { service: serviceName, operation, table, success: success ? 'true' : 'false' },
    duration
  );
}

// Helper to track cache operations
function trackCacheOperation(serviceName, operation, hit) {
  cacheOperations.inc({
    service: serviceName,
    operation,
    result: hit ? 'hit' : 'miss'
  });
}

// Helper to track business events
function trackBusinessEvent(serviceName, eventType, status) {
  businessEvents.inc({
    service: serviceName,
    event_type: eventType,
    status
  });
}

// Helper to track payment
function trackPayment(serviceName, provider, amount, currency, status) {
  paymentMetrics.observe(
    { service: serviceName, provider, currency, status },
    amount
  );
}

// Helper to track ticket operations
function trackTicketOperation(serviceName, operation, ticketType, status) {
  ticketOperations.inc({
    service: serviceName,
    operation,
    ticket_type: ticketType,
    status
  });
}

// Helper to update queue depth
function updateQueueDepth(serviceName, queueName, depth) {
  queueMetrics.set(
    { service: serviceName, queue_name: queueName },
    depth
  );
}

// Helper to track errors
function trackError(serviceName, errorType, severity = 'error') {
  errorCounter.inc({
    service: serviceName,
    error_type: errorType,
    severity
  });
}

// Export everything
module.exports = {
  register,
  createMetricsMiddleware,
  metricsEndpoint,
  
  // Metric helpers
  trackDatabaseQuery,
  trackCacheOperation,
  trackBusinessEvent,
  trackPayment,
  trackTicketOperation,
  updateQueueDepth,
  trackError,
  
  // Direct access to metrics for custom tracking
  metrics: {
    httpRequestDuration,
    httpRequestsTotal,
    httpRequestsInFlight,
    dbQueryDuration,
    dbConnectionPool,
    cacheOperations,
    cacheSize,
    businessEvents,
    paymentMetrics,
    ticketOperations,
    queueMetrics,
    errorCounter
  }
};
