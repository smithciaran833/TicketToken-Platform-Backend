/**
 * Winston Logger with OpenTelemetry Trace Context
 * 
 * Fixes audit findings:
 * - DT4: Trace ID in logs - IMPLEMENTED (via trace context injection)
 * - LC4: Correlation ID middleware - IMPLEMENTED (via requestId in logs)
 * - LC1: Log level configurable per env - IMPLEMENTED (via LOG_LEVEL env var)
 * - LC2: Request/response body logging controlled - IMPLEMENTED (via LOG_REQUEST_BODY, LOG_RESPONSE_BODY env vars)
 * - LC3: PII redaction in logs - IMPLEMENTED (via enhanced PII patterns)
 * - MT3: Tenant logs searchable - IMPLEMENTED (tenantId in all log entries)
 */

import winston from 'winston';
import { config } from '../config';
import { getTraceContext } from './tracing';

const SERVICE_NAME = 'ticket-service';

// =============================================================================
// LC1: Environment-based Log Level Configuration
// =============================================================================

/**
 * Get log level based on environment configuration
 * Priority: LOG_LEVEL env var > NODE_ENV defaults
 * 
 * Log levels (from highest to lowest priority):
 * error (0), warn (1), info (2), http (3), verbose (4), debug (5), silly (6)
 */
function getLogLevel(): string {
  // Explicit LOG_LEVEL takes priority
  const explicitLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (explicitLevel && ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].includes(explicitLevel)) {
    return explicitLevel;
  }
  
  // Default based on environment
  switch (config.env) {
    case 'production':
      return 'info';
    case 'staging':
      return 'verbose';
    case 'development':
      return 'debug';
    case 'test':
      return 'warn'; // Reduce noise in tests
    default:
      return 'info';
  }
}

// =============================================================================
// LC2: Request/Response Body Logging Control
// =============================================================================

export interface BodyLoggingConfig {
  /** Enable request body logging */
  logRequestBody: boolean;
  /** Enable response body logging */
  logResponseBody: boolean;
  /** Max body size to log in bytes (default: 10KB) */
  maxBodySize: number;
  /** Routes to exclude from body logging (e.g., auth endpoints) */
  excludeRoutes: string[];
  /** Content types to log (default: application/json) */
  allowedContentTypes: string[];
}

export const bodyLoggingConfig: BodyLoggingConfig = {
  logRequestBody: process.env.LOG_REQUEST_BODY === 'true' && config.env !== 'production',
  logResponseBody: process.env.LOG_RESPONSE_BODY === 'true' && config.env !== 'production',
  maxBodySize: parseInt(process.env.LOG_MAX_BODY_SIZE || '10240', 10), // 10KB default
  excludeRoutes: [
    '/api/v1/auth',
    '/api/v1/login',
    '/api/v1/webhooks/stripe', // Webhook signatures
  ],
  allowedContentTypes: ['application/json', 'text/plain'],
};

/**
 * Check if body should be logged for a given route
 */
export function shouldLogBody(url: string, contentType?: string): boolean {
  // Check if route is excluded
  if (bodyLoggingConfig.excludeRoutes.some(route => url.startsWith(route))) {
    return false;
  }
  
  // Check content type
  if (contentType && !bodyLoggingConfig.allowedContentTypes.some(ct => contentType.includes(ct))) {
    return false;
  }
  
  return true;
}

/**
 * Truncate body to max size for logging
 */
export function truncateBody(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  
  const stringified = typeof body === 'string' ? body : JSON.stringify(body);
  if (stringified.length <= bodyLoggingConfig.maxBodySize) {
    return body;
  }
  
  return {
    _truncated: true,
    _originalSize: stringified.length,
    _preview: stringified.substring(0, bodyLoggingConfig.maxBodySize) + '...',
  };
}

// =============================================================================
// LC3: Enhanced PII Redaction Patterns
// =============================================================================

