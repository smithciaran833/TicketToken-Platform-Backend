/**
 * Tracing Utilities for Payment Service
 * 
 * MEDIUM FIXES:
 * - DT-4: Trace ID everywhere (not just middleware)
 * - SE-5: OWASP vocabulary for security events
 * - SE-8: Standardized validation failure logs
 * - SE-9: Rate limit event vocabulary
 */

import { context, trace, Span, SpanStatusCode } from '@opentelemetry/api';
import { logger } from './logger';

const log = logger.child({ component: 'Tracing' });

// =============================================================================
// DT-4: TRACE ID EVERYWHERE
// =============================================================================

/**
 * Get current trace ID from context
 * DT-4: Makes trace ID available anywhere, not just in middleware
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  if (span) {
    return span.spanContext().traceId;
  }
  return undefined;
}

/**
 * Get current span ID from context
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getSpan(context.active());
  if (span) {
    return span.spanContext().spanId;
  }
  return undefined;
}

/**
 * Get current trace context for propagation
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  const span = trace.getSpan(context.active());
  if (span) {
    const ctx = span.spanContext();
    return {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
    };
  }
  return {};
}

/**
 * Add trace context to an object (for logging, HTTP headers, etc.)
 */
export function withTraceContext<T extends object>(obj: T): T & { traceId?: string; spanId?: string } {
  return {
    ...obj,
    ...getTraceContext(),
  };
}

// =============================================================================
// SE-5: OWASP SECURITY EVENT VOCABULARY
// =============================================================================

/**
 * OWASP Application Security Verification Standard (ASVS) event types
 * Based on OWASP Logging Cheat Sheet recommendations
 */
export const SecurityEventType = {
  // Authentication Events
  AUTHENTICATION_SUCCESS: 'authentication_success',
  AUTHENTICATION_FAILURE: 'authentication_failure',
  AUTHENTICATION_LOCKOUT: 'authentication_lockout',
  LOGOUT: 'logout',
  SESSION_CREATED: 'session_created',
  SESSION_DESTROYED: 'session_destroyed',
  SESSION_TIMEOUT: 'session_timeout',
  
  // Authorization Events
  AUTHORIZATION_SUCCESS: 'authorization_success',
  AUTHORIZATION_FAILURE: 'authorization_failure',
  PRIVILEGE_ESCALATION_ATTEMPT: 'privilege_escalation_attempt',
  ROLE_CHANGE: 'role_change',
  
  // Input Validation Events
  INPUT_VALIDATION_FAILURE: 'input_validation_failure',
  MALICIOUS_INPUT_DETECTED: 'malicious_input_detected',
  INJECTION_ATTEMPT: 'injection_attempt',
  XSS_ATTEMPT: 'xss_attempt',
  
  // Access Control Events
  ACCESS_DENIED: 'access_denied',
  RESOURCE_ACCESS: 'resource_access',
  ADMIN_ACCESS: 'admin_access',
  SENSITIVE_DATA_ACCESS: 'sensitive_data_access',
  
  // Rate Limiting Events (SE-9)
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  RATE_LIMIT_WARNING: 'rate_limit_warning',
  RATE_LIMIT_BLOCKED: 'rate_limit_blocked',
  
  // Data Events
  DATA_CREATED: 'data_created',
  DATA_MODIFIED: 'data_modified',
  DATA_DELETED: 'data_deleted',
  DATA_EXPORT: 'data_export',
  
  // Payment-Specific Events
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED: 'payment_failed',
  REFUND_REQUESTED: 'refund_requested',
  SUSPICIOUS_TRANSACTION: 'suspicious_transaction',
  FRAUD_DETECTED: 'fraud_detected',
  
  // System Events
  CONFIGURATION_CHANGE: 'configuration_change',
  SERVICE_STARTED: 'service_started',
  SERVICE_STOPPED: 'service_stopped',
  ERROR_THRESHOLD_EXCEEDED: 'error_threshold_exceeded',
} as const;

export type SecurityEventTypeValue = typeof SecurityEventType[keyof typeof SecurityEventType];

/**
 * SE-5: Log a security event with OWASP vocabulary
 */
export function logSecurityEvent(
  eventType: SecurityEventTypeValue,
  details: {
    success: boolean;
    userId?: string;
    tenantId?: string;
    ip?: string;
    userAgent?: string;
    resource?: string;
    action?: string;
    reason?: string;
    metadata?: Record<string, any>;
  }
): void {
  const traceContext = getTraceContext();
  
  const eventData = {
    event: 'security',
    eventType,
    ...traceContext,
    ...details,
    timestamp: new Date().toISOString(),
  };

  // Use appropriate log level based on event
  if (isHighSeverityEvent(eventType) && !details.success) {
    log.error(eventData, `Security event: ${eventType}`);
  } else if (!details.success) {
    log.warn(eventData, `Security event: ${eventType}`);
  } else {
    log.info(eventData, `Security event: ${eventType}`);
  }
}

