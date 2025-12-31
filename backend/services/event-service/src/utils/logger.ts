import pino from 'pino';
import { FastifyRequest, FastifyReply } from 'fastify';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FORMAT = process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
const LOG_SAMPLING_RATE = parseFloat(process.env.LOG_SAMPLING_RATE || '1.0');

/**
 * PII fields to redact from logs.
 * These fields will be replaced with '[REDACTED]' to prevent sensitive data leakage.
 * 
 * CRITICAL FIX for audit findings:
 * - Prevents PII (Personal Identifiable Information) from appearing in logs
 * - Prevents credentials and tokens from being logged
 */
const REDACT_FIELDS = [
  // Direct fields
  'email',
  'password',
  'token',
  'authorization',
  'creditCard',
  'ssn',
  'phone',
  'address',
  'apiKey',
  'secret',
  'refreshToken',
  'accessToken',
  
  // Nested fields (any object containing these)
  '*.email',
  '*.password',
  '*.token',
  '*.authorization',
  '*.creditCard',
  '*.ssn',
  '*.phone',
  '*.address',
  '*.apiKey',
  '*.secret',
  '*.refreshToken',
  '*.accessToken',
  
  // Request header fields
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.headers["x-service-token"]',
  
  // Request body fields (if logged)
  'req.body.password',
  'req.body.email',
  'req.body.token',
  'req.body.creditCard',
  
  // Response fields (if logged)
  'res.headers["set-cookie"]',
];

/**
 * Determine if a request should be logged based on sampling rate.
 * In production, we may sample only a percentage of requests to reduce log volume.
 */
function shouldSampleRequest(): boolean {
  if (LOG_SAMPLING_RATE >= 1.0) return true;
  return Math.random() < LOG_SAMPLING_RATE;
}

// Create base logger with PII redaction
const logger = pino({
  level: LOG_LEVEL,
  transport: LOG_FORMAT === 'pretty' ? {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  base: {
    service: 'event-service'
  },
  // PII redaction - replaces sensitive fields with [REDACTED]
  redact: {
    paths: REDACT_FIELDS,
    censor: '[REDACTED]',
  },
});

/**
 * Request logging context stored on Fastify request.
 */
interface RequestLoggingContext {
  startTime: number;
  requestId: string;
  shouldLog: boolean;
}

/**
 * Fastify onRequest hook - starts timing and assigns request ID.
 * Use this in your app setup: app.addHook('onRequest', requestLoggingHook.onRequest)
 */
export async function onRequestLoggingHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const shouldLog = shouldSampleRequest();
  
  // Store context on request for onResponse hook
  (request as any).loggingContext = {
    startTime: Date.now(),
    requestId: request.id as string,
    shouldLog,
  } as RequestLoggingContext;
  
  // Log request start (debug level)
  if (shouldLog && logger.isLevelEnabled('debug')) {
    logger.debug({
      requestId: request.id,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      contentLength: request.headers['content-length'],
    }, 'Request started');
  }
}

/**
 * Fastify onResponse hook - logs request completion with duration.
 * Use this in your app setup: app.addHook('onResponse', requestLoggingHook.onResponse)
 */
export async function onResponseLoggingHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const context = (request as any).loggingContext as RequestLoggingContext | undefined;
  
  if (!context || !context.shouldLog) return;
  
  const responseTime = Date.now() - context.startTime;
  const statusCode = reply.statusCode;
  
  // Determine log level based on status code
  const logData = {
    requestId: context.requestId,
    method: request.method,
    url: request.url,
    statusCode,
    responseTime,
    responseTimeUnit: 'ms',
    tenantId: (request as any).user?.tenant_id,
    userId: (request as any).user?.id,
  };
  
  // Log errors at error level, 4xx at warn, others at info
  if (statusCode >= 500) {
    logger.error(logData, 'Request completed with server error');
  } else if (statusCode >= 400) {
    logger.warn(logData, 'Request completed with client error');
  } else {
    logger.info(logData, 'Request completed');
  }
}