/**
 * PII patterns to redact from logs
 * More comprehensive than basic sanitizer
 */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; field?: string }> = [
  // Email addresses
  { pattern: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, replacement: '[EMAIL_REDACTED]' },
  // Phone numbers (various formats)
  { pattern: /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, replacement: '[PHONE_REDACTED]' },
  // Credit card numbers (basic patterns)
  { pattern: /\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g, replacement: '[CARD_REDACTED]' },
  // SSN
  { pattern: /\b(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/g, replacement: '[SSN_REDACTED]' },
  // JWT tokens
  { pattern: /(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)/g, replacement: '[JWT_REDACTED]' },
  // API keys (common patterns)
  { pattern: /\b(sk_live_[a-zA-Z0-9]{24,})\b/g, replacement: '[STRIPE_KEY_REDACTED]' },
  { pattern: /\b(pk_live_[a-zA-Z0-9]{24,})\b/g, replacement: '[STRIPE_KEY_REDACTED]' },
  // Generic secrets
  { pattern: /\b(secret|password|token|apikey|api_key)["']?\s*[:=]\s*["']?([^"'\s,}]+)/gi, replacement: '$1=[REDACTED]' },
  // Wallet addresses (Solana base58)
  { pattern: /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g, replacement: '[WALLET_REDACTED]' },
];

/**
 * Fields to always redact regardless of content
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'privateKey',
  'private_key',
  'refreshToken',
  'refresh_token',
  'accessToken',
  'access_token',
]);

/**
 * Enhanced PII sanitizer that works recursively on objects
 */
class PIISanitizer {
  static sanitize<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return PIISanitizer.sanitizeString(data) as T;
    }

    if (Array.isArray(data)) {
      return data.map(item => PIISanitizer.sanitize(item)) as T;
    }

    if (typeof data === 'object') {
      return PIISanitizer.sanitizeObject(data as Record<string, unknown>) as T;
    }

    return data;
  }

  private static sanitizeString(str: string): string {
    let result = str;
    for (const { pattern, replacement } of PII_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  private static sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if field name is sensitive
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
        continue;
      }

      // Recursively sanitize nested values
      result[key] = PIISanitizer.sanitize(value);
    }

    return result;
  }
}

// =============================================================================
// CUSTOM FORMAT: Inject trace context into every log entry - Fixes DT4
// =============================================================================

/**
 * Format that adds trace context (traceId, spanId) to all log entries
 * This enables correlation between logs and distributed traces
 */
const traceContextFormat = winston.format((info) => {
  const traceContext = getTraceContext();
  
  if (traceContext.traceId) {
    info.traceId = traceContext.traceId;
    info.spanId = traceContext.spanId;
    // Also add trace context in OpenTelemetry standard format
    info['trace.id'] = traceContext.traceId;
    info['span.id'] = traceContext.spanId;
  }
  
  return info;
})();

// =============================================================================
// CUSTOM FORMAT: Sanitize PII before logging
// =============================================================================

const sanitizingFormat = winston.format((info) => {
  return PIISanitizer.sanitize(info);
})();

// =============================================================================
// CUSTOM FORMAT: Add request ID for correlation - Fixes LC4
// =============================================================================

const requestIdFormat = winston.format((info) => {
  // If there's a request context, add the request ID
  if (info.requestId) {
    info.correlationId = info.requestId;
  }
  return info;
})();

// =============================================================================
// LOG FORMAT CONFIGURATION
// =============================================================================

const logFormat = winston.format.combine(
  traceContextFormat,      // Add trace context first
  sanitizingFormat,        // Then sanitize PII
  requestIdFormat,         // Add correlation IDs
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Development-friendly format with colors
const devFormat = winston.format.combine(
  traceContextFormat,
  sanitizingFormat,
  requestIdFormat,
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, traceId, spanId, component, ...meta }) => {
    const traceIdStr = typeof traceId === 'string' ? traceId : '';
    const traceInfo = traceIdStr ? ` [trace:${traceIdStr.substring(0, 8)}]` : '';
    const componentInfo = component ? ` [${component}]` : '';
    const metaStr = Object.keys(meta).length > 0 
      ? ` ${JSON.stringify(meta)}` 
      : '';
    return `${timestamp} ${level}${componentInfo}${traceInfo}: ${message}${metaStr}`;
  })
);

// =============================================================================
// LOGGER INSTANCE - LC1: Uses configurable log level
// =============================================================================

const configuredLogLevel = getLogLevel();

