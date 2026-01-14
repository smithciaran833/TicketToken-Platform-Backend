/**
 * Secure Logger for Integration Service
 * 
 * AUDIT FIX LOG-2: Logger with no redaction → Sensitive data redaction
 * 
 * Features:
 * - Automatic PII redaction
 * - Credential filtering
 * - Structured JSON logging
 * - Request correlation
 * - Log level management
 */

import winston from 'winston';
import { getConfig, isProduction } from '../config/index';

// =============================================================================
// SENSITIVE DATA PATTERNS
// =============================================================================

/**
 * Patterns for sensitive data that should be redacted
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API Keys and tokens
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/gi, replacement: '[STRIPE_SECRET_KEY]' },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/gi, replacement: '[STRIPE_TEST_KEY]' },
  { pattern: /pk_live_[a-zA-Z0-9]{24,}/gi, replacement: '[STRIPE_PUBLISHABLE_KEY]' },
  { pattern: /pk_test_[a-zA-Z0-9]{24,}/gi, replacement: '[STRIPE_TEST_PUBLISHABLE_KEY]' },
  { pattern: /sq0[a-z]{3}-[a-zA-Z0-9_-]{22,}/gi, replacement: '[SQUARE_KEY]' },
  { pattern: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /Basic\s+[a-zA-Z0-9+/=]+/gi, replacement: 'Basic [REDACTED]' },
  
  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi, replacement: '[JWT_TOKEN]' },
  
  // OAuth tokens
  { pattern: /access_token['":\s]+['"]?[a-zA-Z0-9._-]+['"]?/gi, replacement: 'access_token: [REDACTED]' },
  { pattern: /refresh_token['":\s]+['"]?[a-zA-Z0-9._-]+['"]?/gi, replacement: 'refresh_token: [REDACTED]' },
  
  // Passwords and secrets
  { pattern: /password['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'password: [REDACTED]' },
  { pattern: /secret['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'secret: [REDACTED]' },
  { pattern: /apikey['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'apikey: [REDACTED]' },
  { pattern: /api_key['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'api_key: [REDACTED]' },
  { pattern: /client_secret['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'client_secret: [REDACTED]' },
  
  // Credit card numbers (13-19 digits)
  { pattern: /\b[0-9]{13,19}\b/g, replacement: '[CARD_NUMBER]' },
  { pattern: /\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/g, replacement: '[CARD_NUMBER]' },
  
  // CVV
  { pattern: /cvv['":\s]+['"]?[0-9]{3,4}['"]?/gi, replacement: 'cvv: [REDACTED]' },
  { pattern: /cvc['":\s]+['"]?[0-9]{3,4}['"]?/gi, replacement: 'cvc: [REDACTED]' },
  
  // SSN (US Social Security Number)
  { pattern: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g, replacement: '[SSN]' },
  
  // Email addresses (partial redaction)
  { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, replacement: '[EMAIL]' },
  
  // Phone numbers (various formats)
  { pattern: /\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g, replacement: '[PHONE]' },
  
  // Database connection strings
  { pattern: /postgresql:\/\/[^@]+@/gi, replacement: 'postgresql://[REDACTED]@' },
  { pattern: /postgres:\/\/[^@]+@/gi, replacement: 'postgres://[REDACTED]@' },
  { pattern: /redis:\/\/:[^@]+@/gi, replacement: 'redis://:[REDACTED]@' },
  
  // Webhook signatures
  { pattern: /x-stripe-signature['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'x-stripe-signature: [REDACTED]' },
  { pattern: /x-square-signature['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'x-square-signature: [REDACTED]' },
  { pattern: /x-mailchimp-signature['":\s]+['"]?[^'"}\s,]+['"]?/gi, replacement: 'x-mailchimp-signature: [REDACTED]' },
];

/**
 * Sensitive field names to redact in objects
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'apikey',
  'clientSecret',
  'client_secret',
  'privateKey',
  'private_key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'socialSecurityNumber',
  'stripeSecretKey',
  'squareAccessToken',
  'mailchimpApiKey',
  'quickbooksRefreshToken',
  'webhookSecret',
  'signingSecret',
  'encryptionKey',
]);

// =============================================================================
// REDACTION FUNCTIONS
// =============================================================================

/**
 * Redact sensitive patterns from a string
 */
function redactString(str: string): string {
  if (typeof str !== 'string') return str;
  
  let redacted = str;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

/**
 * Deep clone and redact sensitive fields from an object
 */
function redactObject(obj: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH_EXCEEDED]';
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return redactString(obj);
  }
  
  if (typeof obj !== 'object') return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1));
  }
  
  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  // Handle Error objects
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: redactString(obj.message),
      stack: isProduction() ? undefined : redactString(obj.stack || '')
    };
  }
  
  // Handle plain objects
  const redacted: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if field should be fully redacted
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactString(value);
    } else if (typeof value === 'object') {
      redacted[key] = redactObject(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

// =============================================================================
// WINSTON CONFIGURATION
// =============================================================================

/**
 * Custom format for redacting sensitive data
 */
const redactFormat = (winston.format as any)((info: any) => {
  // Redact message
  if (typeof info.message === 'string') {
    info.message = redactString(info.message);
  }
  
  // Redact metadata
  const safeInfo = { ...info };
  for (const [key, value] of Object.entries(safeInfo)) {
    if (key !== 'level' && key !== 'message' && key !== 'timestamp') {
      (safeInfo as Record<string, any>)[key] = redactObject(value);
    }
  }
  
  return safeInfo;
});

/**
 * Get log level from config
 */
function getLogLevel(): string {
  try {
    const config = getConfig();
    return config.LOG_LEVEL || 'info';
  } catch {
    return process.env.LOG_LEVEL || 'info';
  }
}

/**
 * Create Winston logger instance
 */
const transports: winston.transport[] = [];

// Console transport
transports.push(
  new winston.transports.Console({
    format: isProduction()
      ? winston.format.combine(
          winston.format.timestamp(),
          redactFormat(),
          winston.format.json()
        )
      : winston.format.combine(
          winston.format.timestamp(),
          redactFormat(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        )
  })
);

export const logger = winston.createLogger({
  level: getLogLevel(),
  defaultMeta: { service: 'integration-service' },
  transports,
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a child logger with request context
 */
export function createRequestLogger(requestId: string, tenantId?: string): winston.Logger {
  return logger.child({
    requestId,
    tenantId,
  });
}

/**
 * Log with request context
 */
export function logWithContext(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context: { requestId?: string; tenantId?: string; [key: string]: any }
): void {
  logger.log(level, message, redactObject(context));
}

/**
 * Safely stringify an object for logging
 */
export function safeStringify(obj: any): string {
  try {
    return JSON.stringify(redactObject(obj));
  } catch (error) {
    return '[STRINGIFY_ERROR]';
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default logger;
