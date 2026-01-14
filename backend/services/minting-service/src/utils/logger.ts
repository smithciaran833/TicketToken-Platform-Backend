/**
 * Logger with Sensitive Data Sanitization
 * 
 * Issue #14 (LCN5): Add log sanitization for PII/secrets
 * 
 * Features:
 * - Automatic redaction of sensitive fields
 * - Pattern-based detection of secrets
 * - Structured JSON logging for production
 * - Colored console output for development
 */

import winston from 'winston';

// =============================================================================
// SENSITIVE DATA PATTERNS AND FIELDS (#14 - LCN5)
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
  'email',        // PII - redact in production
  'phone',
  'phone_number',
  'phoneNumber',
  'address',
  'ip_address',
  'ip',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'session',
  'refresh_token',
  'access_token'
]);

// Patterns that indicate sensitive values
const SENSITIVE_PATTERNS = [
  // JWT tokens
  /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
  // Base58 private keys (Solana)
  /^[1-9A-HJ-NP-Za-km-z]{87,88}$/,
  // Base64 encoded secrets (long)
  /^[A-Za-z0-9+/]{40,}={0,2}$/,
  // API key patterns
  /^(sk_|pk_|rk_|api_)[a-zA-Z0-9]{20,}$/,
  // Generic long hex strings (could be secrets)
  /^[a-f0-9]{64,}$/i,
  // Credit card numbers
  /^\d{13,19}$/,
  // SSN pattern
  /^\d{3}-?\d{2}-?\d{4}$/,
  // Email addresses
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/
];

// Replacement text for redacted values
const REDACTED = '[REDACTED]';
const REDACTED_EMAIL = '[EMAIL_REDACTED]';
const REDACTED_TOKEN = '[TOKEN_REDACTED]';

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

  // Check other patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) {
      return REDACTED;
    }
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
    return value.map((item, index) => sanitizeValue(item, fieldName));
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

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip functions
    if (typeof value === 'function') {
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

/**
 * Sanitize error objects
 */
function sanitizeError(error: Error): Record<string, any> {
  const sanitized: Record<string, any> = {
    name: error.name,
    message: sanitizeValue(error.message, ''),
  };

  if (error.stack) {
    // Keep stack trace but limit length
    sanitized.stack = error.stack.length > 2000 
      ? error.stack.substring(0, 2000) + '... [TRUNCATED]'
      : error.stack;
  }

  // Copy any additional properties
  for (const key of Object.keys(error)) {
    if (!sanitized[key]) {
      sanitized[key] = sanitizeValue((error as any)[key], key);
    }
  }

  return sanitized;
}

// =============================================================================
// WINSTON FORMAT
// =============================================================================

/**
 * Winston format for sanitizing log data
 */
const sanitizeFormat = winston.format((info) => {
  // Sanitize the message if it's an object
  if (typeof info.message === 'object') {
    info.message = sanitizeObject(info.message as any);
  }

  // Process all other fields in place
  for (const [key, value] of Object.entries(info)) {
    if (!['level', 'message', 'timestamp', 'service', 'splat', Symbol.for('level'), Symbol.for('message')].includes(key as any)) {
      if (value instanceof Error) {
        (info as any)[key] = sanitizeError(value);
      } else if (typeof value === 'object' && value !== null) {
        (info as any)[key] = sanitizeObject(value);
      } else {
        (info as any)[key] = sanitizeValue(value, key);
      }
    }
  }

  return info;
});

// =============================================================================
// LOGGER CONFIGURATION
// =============================================================================

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    sanitizeFormat(),  // Apply sanitization
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'minting-service',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: isProduction 
        ? winston.format.json()  // JSON for production (log aggregators)
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 
                ? ` ${JSON.stringify(meta)}` 
                : '';
              return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
            })
          )
    })
  ],
  // Don't exit on uncaught exceptions
  exitOnError: false
});

// Add file transport in production
if (isProduction) {
  logger.add(new winston.transports.File({
    filename: '/var/log/minting-service/error.log',
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: '/var/log/minting-service/combined.log',
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10
  }));
}

// =============================================================================
// HELPER EXPORTS
// =============================================================================

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(sanitizeObject(context));
}

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

export default logger;