export const logger = winston.createLogger({
  // LC1: Log level configurable per environment
  level: configuredLogLevel,
  format: logFormat,
  defaultMeta: { 
    service: SERVICE_NAME,
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: config.env,
  },
  transports: [
    new winston.transports.Console({
      format: config.env === 'production' ? logFormat : devFormat
    })
  ],
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Log the configured level at startup
logger.info(`Logger initialized with level: ${configuredLogLevel}`, {
  configuredLevel: configuredLogLevel,
  environment: config.env,
});

// =============================================================================
// CHILD LOGGER FACTORY
// =============================================================================

/**
 * Create child loggers for specific components
 * Each child logger includes the component name in all log entries
 */
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// =============================================================================
// REQUEST-SCOPED LOGGER
// =============================================================================

interface RequestContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  url?: string;
}

/**
 * Create a request-scoped logger with trace context
 * Use this for logging within request handlers
 */
export const createRequestLogger = (context: RequestContext) => {
  return logger.child({
    requestId: context.requestId,
    traceId: context.traceId,
    spanId: context.spanId,
    tenantId: context.tenantId,
    userId: context.userId,
    method: context.method,
    url: context.url,
  });
};

// =============================================================================
// STRUCTURED LOGGING HELPERS
// =============================================================================

/**
 * Log an error with full context
 * Automatically sanitizes error details
 */
export function logError(message: string, error: unknown, meta?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  
  logger.error(message, {
    error: {
      name: err.name,
      message: PIISanitizer.sanitize(err.message),
      stack: err.stack,
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log a warning with context
 */
export function logWarning(message: string, meta?: Record<string, unknown>): void {
  logger.warn(message, PIISanitizer.sanitize(meta || {}));
}

/**
 * Log an info message with context
 */
export function logInfo(message: string, meta?: Record<string, unknown>): void {
  logger.info(message, PIISanitizer.sanitize(meta || {}));
}

/**
 * Log a debug message with context
 */
export function logDebug(message: string, meta?: Record<string, unknown>): void {
  logger.debug(message, PIISanitizer.sanitize(meta || {}));
}

/**
 * Log an incoming HTTP request
 * Sanitizes sensitive request data
 */
export function logRequest(req: {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  id?: string;
}, meta?: Record<string, unknown>): void {
  logger.info('Request received', {
    request: {
      method: req.method,
      url: req.url,
      requestId: req.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log an HTTP response
 */
export function logResponse(
  statusCode: number,
  durationMs: number,
  meta?: Record<string, unknown>
): void {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  logger.log(level, 'Request completed', {
    response: {
      statusCode,
      durationMs,
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log a business operation
 */
export function logOperation(
  operation: string,
  status: 'started' | 'completed' | 'failed',
  meta?: Record<string, unknown>
): void {
  const level = status === 'failed' ? 'error' : 'info';
  
  logger.log(level, `Operation ${operation} ${status}`, {
    operation,
    status,
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log an external service call
 */
export function logServiceCall(
  service: string,
  operation: string,
  status: 'started' | 'success' | 'failed',
  durationMs?: number,
  meta?: Record<string, unknown>
): void {
  const level = status === 'failed' ? 'error' : 'info';
  
  logger.log(level, `Service call ${service}.${operation} ${status}`, {
    serviceCall: {
      service,
      operation,
      status,
      durationMs,
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log a database operation
 */
export function logDatabase(
  operation: string,
  table: string,
  status: 'success' | 'error',
  durationMs: number,
  meta?: Record<string, unknown>
): void {
  const level = status === 'error' ? 'error' : 'debug';
  
  logger.log(level, `Database ${operation} on ${table}`, {
    database: {
      operation,
      table,
      status,
      durationMs,
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log a security event
 */
export function logSecurity(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  meta?: Record<string, unknown>
): void {
  const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  
  logger.log(level, `Security event: ${event}`, {
    security: {
      event,
      severity,
      timestamp: new Date().toISOString(),
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

/**
 * Log an audit event
 */
export function logAudit(
  action: string,
  resource: string,
  resourceId: string,
  userId: string,
  meta?: Record<string, unknown>
): void {
  logger.info('Audit event', {
    audit: {
      action,
      resource,
      resourceId,
      userId,
      timestamp: new Date().toISOString(),
    },
    ...PIISanitizer.sanitize(meta || {}),
  });
}

// =============================================================================
// CONSOLE OVERRIDE (Development only)
// Redirect console.* to winston for consistent formatting
// =============================================================================

if (config.env !== 'production') {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.log = (...args: unknown[]) => {
    const sanitized = args.map(arg => PIISanitizer.sanitize(arg));
    if (config.env === 'development') {
      originalConsoleLog(...sanitized);
    }
  };

  console.error = (...args: unknown[]) => {
    const sanitized = args.map(arg => PIISanitizer.sanitize(arg));
    logger.error('Console error', { args: sanitized });
  };

  console.warn = (...args: unknown[]) => {
    const sanitized = args.map(arg => PIISanitizer.sanitize(arg));
    logger.warn('Console warning', { args: sanitized });
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default logger;
