/**
 * Order Service Configuration
 * Centralized configuration for business rules, fees, and limits
 */

export const orderConfig = {
  // === FEE CONFIGURATION ===
  fees: {
    // Platform fee (5% of subtotal)
    platformFeePercentage: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '5'),
    
    // Processing fee (Stripe-like: 2.9% + $0.30)
    processingFeePercentage: parseFloat(process.env.PROCESSING_FEE_PERCENTAGE || '2.9'),
    processingFeeFixedCents: parseInt(process.env.PROCESSING_FEE_FIXED_CENTS || '30', 10),
    
    // Tax rate (8% default)
    defaultTaxRate: parseFloat(process.env.DEFAULT_TAX_RATE || '8'),
  },

  // === RESERVATION CONFIGURATION ===
  reservation: {
    // Default reservation duration in minutes
    durationMinutes: parseInt(process.env.RESERVATION_DURATION_MINUTES || '15', 10),
    
    // Extended reservation for VIP/premium events
    vipDurationMinutes: parseInt(process.env.VIP_RESERVATION_DURATION_MINUTES || '30', 10),
    
    // Grace period before hard expiration
    gracePeriodMinutes: parseInt(process.env.RESERVATION_GRACE_PERIOD_MINUTES || '2', 10),
  },

  // === ORDER LIMITS ===
  limits: {
    // Maximum order value in cents ($100,000)
    maxOrderValueCents: parseInt(process.env.MAX_ORDER_VALUE_CENTS || '10000000', 10),
    
    // Minimum order value in cents ($1)
    minOrderValueCents: parseInt(process.env.MIN_ORDER_VALUE_CENTS || '100', 10),
    
    // Maximum items per order
    maxItemsPerOrder: parseInt(process.env.MAX_ITEMS_PER_ORDER || '50', 10),
    
    // Maximum quantity per item
    maxQuantityPerItem: parseInt(process.env.MAX_QUANTITY_PER_ITEM || '10', 10),
    
    // Maximum orders per user per day
    maxOrdersPerUserPerDay: parseInt(process.env.MAX_ORDERS_PER_USER_PER_DAY || '20', 10),
    
    // Maximum orders per user per event
    maxOrdersPerUserPerEvent: parseInt(process.env.MAX_ORDERS_PER_USER_PER_EVENT || '5', 10),
  },

  // === REFUND CONFIGURATION ===
  refunds: {
    // Allow refunds up to X hours before event
    cutoffHours: parseInt(process.env.REFUND_CUTOFF_HOURS || '24', 10),
    
    // Refund processing fee (retain X% of refund)
    processingFeeRetentionPercentage: parseFloat(process.env.REFUND_PROCESSING_FEE_RETENTION || '2.5'),
    
    // Auto-approve refunds below this amount (in cents)
    autoApproveThresholdCents: parseInt(process.env.REFUND_AUTO_APPROVE_THRESHOLD_CENTS || '50000', 10),
  },

  // === CURRENCY CONFIGURATION ===
  currency: {
    default: process.env.DEFAULT_CURRENCY || 'USD',
    supported: (process.env.SUPPORTED_CURRENCIES || 'USD,EUR,GBP').split(','),
  },

  // === PAGINATION ===
  pagination: {
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_LIMIT || '50', 10),
    maxLimit: parseInt(process.env.MAX_PAGE_LIMIT || '100', 10),
  },

  // === BACKGROUND JOBS ===
  jobs: {
    // Check for expired reservations every X minutes
    expirationCheckIntervalMinutes: parseInt(process.env.EXPIRATION_CHECK_INTERVAL_MINUTES || '1', 10),
    
    // Metrics aggregation interval
    metricsAggregationIntervalMinutes: parseInt(process.env.METRICS_AGGREGATION_INTERVAL_MINUTES || '5', 10),
  },

  // === ARCHIVING CONFIGURATION ===
  archiving: {
    // Enable/disable archiving
    enabled: process.env.ARCHIVING_ENABLED === 'true',
    
    // Archive orders older than X days (default 90 days)
    retentionDays: parseInt(process.env.ARCHIVING_RETENTION_DAYS || '90', 10),
    
    // Process orders in batches to avoid memory issues
    batchSize: parseInt(process.env.ARCHIVING_BATCH_SIZE || '1000', 10),
    
    // Maximum orders to archive per run (safety limit)
    maxOrdersPerRun: parseInt(process.env.ARCHIVING_MAX_ORDERS_PER_RUN || '10000', 10),
    
    // Archive orders in these statuses (completed lifecycle)
    archivableStatuses: (process.env.ARCHIVING_STATUSES || 'COMPLETED,CANCELLED,EXPIRED,REFUNDED').split(','),
    
    // Run archiving job daily at 3:00 AM by default
    schedule: process.env.ARCHIVING_SCHEDULE || '0 3 * * *',
    
    // Delete archived orders from main tables after X days (0 = keep forever)
    deleteAfterDays: parseInt(process.env.ARCHIVING_DELETE_AFTER_DAYS || '0', 10),
    
    // Dry run mode - log what would be archived without actually doing it
    dryRun: process.env.ARCHIVING_DRY_RUN === 'true',
  },

  // === DISTRIBUTED LOCK ===
  distributedLock: {
    // Lock TTL in seconds
    ttlSeconds: parseInt(process.env.DISTRIBUTED_LOCK_TTL_SECONDS || '30', 10),
    
    // Lock retry attempts
    retryAttempts: parseInt(process.env.DISTRIBUTED_LOCK_RETRY_ATTEMPTS || '3', 10),
    
    // Retry delay in milliseconds
    retryDelayMs: parseInt(process.env.DISTRIBUTED_LOCK_RETRY_DELAY_MS || '100', 10),
  },

  // === RATE LIMITING ===
  rateLimit: {
    // Order creation: requests per minute
    createOrderPerMinute: parseInt(process.env.RATE_LIMIT_CREATE_ORDER_PER_MINUTE || '10', 10),
    
    // Order reservation: requests per minute
    reserveOrderPerMinute: parseInt(process.env.RATE_LIMIT_RESERVE_ORDER_PER_MINUTE || '20', 10),
  },
};

/**
 * Validate configuration on startup
 */
export function validateOrderConfig(): void {
  const errors: string[] = [];

  // Validate fees
  if (orderConfig.fees.platformFeePercentage < 0 || orderConfig.fees.platformFeePercentage > 100) {
    errors.push('Platform fee percentage must be between 0 and 100');
  }

  if (orderConfig.fees.processingFeePercentage < 0 || orderConfig.fees.processingFeePercentage > 100) {
    errors.push('Processing fee percentage must be between 0 and 100');
  }

  if (orderConfig.fees.defaultTaxRate < 0 || orderConfig.fees.defaultTaxRate > 100) {
    errors.push('Tax rate must be between 0 and 100');
  }

  // Validate limits
  if (orderConfig.limits.maxOrderValueCents <= orderConfig.limits.minOrderValueCents) {
    errors.push('Max order value must be greater than min order value');
  }

  if (orderConfig.limits.maxItemsPerOrder < 1) {
    errors.push('Max items per order must be at least 1');
  }

  // Validate reservation
  if (orderConfig.reservation.durationMinutes < 1) {
    errors.push('Reservation duration must be at least 1 minute');
  }

  if (errors.length > 0) {
    throw new Error(`Order configuration validation failed:\n${errors.join('\n')}`);
  }
}