/**
 * Check if event is high severity
 */
function isHighSeverityEvent(eventType: SecurityEventTypeValue): boolean {
  const highSeverityEvents: SecurityEventTypeValue[] = [
    SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT,
    SecurityEventType.MALICIOUS_INPUT_DETECTED,
    SecurityEventType.INJECTION_ATTEMPT,
    SecurityEventType.XSS_ATTEMPT,
    SecurityEventType.FRAUD_DETECTED,
    SecurityEventType.SUSPICIOUS_TRANSACTION,
    SecurityEventType.AUTHENTICATION_LOCKOUT,
  ];
  return highSeverityEvents.includes(eventType);
}

// =============================================================================
// SE-8: STANDARDIZED VALIDATION FAILURE LOGS
// =============================================================================

/**
 * Validation failure details
 */
export interface ValidationFailure {
  field: string;
  value?: any;
  constraint: string;
  message: string;
  code?: string;
}

/**
 * SE-8: Log validation failures in standardized format
 */
export function logValidationFailure(
  failures: ValidationFailure[],
  context: {
    path: string;
    method: string;
    userId?: string;
    tenantId?: string;
    ip?: string;
  }
): void {
  const traceContext = getTraceContext();
  
  // Sanitize values to prevent log injection
  const sanitizedFailures = failures.map(f => ({
    field: sanitizeLogValue(f.field),
    constraint: f.constraint,
    message: sanitizeLogValue(f.message),
    code: f.code,
    // Don't log values to prevent sensitive data leakage
    valueType: typeof f.value,
  }));

  log.warn({
    event: 'validation_failure',
    eventType: SecurityEventType.INPUT_VALIDATION_FAILURE,
    ...traceContext,
    ...context,
    failureCount: failures.length,
    failures: sanitizedFailures,
    timestamp: new Date().toISOString(),
  }, `Validation failed: ${failures.length} errors`);
}

/**
 * Sanitize log values to prevent log injection
 */
function sanitizeLogValue(value: string): string {
  if (!value) return '';
  
  // Remove newlines, carriage returns, and other control characters
  return value
    .replace(/[\r\n]/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 500); // Limit length
}

// =============================================================================
// SE-9: RATE LIMIT EVENT VOCABULARY
// =============================================================================

/**
 * Rate limit event details
 */
export interface RateLimitEvent {
  type: 'exceeded' | 'warning' | 'blocked';
  limiterType: 'ip' | 'user' | 'tenant' | 'endpoint' | 'global';
  key: string; // Anonymized key
  limit: number;
  remaining: number;
  retryAfterSeconds?: number;
  windowMs?: number;
}

/**
 * SE-9: Log rate limit events with standardized vocabulary
 */
export function logRateLimitEvent(
  event: RateLimitEvent,
  context: {
    path: string;
    method: string;
    userId?: string;
    tenantId?: string;
    ip?: string;
  }
): void {
  const traceContext = getTraceContext();
  
  // Map type to OWASP event type
  const eventType = event.type === 'exceeded' 
    ? SecurityEventType.RATE_LIMIT_EXCEEDED
    : event.type === 'blocked'
      ? SecurityEventType.RATE_LIMIT_BLOCKED
      : SecurityEventType.RATE_LIMIT_WARNING;

  const logData = {
    event: 'rate_limit',
    eventType,
    ...traceContext,
    ...context,
    rateLimit: {
      type: event.limiterType,
      key: anonymizeKey(event.key),
      limit: event.limit,
      remaining: event.remaining,
      retryAfterSeconds: event.retryAfterSeconds,
      windowMs: event.windowMs,
      usagePercent: Math.round((1 - event.remaining / event.limit) * 100),
    },
    timestamp: new Date().toISOString(),
  };

  if (event.type === 'blocked') {
    log.error(logData, `Rate limit blocked: ${event.limiterType}`);
  } else if (event.type === 'exceeded') {
    log.warn(logData, `Rate limit exceeded: ${event.limiterType}`);
  } else {
    log.info(logData, `Rate limit warning: ${event.limiterType}`);
  }
}

/**
 * Anonymize rate limit keys to prevent PII in logs
 */
function anonymizeKey(key: string): string {
  if (!key) return 'unknown';
  
  // If it looks like an IP, mask it
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(key)) {
    const parts = key.split('.');
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  
  // If it looks like a UUID, show first 8 chars
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key.substring(0, 8) + '...';
  }
  
  // Default: show first 4 and last 4 chars if long enough
  if (key.length > 12) {
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  }
  
  return key;
}

// =============================================================================
// SPAN UTILITIES
// =============================================================================

/**
 * Record an error on the current span
 */
export function recordSpanError(error: Error): void {
  const span = trace.getSpan(context.active());
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

/**
 * Add custom attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getSpan(context.active());
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Add event to current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getSpan(context.active());
  if (span) {
    span.addEvent(name, attributes);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  sanitizeLogValue,
  anonymizeKey,
};
