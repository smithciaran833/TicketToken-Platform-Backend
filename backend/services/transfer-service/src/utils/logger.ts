/**
 * Enhanced Logger for Transfer Service
 *
 * AUDIT FIXES:
 * - LOG-1: No sensitive data redaction → Added redaction paths
 * - LOG-2: Passwords could be logged → Redacted
 * - LOG-3: Tokens/API keys not redacted → Redacted
 * - LOG-H2: PII (email) logged → Redacted by default
 * - LOG-H4: Solana keys no redaction guard → Redacted
 *
 * Features:
 * - Sensitive data redaction (passwords, tokens, keys, PII)
 * - Request context enrichment
 * - Structured logging with correlation IDs
 * - Environment-aware formatting
 */

import pino, { Logger, LoggerOptions } from 'pino';

// =============================================================================
// REDACTION CONFIGURATION
// =============================================================================

/**
 * AUDIT FIX LOG-1, LOG-2, LOG-3: Paths to redact sensitive data
 * These paths will have their values replaced with '[REDACTED]'
 */
const REDACTION_PATHS = [
  // Authentication & Authorization
  'password',
  'newPassword',
  'oldPassword',
  'confirmPassword',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'api_key',
  'apiSecret',
  'api_secret',
  'authorization',
  'Authorization',
  'jwt',
  'jwtSecret',
  'JWT_SECRET',
  'bearerToken',
  'sessionToken',
  'session_token',

  // Solana/Blockchain - AUDIT FIX LOG-H4
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'treasuryPrivateKey',
  'SOLANA_TREASURY_PRIVATE_KEY',
  'walletPrivateKey',
  'mnemonic',
  'seedPhrase',
  'seed_phrase',

  // PII - AUDIT FIX LOG-H2
  'email',
  'toEmail',
  'userEmail',
  'ssn',
  'socialSecurityNumber',
  'dateOfBirth',
  'dob',
  'phoneNumber',
  'phone',
  'creditCard',
  'cardNumber',
  'cvv',
  'cvc',

  // Internal Service
  'INTERNAL_SERVICE_SECRET',
  'internalServiceSecret',
  'webhookSecret',
  'WEBHOOK_SECRET',

  // Database
  'DB_PASSWORD',
  'dbPassword',
  'connectionString',
  'REDIS_PASSWORD',
  'redisPassword',

  // Headers that might contain sensitive info
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',

  // Nested paths for common patterns
  '*.password',
  '*.secret',
  '*.token',
  '*.privateKey',
  '*.apiKey',
  '*.email',
  'body.password',
  'body.token',
  'body.secret',
  'query.token',
  'query.apiKey',
  'params.token'
];

// =============================================================================
// LOGGER CONFIGURATION
// =============================================================================

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

/**
 * Base logger configuration
 */
const loggerConfig: LoggerOptions = {
  level: isTest ? 'silent' : logLevel,

  // AUDIT FIX LOG-1, LOG-2, LOG-3: Redaction configuration
  redact: {
    paths: REDACTION_PATHS,
    censor: '[REDACTED]'
  },

  // Base context for all logs
  base: {
    service: 'transfer-service',
    version: process.env.npm_package_version || '1.0.0',
    env: process.env.NODE_ENV || 'development'
  },

  // Timestamp configuration
  timestamp: pino.stdTimeFunctions.isoTime,

  // Format error objects properly
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      service: bindings.service,
      version: bindings.version,
      env: bindings.env
    })
  },

  // Serializers for complex objects
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      // Don't log full headers - they might contain sensitive data
      // Headers are already filtered by redact paths
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort
    }),
    res: (res) => ({
      statusCode: res.statusCode
    })
  }
};

// =============================================================================
// LOGGER INSTANCE
// =============================================================================

/**
 * Main logger instance with redaction enabled
 */
const logger: Logger = pino(loggerConfig);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>): Logger {
  return logger.child(context);
}

/**
 * Create a request-scoped logger with correlation ID
 */
export function createRequestLogger(requestId: string, tenantId?: string): Logger {
  return logger.child({
    requestId,
    ...(tenantId && { tenantId })
  });
}

/**
 * Safely log an object, ensuring sensitive fields are redacted
 * Use this for objects that might contain dynamic keys with sensitive data
 */
export function safeLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = new Set([
    'password', 'secret', 'token', 'key', 'authorization',
    'privateKey', 'apiKey', 'email', 'phone', 'ssn'
  ]);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = Array.from(sensitiveKeys).some(sk => lowerKey.includes(sk));

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = safeLog(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Log audit event for security-sensitive operations
 */
export function logAuditEvent(
  event: string,
  userId: string,
  details: Record<string, unknown>,
  tenantId?: string
): void {
  logger.info({
    audit: true,
    event,
    userId,
    tenantId,
    details: safeLog(details),
    timestamp: new Date().toISOString()
  }, `Audit: ${event}`);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { logger };
export default logger;
