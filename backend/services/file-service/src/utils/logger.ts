/**
 * Logger Configuration with PII Redaction
 *
 * AUDIT FIXES:
 * - LOG-1: No redaction config → PII fields are now redacted
 * - LOG-2: No correlation ID middleware → Correlation ID included in logs
 * - LOG-4: Metrics NOT integrated → Basic metrics tracking added
 */

import pino from 'pino';

// =============================================================================
// Configuration
// =============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = 'file-service';

// =============================================================================
// AUDIT FIX LOG-1: PII Redaction Paths
// Fields that may contain sensitive data
// =============================================================================
const REDACT_PATHS = [
  // Authentication
  'password',
  '*.password',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'authorization',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'privateKey',
  '*.privateKey',

  // Personal Information
  'ssn',
  '*.ssn',
  'socialSecurityNumber',
  '*.socialSecurityNumber',
  'creditCard',
  '*.creditCard',
  'cardNumber',
  '*.cardNumber',
  'cvv',
  '*.cvv',
  'pin',
  '*.pin',

  // User Data
  'email',
  '*.email',
  'phone',
  '*.phone',
  'phoneNumber',
  '*.phoneNumber',
  'address',
  '*.address',
  'dateOfBirth',
  '*.dateOfBirth',
  'dob',
  '*.dob',

  // Database
  'connectionString',
  'databaseUrl',
  'DATABASE_URL',

  // AWS
  'awsSecretKey',
  'AWS_SECRET_ACCESS_KEY',

  // Request body sensitive fields
  'req.body.password',
  'req.body.email',
  'req.body.phone',
  'req.body.ssn',
  'req.body.creditCard',
  'req.body.cardNumber',

  // Response body sensitive fields
  'res.body.token',
  'res.body.accessToken',
  'res.body.refreshToken',
];

// =============================================================================
// Pino Logger Configuration
// =============================================================================

const pinoConfig: pino.LoggerOptions = {
  name: SERVICE_NAME,
  level: LOG_LEVEL,

  // AUDIT FIX LOG-1: Enable redaction
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },

  // Add service context to all logs
  base: {
    service: SERVICE_NAME,
    env: NODE_ENV,
    pid: process.pid,
  },

  // Timestamp formatting
  timestamp: pino.stdTimeFunctions.isoTime,

  // Hook to support (message, object) argument order like Winston/console
  hooks: {
    logMethod(inputArgs, method) {
      if (inputArgs.length >= 2) {
        const arg1 = inputArgs[0];
        const arg2 = inputArgs[1];
        // If first arg is string and second is object, flip them
        if (typeof arg1 === 'string' && typeof arg2 === 'object' && arg2 !== null) {
          // If it's an Error, wrap it in { err: error }
          if ((arg2 as object) instanceof Error) {
            return method.apply(this, [{ err: arg2 }, arg1]);
          }
          return method.apply(this, [arg2, arg1]);
        }
      }
      return method.apply(this, inputArgs as Parameters<typeof method>);
    },
  },

  // Development-friendly formatting
  ...(NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),

  // Custom serializers
  serializers: {
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      path: req.routerPath,
      parameters: req.params,
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      // Don't log body in production
      ...(NODE_ENV === 'development' && { body: req.body }),
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },

  // Format error objects consistently
  formatters: {
    level: (label: string) => ({ level: label }),
    bindings: (bindings: pino.Bindings) => ({
      service: bindings.name,
      env: bindings.env,
    }),
  },
};

// Create the base logger
export const logger = pino(pinoConfig);

// =============================================================================
// Child Logger Factory
// =============================================================================

/**
 * Create a child logger with correlation ID context
 * AUDIT FIX LOG-2: Include correlation ID in all logs
 */
export function createChildLogger(context: {
  correlationId?: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: any;
}): pino.Logger {
  return logger.child(context);
}

/**
 * Create a request-scoped logger
 */
export function createRequestLogger(request: {
  correlationId?: string;
  id?: string;
  tenantId?: string;
}): pino.Logger {
  return logger.child({
    correlationId: request.correlationId || 'unknown',
    requestId: request.id,
    tenantId: request.tenantId,
  });
}

// =============================================================================
// AUDIT FIX LOG-4: Basic Metrics
// =============================================================================

interface LogMetrics {
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
}

const logMetrics: LogMetrics = {
  debug: 0,
  info: 0,
  warn: 0,
  error: 0,
  fatal: 0,
};

/**
 * Get current log metrics
 */
export function getLogMetrics(): LogMetrics {
  return { ...logMetrics };
}

/**
 * Wrapped logger with metrics tracking
 */
export const loggerWithMetrics = {
  debug: (obj: object | string, msg?: string) => {
    logMetrics.debug++;
    if (typeof obj === 'string') {
      logger.debug(obj);
    } else {
      logger.debug(obj, msg);
    }
  },
  info: (obj: object | string, msg?: string) => {
    logMetrics.info++;
    if (typeof obj === 'string') {
      logger.info(obj);
    } else {
      logger.info(obj, msg);
    }
  },
  warn: (obj: object | string, msg?: string) => {
    logMetrics.warn++;
    if (typeof obj === 'string') {
      logger.warn(obj);
    } else {
      logger.warn(obj, msg);
    }
  },
  error: (obj: object | string, msg?: string) => {
    logMetrics.error++;
    if (typeof obj === 'string') {
      logger.error(obj);
    } else {
      logger.error(obj, msg);
    }
  },
  fatal: (obj: object | string, msg?: string) => {
    logMetrics.fatal++;
    if (typeof obj === 'string') {
      logger.fatal(obj);
    } else {
      logger.fatal(obj, msg);
    }
  },
  child: logger.child.bind(logger),
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sanitize an object for logging (manual redaction)
 */
export function sanitizeForLogging<T extends object>(obj: T): T {
  const sensitiveKeys = new Set([
    'password',
    'token',
    'authorization',
    'apiKey',
    'secret',
    'privateKey',
    'ssn',
    'creditCard',
    'cardNumber',
    'cvv',
  ]);

  const sanitize = (input: any): any => {
    if (input === null || input === undefined) {
      return input;
    }

    if (Array.isArray(input)) {
      return input.map(sanitize);
    }

    if (typeof input === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitize(value);
        }
      }
      return result;
    }

    return input;
  };

  return sanitize(obj);
}

/**
 * Log and throw error helper
 */
export function logAndThrow(error: Error, context?: object): never {
  logger.error({ error: error.message, stack: error.stack, ...context }, 'Error thrown');
  throw error;
}

// =============================================================================
// Audit Logging
// =============================================================================

/**
 * Log security audit events
 */
export function auditLog(event: {
  action: string;
  resource: string;
  resourceId?: string;
  tenantId: string;
  userId?: string;
  correlationId?: string;
  outcome: 'success' | 'failure';
  reason?: string;
  metadata?: Record<string, any>;
}): void {
  logger.info({
    type: 'audit',
    ...event,
  }, `Audit: ${event.action} on ${event.resource}`);
}

// =============================================================================
// Default Export
// =============================================================================

export default logger;
