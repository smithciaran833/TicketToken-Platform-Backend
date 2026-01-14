/**
 * Logger with Sensitive Data Sanitization for Blockchain Service
 * 
 * Issues Fixed:
 * - #14 (LCN5): Add log sanitization for PII/secrets
 * - #38: Logging with sensitive data → Auto-redaction
 * 
 * Features:
 * - Automatic redaction of sensitive fields (passwords, keys, tokens)
 * - Pattern-based detection of secrets
 * - Structured JSON logging for production
 * - Colored console output for development
 */

import winston from 'winston';

// =============================================================================
// SENSITIVE DATA PATTERNS (#14 - LCN5, #38)
// =============================================================================

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
  'mnemonic',
  'seed_phrase',
  'seedPhrase',
  'wallet_key',
  'walletKey',
  'treasury_key',
  'treasuryKey',
  'email',
  'phone',
  'phone_number',
  'phoneNumber',
  'address',
  'ip_address',
  'ip',
  'x-api-key',
  'x-auth-token',
  'x-internal-signature',
  'cookie',
  'session',
  'refresh_token',
  'access_token',
  'internal_service_secret'
]);

// Patterns that indicate sensitive values
const SENSITIVE_PATTERNS = [
  // JWT tokens
  /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
  // Base58 private keys (Solana - 87-88 chars)
  /^[1-9A-HJ-NP-Za-km-z]{87,88}$/,
  // Base64 encoded secrets (long)
  /^[A-Za-z0-9+/]{40,}={0,2}$/,
  // API key patterns
  /^(sk_|pk_|rk_|api_)[a-zA-Z0-9]{20,}$/,
  // Generic long hex strings (could be secrets)
  /^[a-f0-9]{64,}$/i,
  // Email addresses
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/
];

const REDACTED = '[REDACTED]';
const REDACTED_EMAIL = '[EMAIL_REDACTED]';
const REDACTED_TOKEN = '[TOKEN_REDACTED]';
const REDACTED_KEY = '[KEY_REDACTED]';

// =============================================================================
// SANITIZATION FUNCTIONS
// =============================================================================

function isSensitiveField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase().replace(/[-_]/g, '');
  
  for (const sensitive of SENSITIVE_FIELDS) {
    if (lowerName.includes(sensitive.toLowerCase().replace(/[-_]/g, ''))) {
      return true;
    }
  }
  
  return false;
}

function isSensitiveValue(value: string): string | null {
  if (typeof value !== 'string' || value.length < 8) {
    return null;
  }

  // Check JWT pattern
  if (/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(value)) {
    return REDACTED_TOKEN;
  }

  // Check Solana private key pattern (Base58, 87-88 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(value)) {
    return REDACTED_KEY;
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

function sanitizeValue(value: any, fieldName: string = ''): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (fieldName && isSensitiveField(fieldName)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    const redactedAs = isSensitiveValue(value);
    if (redactedAs) {
      return redactedAs;
    }

    // Truncate very long strings
    if (value.length > 500) {
      return value.substring(0, 100) + `... [TRUNCATED ${value.length - 100} chars]`;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, fieldName));
  }

  if (typeof value === 'object') {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(obj: Record<string, any>, depth: number = 0): Record<string, any> {
  if (depth > 10) {
    return { _error: 'Max depth exceeded' };
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') {
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    } else {
      sanitized[key] = sanitizeValue(value, key);
    }
  }

  return sanitized;
}

function sanitizeError(error: Error): Record<string, any> {
  const sanitized: Record<string, any> = {
    name: error.name,
    message: sanitizeValue(error.message, ''),
  };

  if (error.stack) {
    sanitized.stack = error.stack.length > 2000 
      ? error.stack.substring(0, 2000) + '... [TRUNCATED]'
      : error.stack;
  }

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

const sanitizeFormat = winston.format((info) => {
  if (typeof info.message === 'object') {
    info.message = sanitizeObject(info.message as any);
  }

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

const isProduction = process.env.NODE_ENV === 'production';
const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    sanitizeFormat(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      format: isProduction 
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 
                ? ` ${JSON.stringify(meta)}` 
                : '';
              return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
            })
          ),
      stderrLevels: ['error', 'warn']
    })
  ],
  exitOnError: false
});

// File transports in production
if (isProduction) {
  logger.add(new winston.transports.File({
    filename: `/var/log/${SERVICE_NAME}/error.log`,
    level: 'error',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: `/var/log/${SERVICE_NAME}/combined.log`,
    maxsize: 50 * 1024 * 1024,
    maxFiles: 10
  }));
}

// =============================================================================
// EXPORTS
// =============================================================================

export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(sanitizeObject(context));
}

export const createLoggerWithContext = (requestId?: string, tenantId?: string) => {
  return logger.child(sanitizeObject({ requestId, tenantId }));
};

export function sanitize(obj: Record<string, any>): Record<string, any> {
  return sanitizeObject(obj);
}

export function wouldRedact(fieldName: string): boolean {
  return isSensitiveField(fieldName);
}

export function addSensitiveField(fieldName: string): void {
  SENSITIVE_FIELDS.add(fieldName.toLowerCase());
}

export default logger;
