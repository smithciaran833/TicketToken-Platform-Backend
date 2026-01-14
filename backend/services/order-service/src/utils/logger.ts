import pino from 'pino';
import type { FastifyRequest } from 'fastify';

/**
 * CRITICAL: Pino logger with redaction for sensitive data
 * Prevents secrets, PII, and sensitive info from appearing in logs
 */

// Sensitive fields to redact from logs
const REDACT_PATHS = [
  // Authentication & secrets
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'Authorization',
  'jwt',
  'JWT_SECRET',
  'INTERNAL_SERVICE_SECRET',
  'x-internal-auth',
  'X-Internal-Auth',
  
  // Payment/financial data
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'creditCard',
  'credit_card',
  'bankAccount',
  'bank_account',
  'routingNumber',
  'routing_number',
  'stripeKey',
  'stripe_key',
  'clientSecret',
  'client_secret',
  
  // PII
  'ssn',
  'socialSecurityNumber',
  'social_security_number',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  
  // Nested paths (headers, body, params)
  'headers.authorization',
  'headers.Authorization',
  'headers.x-internal-auth',
  'headers.X-Internal-Auth',
  'body.password',
  'body.cardNumber',
  'body.cvv',
  'body.token',
  'body.secret',
  'req.headers.authorization',
  'req.headers.Authorization',
  'req.body.password',
  'res.body.token',
  
  // Array paths
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.cardNumber',
  '*.cvv',
];

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // CRITICAL: Redact sensitive fields
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined,
  
  base: {
    service: 'order-service',
    environment: process.env.NODE_ENV || 'development'
  },
  
  timestamp: pino.stdTimeFunctions.isoTime,
  
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  
  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      // Don't log full headers - only safe ones
      headers: {
        'content-type': req.headers?.['content-type'],
        'content-length': req.headers?.['content-length'],
        'x-request-id': req.headers?.['x-request-id'],
        'x-tenant-id': req.headers?.['x-tenant-id'],
        // Redact auth headers
        authorization: req.headers?.authorization ? '[REDACTED]' : undefined,
        'x-internal-auth': req.headers?.['x-internal-auth'] ? '[REDACTED]' : undefined,
      },
      remoteAddress: req.socket?.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

/**
 * Create a child logger with correlation context from request
 * This attaches traceId, spanId, and other request metadata to all log entries
 */
export function createRequestLogger(request: FastifyRequest): any {
  const correlationContext: any = {
    traceId: (request as any).traceId || request.id,
    spanId: (request as any).spanId,
    requestId: request.id,
    method: request.method,
    url: request.url,
    ip: request.ip,
  };

  // Add tenant context if available
  if ((request as any).tenant) {
    correlationContext.tenantId = (request as any).tenant.id;
    correlationContext.tenantName = (request as any).tenant.name;
  }

  // Add user context if available (but not sensitive data)
  if ((request as any).user) {
    correlationContext.userId = (request as any).user.id;
    correlationContext.userRole = (request as any).user.role;
    // Don't log email or other PII
  }

  return pinoLogger.child(correlationContext);
}

/**
 * Create a child logger with custom correlation context
 * Useful for background jobs, event handlers, etc.
 */
export function createContextLogger(context: Record<string, any>): any {
  // Filter out any sensitive fields from context
  const safeContext = { ...context };
  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'cardNumber', 'cvv'];
  for (const key of Object.keys(safeContext)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      safeContext[key] = '[REDACTED]';
    }
  }
  
  return pinoLogger.child({
    ...safeContext,
    timestamp: new Date().toISOString()
  });
}

/**
 * Sanitize an object before logging - removes sensitive fields
 */
export function sanitizeForLogging(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = [
    'password', 'secret', 'token', 'apiKey', 'api_key',
    'cardNumber', 'card_number', 'cvv', 'cvc',
    'authorization', 'x-internal-auth',
  ];
  
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// Export root logger with any type to avoid Pino's strict typing issues
export const logger = pinoLogger as any;
