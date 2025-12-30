import pino from 'pino';
import { FastifyReply } from 'fastify';
import { config } from '../config';

// Create logger instance with proper configuration
export const logger = pino({
  name: 'tickettoken-gateway',
  level: config.logging.level,

  // Use pretty printing in development
  ...(config.logging.pretty && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        messageFormat: '{msg} [{requestId}]',
      },
    },
  }),

  // Production configuration
  ...(!config.logging.pretty && {
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  }),

  // Redact sensitive information (PII and secrets)
  redact: {
    paths: [
      // Authentication & secrets
      'password',
      'authorization',
      'cookie',
      'token',
      'refreshToken',
      'accessToken',
      'apiKey',
      'secret',
      '*.password',
      '*.authorization',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.apiKey',
      '*.secret',
      'headers.authorization',
      'headers.cookie',
      'headers.x-api-key',
      'body.password',
      'body.token',
      'body.refreshToken',
      
      // PII - Personal Identifiable Information
      'email',
      'phone',
      'phoneNumber',
      'ssn',
      'socialSecurityNumber',
      'dateOfBirth',
      'dob',
      '*.email',
      '*.phone',
      '*.phoneNumber',
      '*.ssn',
      '*.dateOfBirth',
      '*.dob',
      'body.email',
      'body.phone',
      'body.phoneNumber',
      'user.email',
      'user.phone',
      
      // Financial data
      'creditCard',
      'cardNumber',
      'cvv',
      'cvc',
      'accountNumber',
      'routingNumber',
      'bankAccount',
      '*.creditCard',
      '*.cardNumber',
      '*.cvv',
      '*.cvc',
      '*.accountNumber',
      'body.creditCard',
      'body.cardNumber',
      'body.cvv',
      
      // Address info (partial PII)
      'address.street',
      'address.line1',
      'address.line2',
      '*.address.street',
    ],
    censor: '[REDACTED]',
  },

  // Custom serializers
  serializers: {
    error: pino.stdSerializers.err,
    request: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.routeOptions?.url || req.url,
      parameters: req.params,
      headers: {
        'x-request-id': req.headers?.['x-request-id'],
        'x-correlation-id': req.headers?.['x-correlation-id'],
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
      },
      // Get venueId from trusted source (venueContext), not from headers
      venueId: req.venueContext?.venueId || req.user?.venueId,
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort || 0,
    }),
    response: (res) => ({
      statusCode: res.statusCode,
      // Don't log all headers - could contain sensitive data
      contentType: res.getHeader?.('content-type'),
    }),
  },

  // Base properties for all logs
  base: {
    service: 'api-gateway',
    environment: config.environment,
    version: process.env.npm_package_version,
  },
});

// Child logger factory for specific contexts
export const createLogger = (context: string) => {
  return logger.child({ context });
};

// Request logger factory
export const createRequestLogger = (requestId: string, venueId?: string) => {
  return logger.child({
    requestId,
    venueId,
  });
};

// Audit logger for security events
export const auditLogger = logger.child({
  context: 'audit',
  type: 'security',
});

// Performance logger for metrics
export const performanceLogger = logger.child({
  context: 'performance',
  type: 'metrics',
});

// Helper functions for common log patterns
export const logSecurityEvent = (
  event: string,
  details: Record<string, any>,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
) => {
  auditLogger.warn({
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...details,
  }, `Security event: ${event}`);
};

export const logPerformanceMetric = (
  metric: string,
  value: number,
  unit: string,
  tags: Record<string, string> = {}
) => {
  performanceLogger.info({
    metric,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString(),
  }, `Performance metric: ${metric}`);
};

// Error logging with context
export const logError = (
  error: Error,
  context: string,
  additional: Record<string, any> = {}
) => {
  logger.error({
    error: {
      message: (error as any).message,
      stack: error.stack,
      name: error.name,
    },
    context,
    ...additional,
  }, `Error in ${context}: ${(error as any).message}`);
};

// Request/Response logging helpers
// SECURITY: Get venueId from trusted request context, not headers
export const logRequest = (req: any) => {
  const venueId = req.venueContext?.venueId || req.user?.venueId;
  const requestLogger = createRequestLogger(req.id, venueId);

  requestLogger.info({
    request: req,
    timestamp: new Date().toISOString(),
  }, `${req.method} ${req.url}`);
};

export const logResponse = (req: any, reply: FastifyReply, responseTime: number) => {
  const venueId = req.venueContext?.venueId || req.user?.venueId;
  const requestLogger = createRequestLogger(req.id, venueId);

  const logData = {
    request: req,
    response: reply,
    responseTime,
    timestamp: new Date().toISOString(),
  };

  if (reply.statusCode >= 500) {
    requestLogger.error(logData, `${req.method} ${req.url} - ${reply.statusCode}`);
  } else if (reply.statusCode >= 400) {
    requestLogger.warn(logData, `${req.method} ${req.url} - ${reply.statusCode}`);
  } else {
    requestLogger.info(logData, `${req.method} ${req.url} - ${reply.statusCode}`);
  }
};