/**
 * Combined request logging hooks for easy registration.
 * 
 * Usage in app setup:
 * ```typescript
 * import { requestLoggingHooks } from './utils/logger';
 * 
 * app.addHook('onRequest', requestLoggingHooks.onRequest);
 * app.addHook('onResponse', requestLoggingHooks.onResponse);
 * ```
 */
export const requestLoggingHooks = {
  onRequest: onRequestLoggingHook,
  onResponse: onResponseLoggingHook,
};

/**
 * Create a child logger with additional context.
 * Useful for adding request-specific context to all logs within a handler.
 * 
 * @param context - Additional context to include in all logs
 * @returns Child logger with context
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Create a request-scoped logger with request context.
 * 
 * @param request - Fastify request
 * @returns Logger with request context
 */
export function createRequestLogger(request: FastifyRequest) {
  return logger.child({
    requestId: request.id,
    method: request.method,
    url: request.url,
    tenantId: (request as any).user?.tenant_id,
    userId: (request as any).user?.id,
  });
}

/**
 * AUDIT FIX (SEC-DB10): Sanitize event data before logging.
 * Prevents full event objects from being logged, extracting only safe fields.
 * 
 * Use this function whenever logging event data to prevent:
 * - Large objects cluttering logs
 * - Sensitive description content being logged
 * - Internal metadata exposure
 * 
 * @param eventData - Full event data object
 * @returns Sanitized object safe for logging
 */
export function sanitizeEventData(eventData: Record<string, unknown>): Record<string, unknown> {
  // Fields safe to log (non-sensitive, useful for debugging)
  const SAFE_LOG_FIELDS = [
    'id',
    'tenant_id',
    'venue_id',
    'status',
    'visibility',
    'event_type',
    'name', // Event name is generally safe
    'slug',
    'starts_at',
    'ends_at',
    'sales_start_at',
    'sales_end_at',
    'created_at',
    'updated_at',
    'version',
    'is_deleted',
    'priority_score',
    // Counts are safe
    'view_count',
    'interest_count',
    'share_count',
  ];
  
  const sanitized: Record<string, unknown> = {};
  
  for (const field of SAFE_LOG_FIELDS) {
    if (field in eventData && eventData[field] !== undefined) {
      sanitized[field] = eventData[field];
    }
  }
  
  // Add computed fields that are useful
  if (eventData.description) {
    sanitized.description_length = (eventData.description as string).length;
  }
  
  return sanitized;
}

/**
 * AUDIT FIX (SEC-DB10): Sanitize pricing data before logging.
 * 
 * @param pricingData - Full pricing data object
 * @returns Sanitized object safe for logging
 */
export function sanitizePricingData(pricingData: Record<string, unknown>): Record<string, unknown> {
  const SAFE_PRICING_FIELDS = [
    'id',
    'event_id',
    'tenant_id',
    'pricing_type',
    'currency',
    'is_active',
    'created_at',
    'updated_at',
    // We can log prices as they're not PII
    'base_price',
    'min_price',
    'max_price',
    'current_price',
  ];
  
  const sanitized: Record<string, unknown> = {};
  
  for (const field of SAFE_PRICING_FIELDS) {
    if (field in pricingData && pricingData[field] !== undefined) {
      sanitized[field] = pricingData[field];
    }
  }
  
  return sanitized;
}

/**
 * AUDIT FIX (SEC-DB10): Sanitize capacity data before logging.
 * 
 * @param capacityData - Full capacity data object
 * @returns Sanitized object safe for logging
 */
export function sanitizeCapacityData(capacityData: Record<string, unknown>): Record<string, unknown> {
  const SAFE_CAPACITY_FIELDS = [
    'id',
    'event_id',
    'tenant_id',
    'tier_name',
    'tier_type',
    'total_capacity',
    'available_capacity',
    'reserved_capacity',
    'sold_count',
    'is_active',
    'created_at',
    'updated_at',
  ];
  
  const sanitized: Record<string, unknown> = {};
  
  for (const field of SAFE_CAPACITY_FIELDS) {
    if (field in capacityData && capacityData[field] !== undefined) {
      sanitized[field] = capacityData[field];
    }
  }
  
  return sanitized;
}

export { logger };
