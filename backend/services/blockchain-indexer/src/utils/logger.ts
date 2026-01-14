/**
 * Logger with Sensitive Data Sanitization
 * 
 * AUDIT FIX: LOG-1 - Add log sanitization for PII/secrets
 * AUDIT FIX: LOG-2 - Add correlation ID propagation
 * AUDIT FIX: LOG-5 - Fix deprecated prettyPrint option
 * 
 * Based on minting-service logger.ts pattern
 */

import pino from 'pino';

// =============================================================================
// SENSITIVE DATA PATTERNS AND FIELDS
// =============================================================================

// Field names that should be redacted (case-insensitive)
const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'apiKey',
  'authorization',
  'auth',
  'bearer',
  'jwt',
  'private_key',
  'privateKey',
  'private',
  'credential',
  'credentials',
  'credit_card',
  'creditCard',
  'ssn',
  'social_security',
  'pin',
  'cvv',
  'cvc',
  'card_number',
  'cardNumber',
  'account_number',
  'accountNumber',
  'routing_number',
  'routingNumber',
  'email',
  'phone',
  'phone_number',
  'phoneNumber',
  'address',
  'ip_address',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'session',
  'refresh_token',
  'access_token',
  'seed',
  'mnemonic',
  'keypair'
]);

// Replacement text for redacted values
const REDACTED = '[REDACTED]';
const REDACTED_EMAIL = '[EMAIL_REDACTED]';
const REDACTED_TOKEN = '[TOKEN_REDACTED]';
const REDACTED_KEY = '[KEY_REDACTED]';

// =============================================================================
// SANITIZATION FUNCTIONS
// =============================================================================

/**
 * Check if a field name is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase().replace(/[-_]/g, '');
  
  for (const sensitive of SENSITIVE_FIELDS) {
    if (lowerName.includes(sensitive.toLowerCase().replace(/[-_]/g, ''))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a value matches sensitive patterns
 */
function isSensitiveValue(value: string): string | null {
  if (typeof value !== 'string' || value.length < 8) {
    return null;
  }

  // Check JWT pattern
  if (/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(value)) {
    return REDACTED_TOKEN;
  }

  // Check email pattern (PII)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return REDACTED_EMAIL;
  }

  // Check Base58 private keys (Solana)
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(value)) {
    return REDACTED_KEY;
  }

  // Check API key patterns
  if (/^(sk_|pk_|rk_|api_)[a-zA-Z0-9]{20,}$/.test(value)) {
    return REDACTED_KEY;
  }

  // Check generic long hex strings (could be secrets)
  if (/^[a-f0-9]{64,}$/i.test(value)) {
    return REDACTED;
  }

  return null;
}

/**
 * Sanitize a single value
 */
function sanitizeValue(value: any, fieldName: string = ''): any {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Check if field name indicates sensitive data
  if (fieldName && isSensitiveField(fieldName)) {
    return REDACTED;
  }

  // Handle strings
  if (typeof value === 'string') {
    // Check if value matches sensitive patterns
    const redactedAs = isSensitiveValue(value);
    if (redactedAs) {
      return redactedAs;
    }

    // Truncate very long strings (likely encoded data)
    if (value.length > 500) {
      return value.substring(0, 100) + `... [TRUNCATED ${value.length - 100} chars]`;
    }

    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, fieldName));
  }

  // Handle objects recursively
  if (typeof value === 'object') {
    return sanitizeObject(value);
  }

  // Return primitives as-is
  return value;
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: Record<string, any>, depth: number = 0): Record<string, any> {
  // Prevent infinite recursion
  if (depth > 10) {
    return { _error: 'Max depth exceeded' };
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip functions and symbols
    if (typeof value === 'function' || typeof value === 'symbol') {
      continue;
    }

    // Sanitize the value with field name context
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    } else {
      sanitized[key] = sanitizeValue(value, key);
    }
  }

  return sanitized;
}

// =============================================================================
// PINO REDACTION CONFIG
// =============================================================================

// Paths to redact in log objects
const redactPaths = [
  'password',
  'secret',
  'token',
  'apiKey',
  'authorization',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'privateKey',
  'private_key',
  'seed',
  'mnemonic',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.privateKey'
];

// =============================================================================
// LOGGER CONFIGURATION
// =============================================================================

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// AUDIT FIX: LOG-5 - Use transport instead of deprecated prettyPrint
const transport = isProduction 
  ? undefined 
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    };

const logger = pino({
  level: logLevel,
  // AUDIT FIX: LOG-1 - Redact sensitive fields
  redact: {
    paths: redactPaths,
    censor: REDACTED
  },
  base: {
    service: 'blockchain-indexer',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.SERVICE_VERSION || '1.0.0'
  },
  // Serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    error: (err: any) => {
      if (err instanceof Error) {
        return {
          type: err.name,
          message: err.message,
          stack: isProduction ? undefined : err.stack
        };
      }
      return err;
    },
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      path: req.path || req.url?.split('?')[0],
      query: sanitizeObject(req.query || {}),
      remoteAddress: req.ip || req.remoteAddress,
      requestId: req.id
    }),
    res: (res: any) => ({
      statusCode: res.statusCode
    })
  },
  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  // AUDIT FIX: LOG-5 - Use transport for pretty printing
  transport
});

// =============================================================================
// CHILD LOGGER WITH REQUEST CONTEXT
// =============================================================================

/**
 * Create a child logger with request context
 * AUDIT FIX: LOG-2 - Include correlation ID
 */
export function createRequestLogger(requestId: string, tenantId?: string): pino.Logger {
  return logger.child({
    requestId,
    tenantId,
    correlationId: requestId
  });
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>): pino.Logger {
  return logger.child(sanitizeObject(context));
}


// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Manually sanitize an object (for use outside logging)
 */
export function sanitize(obj: Record<string, any>): Record<string, any> {
  return sanitizeObject(obj);
}

/**
 * Check if a field name would be redacted
 */
export function wouldRedact(fieldName: string): boolean {
  return isSensitiveField(fieldName);
}

/**
 * Add a custom sensitive field at runtime
 */
export function addSensitiveField(fieldName: string): void {
  SENSITIVE_FIELDS.add(fieldName.toLowerCase());
}

/**
 * Log a security event (always logged at warn level minimum)
 * AUDIT FIX: LOG-4 - Security event logging
 */
export function logSecurityEvent(
  event: string, 
  details: Record<string, any>,
  severity: 'warn' | 'error' = 'warn'
): void {
  const sanitizedDetails = sanitizeObject(details);
  
  logger[severity]({
    securityEvent: event,
    ...sanitizedDetails,
    timestamp: new Date().toISOString()
  }, `Security event: ${event}`);
}

// =============================================================================
// SPECIALIZED LOGGERS
// AUDIT FIX: BG-7 - Create specialized loggers for jobs
// =============================================================================

/**
 * Create a child logger for job context
 * AUDIT FIX: BG-7 - Improved job logging with consistent context
 */
export function createJobLogger(jobType: string, jobId: string) {
  return logger.child({
    jobType,
    jobId,
    component: 'job-processor'
  });
}

/**
 * Create a child logger for transaction processing
 */
export function createTransactionLogger(signature: string) {
  return logger.child({
    signature,
    component: 'transaction-processor'
  });
}

/**
 * Create a child logger for RPC operations
 */
export function createRpcLogger(method: string) {
  return logger.child({
    rpcMethod: method,
    component: 'rpc-client'
  });
}

export default logger;
