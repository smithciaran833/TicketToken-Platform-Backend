/**
 * Secure Logger for Notification Service
 * 
 * AUDIT FIXES:
 * - LOG-1: No sensitive data redaction → PII/token redaction
 * - LOG-H2: No PII filtering → PII redaction patterns
 * - LOG-H3: Tokens not redacted → API key redaction
 * 
 * Features:
 * - Winston with structured JSON logging
 * - Automatic PII redaction (emails, phones, tokens)
 * - Request correlation IDs
 * - Log level control via env
 */

import winston from 'winston';
import { env } from '../config/env';

// =============================================================================
// REDACTION PATTERNS - AUDIT FIX LOG-1, LOG-H2, LOG-H3
// =============================================================================

/**
 * Patterns for sensitive data that should be redacted
 */
const REDACTION_PATTERNS = [
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
  
  // Phone numbers (various formats)
  { pattern: /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE_REDACTED]' },
  
  // Credit card numbers
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CARD_REDACTED]' },
  
  // SSN
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  
  // API keys and tokens (common patterns)
  { pattern: /(?:api[_-]?key|token|secret|password|authorization)['":\s]*[=:]?\s*['"]?([a-zA-Z0-9_\-./+=]{20,})['"]?/gi, replacement: '$1: [REDACTED]' },
  
  // Bearer tokens
  { pattern: /Bearer\s+[a-zA-Z0-9\-_.~+/]+=*/gi, replacement: 'Bearer [TOKEN_REDACTED]' },
  
  // SendGrid API key format
  { pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, replacement: '[SENDGRID_KEY_REDACTED]' },
  
  // Twilio credentials
  { pattern: /AC[a-f0-9]{32}/g, replacement: '[TWILIO_SID_REDACTED]' },
  { pattern: /SK[a-f0-9]{32}/g, replacement: '[TWILIO_KEY_REDACTED]' },
  
  // AWS credentials
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_ACCESS_KEY_REDACTED]' },
  { pattern: /(?:aws_secret_access_key|secret)['":\s]*[=:]?\s*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi, replacement: '[AWS_SECRET_REDACTED]' },
  
  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT_REDACTED]' },
  
  // UUIDs in sensitive contexts
  { pattern: /(user_?id|customer_?id|recipient_?id)['":\s]*[=:]?\s*['"]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"]?/gi, replacement: '$1: [ID_REDACTED]' },
];

// Keys that should have their values redacted
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'apikey',
  'authorization',
  'auth',
  'credential',
  'private_key',
  'privateKey',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionId',
  'session_id',
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'pin',
  'otp',
  'twoFactorCode',
]);

// =============================================================================
// REDACTION FUNCTIONS
// =============================================================================

/**
 * AUDIT FIX LOG-1, LOG-H2, LOG-H3: Redact sensitive data from string
 */
function redactString(str: string): string {
  let result = str;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * AUDIT FIX LOG-1, LOG-H2, LOG-H3: Recursively redact sensitive data from objects
 */
function redactObject(obj: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH_EXCEEDED]';
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return redactString(obj);
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1));
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key is sensitive
    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
      continue;
    }
    
    // Check for partial matches
    if (lowerKey.includes('password') || 
        lowerKey.includes('secret') || 
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key')) {
      result[key] = '[REDACTED]';
      continue;
    }
    
    // Recursively process
    result[key] = redactObject(value, depth + 1);
  }
  
  return result;
}

// =============================================================================
// WINSTON FORMAT - AUDIT FIX LOG-1, LOG-H2, LOG-H3
// =============================================================================

/**
 * Custom format that redacts sensitive data
 */
const redactFormat = winston.format((info) => {
  // Redact message
  if (typeof info.message === 'string') {
    info.message = redactString(info.message);
  }
  
  // Redact metadata
  const redactedMeta: any = {};
  for (const [key, value] of Object.entries(info)) {
    if (['level', 'message', 'timestamp', 'service'].includes(key)) {
      redactedMeta[key] = value;
    } else {
      redactedMeta[key] = redactObject(value);
    }
  }
  
  return redactedMeta;
});

// =============================================================================
// LOGGER CONFIGURATION
// =============================================================================

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  redactFormat(),
  winston.format.errors({ stack: true }),
  env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length 
            ? ` ${JSON.stringify(meta)}` 
            : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
);

/**
 * Main logger instance with redaction
 */
export const logger = winston.createLogger({
  level: env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'notification-service',
    environment: env.NODE_ENV
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ],
  exitOnError: false
});

// =============================================================================
// CHILD LOGGER WITH CONTEXT
// =============================================================================

/**
 * Create a child logger with request context
 */
export function createRequestLogger(requestId: string, tenantId?: string) {
  return logger.child({
    requestId,
    tenantId: tenantId || undefined
  });
}

/**
 * Create a child logger with job context
 */
export function createJobLogger(jobId: string, jobType: string) {
  return logger.child({
    jobId,
    jobType
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Log with automatic PII redaction - use for user data
 */
export function logUserAction(
  level: string,
  message: string,
  userData: Record<string, any>
) {
  const redacted = redactObject(userData);
  logger.log(level, message, redacted);
}

/**
 * Safe stringify for logging (handles circular refs)
 */
export function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default logger;
