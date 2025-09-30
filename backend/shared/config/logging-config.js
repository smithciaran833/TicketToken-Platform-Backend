module.exports = {
  // Log levels by environment
  logLevels: {
    development: 'debug',
    staging: 'info',
    production: 'warn'
  },

  // Log aggregation points - what to log at each service point
  aggregationPoints: {
    // Service lifecycle
    serviceStart: ['service', 'version', 'environment', 'config'],
    serviceShutdown: ['service', 'uptime', 'reason'],
    
    // Request lifecycle
    requestStart: ['method', 'path', 'userId', 'traceId'],
    requestComplete: ['statusCode', 'duration', 'size'],
    
    // Database operations
    databaseQuery: ['operation', 'table', 'duration', 'rows'],
    databaseError: ['operation', 'error', 'query'],
    
    // External APIs
    apiCallStart: ['service', 'endpoint', 'method'],
    apiCallComplete: ['service', 'statusCode', 'duration'],
    
    // Business events
    orderCreated: ['orderId', 'userId', 'amount', 'items'],
    paymentProcessed: ['orderId', 'amount', 'provider', 'status'],
    ticketIssued: ['ticketId', 'eventId', 'userId'],
    ticketScanned: ['ticketId', 'deviceId', 'result'],
    
    // Security events
    loginAttempt: ['userId', 'ip', 'success'],
    authFailure: ['reason', 'ip', 'attempted_user'],
    permissionDenied: ['userId', 'resource', 'action'],
    
    // Performance events
    slowQuery: ['query', 'duration', 'threshold'],
    slowRequest: ['path', 'duration', 'threshold'],
    highMemory: ['usage', 'threshold'],
    
    // Error events
    unhandledException: ['error', 'stack', 'context'],
    validationError: ['field', 'value', 'rule'],
    businessRuleViolation: ['rule', 'context']
  },

  // Sensitive data to redact
  redactFields: [
    'password',
    'token',
    'secret',
    'creditCard',
    'cvv',
    'ssn',
    'apiKey',
    'authorization'
  ],

  // Log retention policies
  retention: {
    general: '14d',
    error: '30d',
    audit: '90d',
    security: '180d',
    performance: '7d'
  }
};
