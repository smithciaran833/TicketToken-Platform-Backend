/**
 * Logger for Compliance Service
 *
 * AUDIT FIX LOG-1: Add PII redaction for sensitive compliance data
 *
 * This service handles TAX data - EIN, SSN, account numbers must be redacted.
 */
import pino from 'pino';

// =============================================================================
// AUDIT FIX LOG-1: PII REDACTION PATTERNS
// =============================================================================

/**
 * Patterns for sensitive data that must be redacted in logs
 * Critical for compliance service: EIN, SSN, bank accounts
 * 
 * IMPORTANT: Patterns are ordered from MOST SPECIFIC to LEAST SPECIFIC
 * to prevent greedy matching
 */
const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // JWT tokens (must come before SECRET pattern)
  { pattern: /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g, replacement: '[JWT REDACTED]', name: 'JWT' },

  // API Keys / Secrets (common patterns)
  { pattern: /\b(?:api[_-]?key|secret|token|password)[:\s]*['"]*[\w\-+=]{16,}['"]*\b/gi, replacement: '[SECRET REDACTED]', name: 'SECRET' },

  // EIN (Employer Identification Number) - XX-XXXXXXX
  { pattern: /\b\d{2}-\d{7}\b/g, replacement: '[EIN REDACTED]', name: 'EIN' },

  // ITIN (Individual Taxpayer Identification Number) - 9XX-XX-XXXX (must come before SSN)
  { pattern: /\b9\d{2}-\d{2}-\d{4}\b/g, replacement: '[ITIN REDACTED]', name: 'ITIN' },

  // SSN (Social Security Number) - XXX-XX-XXXX
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN REDACTED]', name: 'SSN' },

  // Routing Numbers (9 digits with keyword - must come before SSN_NO_DASHES)
  { pattern: /\b(?:routing[_\s]?(?:number|num|no)?[:\s]*)(\d{9})\b/gi, replacement: '[ROUTING REDACTED]', name: 'ROUTING_NUMBER' },

  // SSN without dashes (9 digits - must come before ACCOUNT to prevent 9-digit SSNs being caught as accounts)
  { pattern: /\b(?<!\d)\d{9}(?!\d)\b/g, replacement: '[SSN REDACTED]', name: 'SSN_NO_DASHES' },

  // Bank Account Numbers (8-17 digits)
  { pattern: /\b(?:account[_\s]?(?:number|num|no)?[:\s]*)?(\d{8,17})\b/gi, replacement: '[ACCOUNT REDACTED]', name: 'ACCOUNT_NUMBER' },

  // Credit Card Numbers (13-19 digits with optional spaces/dashes)
  { pattern: /\b(?:\d{4}[-\s]?){3,4}\d{1,4}\b/g, replacement: '[CARD REDACTED]', name: 'CREDIT_CARD' },

  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL REDACTED]', name: 'EMAIL' },

  // Phone numbers
  { pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE REDACTED]', name: 'PHONE' }
];

/**
 * Fields that should be completely omitted from logs
 * NOTE: All entries should be lowercase for case-insensitive matching
 */
const REDACTED_FIELDS = [
  'password',
  'ssn',
  'social_security_number',
  'socialsecuritynumber',
  'ein',
  'employer_identification_number',
  'employeridentificationnumber',
  'tax_id',
  'taxid',
  'account_number',
  'accountnumber',
  'routing_number',
  'routingnumber',
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',
  'pin',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'bearer',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token'
];

/**
 * Redact sensitive values from a string
 */
function redactString(value: string): string {
  if (typeof value !== 'string') return value;

  let redacted = value;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

/**
 * Recursively redact sensitive data from objects
 */
function redactObject(obj: any, depth = 0): any {
  if (depth > 10) return '[MAX DEPTH]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return redactString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if field should be completely redacted (case-insensitive)
      if (REDACTED_FIELDS.includes(key.toLowerCase())) {
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

  return obj;
}

// =============================================================================
// PINO CONFIGURATION
// =============================================================================

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const pinoOptions: pino.LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,

  // Custom serializers for redaction
  serializers: {
    req: (req: any) => redactObject({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'x-request-id': req.headers?.['x-request-id'],
        host: req.headers?.host
        // Deliberately exclude authorization header
      },
      query: req.query,
      params: req.params
    }),
    res: (res: any) => ({
      statusCode: res.statusCode
    }),
    err: (err: any) => redactObject({
      type: err.type,
      message: err.message,
      stack: isProduction ? undefined : err.stack,
      code: err.code
    })
  },

  // Redact paths in production
  redact: isProduction ? {
    paths: REDACTED_FIELDS.map(f => `*.${f}`),
    censor: '[REDACTED]'
  } : undefined,

  // Format for development
  transport: !isProduction ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
};

// Create base logger
const baseLogger = pino(pinoOptions);

// =============================================================================
// CUSTOM LOGGER WITH REDACTION
// =============================================================================

/**
 * Custom logger that ensures all data is redacted before logging
 */
class RedactingLogger {
  private base: pino.Logger;

  constructor(base: pino.Logger) {
    this.base = base;
  }

  private redactArgs(args: any[]): any[] {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return redactObject(arg);
      }
      if (typeof arg === 'string') {
        return redactString(arg);
      }
      return arg;
    });
  }

  trace(obj: object | string, msg?: string, ...args: any[]): void {
    if (typeof obj === 'object') {
      this.base.trace(redactObject(obj), msg, ...this.redactArgs(args));
    } else {
      this.base.trace(redactString(obj));
    }
  }

  debug(obj: object | string, msg?: string, ...args: any[]): void {
    if (typeof obj === 'object') {
      this.base.debug(redactObject(obj), msg, ...this.redactArgs(args));
    } else {
      this.base.debug(redactString(obj));
    }
  }

  info(obj: object | string, msg?: string, ...args: any[]): void {
    if (typeof obj === 'object') {
      this.base.info(redactObject(obj), msg, ...this.redactArgs(args));
    } else {
      this.base.info(redactString(obj));
    }
  }

  warn(obj: object | string, msg?: string, ...args: any[]): void {
    if (typeof obj === 'object') {
      this.base.warn(redactObject(obj), msg, ...this.redactArgs(args));
    } else {
      this.base.warn(redactString(obj));
    }
  }

  error(obj: object | string, msg?: string, ...args: any[]): void {
    if (typeof obj === 'object') {
      this.base.error(redactObject(obj), msg, ...this.redactArgs(args));
    } else {
      this.base.error(redactString(obj));
    }
  }

  fatal(obj: object | string, msg?: string, ...args: any[]): void {
    if (typeof obj === 'object') {
      this.base.fatal(redactObject(obj), msg, ...this.redactArgs(args));
    } else {
      this.base.fatal(redactString(obj));
    }
  }

  child(bindings: pino.Bindings): RedactingLogger {
    return new RedactingLogger(this.base.child(redactObject(bindings)));
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const logger = new RedactingLogger(baseLogger);

// Export utility functions for testing
export { redactString, redactObject, REDACTION_PATTERNS, REDACTED_FIELDS };

export default logger;
