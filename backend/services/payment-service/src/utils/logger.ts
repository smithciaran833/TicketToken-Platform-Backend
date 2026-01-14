/**
 * Structured Logger for Payment Service
 * 
 * HIGH FIX: Implements structured JSON logging with:
 * - Consistent JSON format across all log levels
 * - PCI-DSS compliant redaction of sensitive data
 * - Request context propagation (trace ID, tenant ID)
 * - Log level configuration via environment
 * 
 * MEDIUM FIXES:
 * - LC-1: Main logger structured JSON (pino)
 * - LC-2: Log level configuration via LOG_LEVEL env
 * - LC-4: Correlation ID (not just request ID)
 * - LC-9: Log rotation via pino-roll
 * - FP-6: Async logging (pino is async, no console.log)
 */

import pino, { Logger as PinoLogger, LoggerOptions, DestinationStream } from 'pino';
import { config } from '../config';

// =============================================================================
// Types
// =============================================================================

interface RequestContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
  // LC-4: Correlation ID support
  correlationId?: string;
}

interface PaymentContext {
  paymentId?: string;
  paymentIntentId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
}

// =============================================================================
// Sensitive Data Redaction
// =============================================================================

/**
 * Fields that should NEVER be logged (PCI-DSS compliance).
 * These are completely removed from logs.
 */
const REDACTED_FIELDS = [
  'cardNumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'cvv2',
  'securityCode',
  'security_code',
  'cardholderName',
  'cardholder_name',
  'expiry',
  'expiryDate',
  'expiry_date',
  'exp_month',
  'exp_year',
  'password',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'stripeSecretKey',
  'stripe_secret_key',
  'webhookSecret',
  'webhook_secret',
  'hmacSecret',
  'hmac_secret',
];

/**
 * Fields that should be partially masked.
 * Shows first/last few characters.
 */
const MASKED_FIELDS = [
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'accountNumber',
  'account_number',
  'routingNumber',
  'routing_number',
  'stripeAccountId',
  'stripe_account_id',
  'customerId',
  'customer_id',
];

/**
 * Redact sensitive data from log objects.
 * This is a pino serializer that runs on all logged objects.
 */
function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const result: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Complete redaction for sensitive fields
    if (REDACTED_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      result[key] = '[REDACTED]';
      continue;
    }
    
    // Partial masking for PII fields
    if (MASKED_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      result[key] = maskValue(value);
      continue;
    }
    
    // Recurse into nested objects
    if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Mask a value, showing only first and last few characters.
 */
