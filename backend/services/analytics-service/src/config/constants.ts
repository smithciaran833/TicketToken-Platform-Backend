export const CONSTANTS = {
  // Cache TTLs (in seconds)
  CACHE_TTL: {
    REAL_TIME: 5,
    METRICS: 60,
    INSIGHTS: 300,
    CUSTOMER_PROFILE: 3600,
    DASHBOARD: 120,
  },
  
  // Metric types
  METRIC_TYPES: {
    SALES: 'sales',
    REVENUE: 'revenue',
    ATTENDANCE: 'attendance',
    CAPACITY: 'capacity',
    CONVERSION: 'conversion',
    CART_ABANDONMENT: 'cart_abandonment',
  },
  
  // Widget categories
  WIDGET_CATEGORIES: {
    REAL_TIME: 'real-time',
    INSIGHTS: 'insights',
    PREDICTIONS: 'predictions',
    CUSTOM: 'custom',
  },
  
  // Customer segments
  CUSTOMER_SEGMENTS: {
    NEW: 'new',
    RETURNING: 'returning',
    VIP: 'vip',
    AT_RISK: 'at_risk',
    LOST: 'lost',
  },
  
  // Alert priorities
  ALERT_PRIORITIES: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  },
  
  // Export formats
  EXPORT_FORMATS: {
    CSV: 'csv',
    XLSX: 'xlsx',
    PDF: 'pdf',
    JSON: 'json',
  },
  
  // Data retention periods (in days)
  RETENTION_PERIODS: {
    RAW_EVENTS: 30,
    AGGREGATED_METRICS: 365,
    CUSTOMER_PROFILES: 730,
    AUDIT_LOGS: 2555, // 7 years
  },
  
  // Rate limits
  RATE_LIMITS: {
    REAL_TIME: 100, // requests per minute
    EXPORTS: 10, // exports per hour
    MESSAGES: 50, // messages per hour
  },
  
  // Batch sizes
  BATCH_SIZES: {
    EVENT_PROCESSING: 100,
    AGGREGATION: 1000,
    EXPORT: 10000,
  },
  
  // Queue priorities
  QUEUE_PRIORITIES: {
    HIGH: 1,
    MEDIUM: 5,
    LOW: 10,
  },
};
