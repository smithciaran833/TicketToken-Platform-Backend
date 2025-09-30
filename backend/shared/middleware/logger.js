const { v4: uuidv4 } = require('uuid');

class StructuredLogger {
  constructor(serviceName) {
    this.serviceName = serviceName;
  }

  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...meta
    };
    
    console.log(JSON.stringify(logEntry));
  }

  info(message, meta) {
    this.log('INFO', message, meta);
  }

  error(message, meta) {
    this.log('ERROR', message, meta);
  }

  warn(message, meta) {
    this.log('WARN', message, meta);
  }

  debug(message, meta) {
    this.log('DEBUG', message, meta);
  }
}

// Request ID middleware
function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  req.tenantId = req.headers['x-tenant-id'];
  req.userId = req.headers['x-user-id'];
  
  res.setHeader('X-Request-Id', req.requestId);
  
  // Add to request for logging
  req.log = {
    requestId: req.requestId,
    tenantId: req.tenantId,
    userId: req.userId,
    method: req.method,
    path: req.path
  };
  
  next();
}

module.exports = {
  StructuredLogger,
  requestIdMiddleware
};