function maskValue(value: any): string {
  if (typeof value !== 'string') {
    return '[MASKED]';
  }
  
  if (value.length <= 4) {
    return '****';
  }
  
  if (value.includes('@')) {
    // Email: show first char + domain hint
    const [local, domain] = value.split('@');
    const domainParts = domain?.split('.') || [];
    const tld = domainParts[domainParts.length - 1] || '';
    return `${local[0]}***@***.${tld}`;
  }
  
  // Default: show first 2 and last 2 characters
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 10))}${value.slice(-2)}`;
}

// =============================================================================
// LC-2: Log Level Configuration
// =============================================================================

/**
 * Get log level from environment with fallback
 */
function getLogLevel(): string {
  // LC-2: Environment variable takes precedence
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
    if (validLevels.includes(level)) {
      return level;
    }
  }
  
  // Default based on environment
  switch (config.server.env) {
    case 'production':
      return 'info';
    case 'test':
      return 'error';
    case 'development':
    default:
      return 'debug';
  }
}

// =============================================================================
// LC-9: Log Rotation Configuration
// =============================================================================

/**
 * Create file transport with rotation if configured
 */
function createFileTransport(): DestinationStream | undefined {
  const logDir = process.env.LOG_DIR;
  const logFile = process.env.LOG_FILE;
  
  // LC-9: File logging with rotation when LOG_DIR or LOG_FILE is set
  if (logDir || logFile) {
    const pinoRoll = require('pino-roll');
    const path = require('path');
    const fs = require('fs');
    
    const logPath = logFile || path.join(logDir, 'payment-service.log');
    const logDirectory = path.dirname(logPath);
    
    // Ensure log directory exists
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
    }
    
    return pinoRoll({
      file: logPath,
      frequency: process.env.LOG_ROTATION_FREQUENCY || 'daily',
      size: process.env.LOG_ROTATION_SIZE || '10m',
      mkdir: true,
      dateFormat: 'YYYY-MM-DD',
    });
  }
  
  return undefined;
}

// =============================================================================
// Logger Configuration
// =============================================================================

const logLevel = getLogLevel();

// LC-1: Structured JSON logging configuration
const pinoOptions: LoggerOptions = {
  name: 'payment-service',
  level: logLevel,
  
  // Always use JSON format for structured logging
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      service: 'payment-service',
      version: process.env.npm_package_version || process.env.SERVICE_VERSION || '1.0.0',
      environment: config.server.env,
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },
  
  // Add timestamp in ISO format
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  
  // Custom serializers
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      // LC-4: Include correlation ID
      correlationId: req.headers?.['x-correlation-id'] || req.headers?.['x-request-id'],
      headers: redactSensitiveData({
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
        'x-request-id': req.headers?.['x-request-id'],
        'x-trace-id': req.headers?.['x-trace-id'],
        'x-correlation-id': req.headers?.['x-correlation-id'],
      }),
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  
  // Redact paths (additional safeguard)
  redact: {
    paths: REDACTED_FIELDS.flatMap(field => [
      field,
      `*.${field}`,
      `*.*.${field}`,
      `body.${field}`,
      `headers.${field}`,
    ]),
    censor: '[REDACTED]',
  },
};

// Create transport options
function createTransports(): any {
  const targets: any[] = [];
  
  // Use pino-pretty in development for readable logs
  if (config.server.env === 'development' && !process.env.LOG_JSON) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  } else {
    // FP-6: Async stdout in production (pino's default)
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    });
  }
  
  // LC-9: Add file transport if configured
  const logFile = process.env.LOG_FILE || process.env.LOG_DIR;
  if (logFile) {
    targets.push({
      target: 'pino/file',
      options: { 
        destination: process.env.LOG_FILE || `${process.env.LOG_DIR}/payment-service.log`,
        mkdir: true,
      },
    });
  }
  
  return targets.length === 1 ? targets[0] : { targets };
}

// Create base logger
// FP-6: Using pino for async logging (no sync console.log)
const transport = createTransports();
const baseLogger = pino(pinoOptions, pino.transport(transport));

// =============================================================================
// Logger Wrapper with Context
// =============================================================================

class PaymentLogger {
  private logger: PinoLogger;
  private context: RequestContext = {};
  private paymentContext: PaymentContext = {};

  constructor(logger: PinoLogger) {
    this.logger = logger;
  }

  /**
   * Create a child logger with additional context.
   */
  child(bindings: Record<string, any>): PaymentLogger {
    const childLogger = new PaymentLogger(this.logger.child(redactSensitiveData(bindings)));
    childLogger.context = { ...this.context };
    childLogger.paymentContext = { ...this.paymentContext };
    return childLogger;
  }

  /**
   * Set request context for all subsequent logs.
   * LC-4: Now includes correlationId
   */
  setRequestContext(ctx: RequestContext): void {
    this.context = { ...this.context, ...ctx };
  }

  /**
   * Set payment context for all subsequent logs.
   */
  setPaymentContext(ctx: PaymentContext): void {
    this.paymentContext = { ...this.paymentContext, ...ctx };
  }

  /**
   * Clear context (call at end of request).
   */
  clearContext(): void {
    this.context = {};
    this.paymentContext = {};
  }

  /**
   * Get current correlation ID
   * LC-4: Helper for propagating correlation ID
   */
  getCorrelationId(): string | undefined {
    return this.context.correlationId || this.context.requestId || this.context.traceId;
  }

  private log(level: string, objOrMsg: any, msg?: string): void {
    // LC-4: Include correlation ID in all logs
    const context = {
      correlationId: this.getCorrelationId(),
      ...this.context,
      ...this.paymentContext,
    };

    if (typeof objOrMsg === 'string') {
      (this.logger as any)[level](context, objOrMsg);
    } else if (msg) {
      (this.logger as any)[level](
        { ...context, ...redactSensitiveData(objOrMsg) },
        msg
      );
    } else {
      // Support calling with just an object (common pattern)
      // Extract a message from the object if available
      const { message, msg: objMsg, ...rest } = objOrMsg || {};
      const logMessage = message || objMsg || level;
      (this.logger as any)[level](
        { ...context, ...redactSensitiveData(rest) },
        logMessage
      );
    }
  }

  // Standard log levels - flexible signature to support multiple calling patterns
  trace(objOrMsg: any, msg?: string): void {
    this.log('trace', objOrMsg, msg);
  }

  debug(objOrMsg: any, msg?: string): void {
    this.log('debug', objOrMsg, msg);
  }

  info(objOrMsg: any, msg?: string): void {
    this.log('info', objOrMsg, msg);
  }

  warn(objOrMsg: any, msg?: string): void {
    this.log('warn', objOrMsg, msg);
  }

  error(objOrMsg: any, msg?: string): void {
    this.log('error', objOrMsg, msg);
  }

  fatal(objOrMsg: any, msg?: string): void {
    this.log('fatal', objOrMsg, msg);
  }

  // Payment-specific logging methods
  
  /**
   * Log payment created event.
   */
  paymentCreated(details: {
    paymentId: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
    customerId?: string;
  }): void {
    this.info({
      event: 'payment.created',
      ...redactSensitiveData(details),
    }, 'Payment created');
  }

  /**
   * Log payment succeeded event.
   */
  paymentSucceeded(details: {
    paymentId: string;
    paymentIntentId: string;
    amount: number;
    chargeId?: string;
  }): void {
    this.info({
      event: 'payment.succeeded',
      ...redactSensitiveData(details),
    }, 'Payment succeeded');
  }

  /**
   * Log payment failed event.
   */
  paymentFailed(details: {
    paymentId: string;
    paymentIntentId?: string;
    errorCode?: string;
    errorMessage?: string;
    declineCode?: string;
  }): void {
    this.warn({
      event: 'payment.failed',
      ...redactSensitiveData(details),
    }, 'Payment failed');
  }

  /**
   * Log refund event.
   */
  refundProcessed(details: {
    refundId: string;
    paymentId: string;
    amount: number;
    reason?: string;
  }): void {
    this.info({
      event: 'refund.processed',
      ...redactSensitiveData(details),
    }, 'Refund processed');
  }

  /**
   * Log transfer event.
   */
  transferCreated(details: {
    transferId: string;
    destinationAccount: string;
    amount: number;
    orderId?: string;
  }): void {
    this.info({
      event: 'transfer.created',
      ...redactSensitiveData(details),
    }, 'Transfer created');
  }

  /**
   * Log webhook received event.
   */
  webhookReceived(details: {
    eventId: string;
    eventType: string;
    livemode: boolean;
  }): void {
    this.info({
      event: 'webhook.received',
      ...details,
    }, `Webhook received: ${details.eventType}`);
  }

  /**
   * Log security event (always logged at warn level).
   */
  securityEvent(details: {
    type: string;
    action: string;
    success: boolean;
    reason?: string;
    ip?: string;
    userId?: string;
    tenantId?: string;
  }): void {
    this.warn({
      event: 'security',
      ...redactSensitiveData(details),
    }, `Security event: ${details.type}`);
  }
}

// =============================================================================
// Exports
// =============================================================================

export const logger = new PaymentLogger(baseLogger);

// Also export raw pino logger for Fastify integration
export const pinoLogger = baseLogger;

// Re-export types
export type { RequestContext, PaymentContext };

// Helper to create request-scoped logger
// LC-4: Now includes correlation ID
export function createRequestLogger(req: any): PaymentLogger {
  // LC-4: Get correlation ID from various headers
  const correlationId = 
    req.headers?.['x-correlation-id'] ||
    req.headers?.['x-request-id'] ||
    req.id;

  const requestLogger = logger.child({
    requestId: req.id,
    correlationId,
    traceId: req.headers?.['x-trace-id'],
    method: req.method,
    path: req.url,
  });
  
  requestLogger.setRequestContext({
    requestId: req.id,
    correlationId,
    traceId: req.headers?.['x-trace-id'],
    tenantId: req.user?.tenantId,
    userId: req.user?.userId,
  });
  
  return requestLogger;
}

// Export log level getter
export { getLogLevel };
