const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { v4: uuidv4 } = require('uuid');

class StructuredLogger {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.logger = this.createLogger(options);
    this.auditLogger = this.createAuditLogger(options);
  }

  createLogger(options) {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const transports = [
      // Console transport with color
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(info => {
            const { timestamp, level, message, service, traceId, ...rest } = info;
            const trace = traceId ? ` [${traceId}]` : '';
            return `${timestamp} ${level} [${service}]${trace}: ${message} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`;
          })
        )
      }),

      // Daily rotate file for all logs
      new DailyRotateFile({
        filename: `logs/${this.serviceName}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat
      }),

      // Separate error log file
      new DailyRotateFile({
        filename: `logs/${this.serviceName}-error-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        level: 'error',
        format: logFormat
      })
    ];

    // Add performance log for slow operations
    if (options.enablePerformanceLog) {
      transports.push(new DailyRotateFile({
        filename: `logs/${this.serviceName}-performance-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '7d',
        format: logFormat
      }));
    }

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { 
        service: this.serviceName,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.SERVICE_VERSION || '1.0.0'
      },
      transports
    });
  }

  createAuditLogger(options) {
    // Separate audit logger for compliance
    return winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: {
        service: this.serviceName,
        type: 'audit'
      },
      transports: [
        new DailyRotateFile({
          filename: `logs/audit/${this.serviceName}-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '90d', // Keep audit logs for 90 days
          format: winston.format.json()
        })
      ]
    });
  }

  // Middleware to add logging context to requests
  middleware() {
    return (req, res, next) => {
      // Add request context
      req.logContext = {
        requestId: req.requestId || uuidv4(),
        traceId: req.traceId || req.headers['x-trace-id'],
        spanId: req.spanId,
        userId: req.user?.id,
        tenantId: req.tenantId,
        sessionId: req.sessionID,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        path: req.path,
        query: req.query,
        timestamp: new Date().toISOString()
      };

      // Create request-scoped logger
      req.log = {
        info: (message, meta = {}) => {
          this.logger.info(message, { ...req.logContext, ...meta });
        },
        error: (message, meta = {}) => {
          this.logger.error(message, { ...req.logContext, ...meta });
        },
        warn: (message, meta = {}) => {
          this.logger.warn(message, { ...req.logContext, ...meta });
        },
        debug: (message, meta = {}) => {
          this.logger.debug(message, { ...req.logContext, ...meta });
        },
        audit: (action, meta = {}) => {
          this.auditLogger.info(action, { 
            ...req.logContext, 
            action,
            timestamp: new Date().toISOString(),
            ...meta 
          });
        },
        performance: (operation, duration, meta = {}) => {
          const logData = {
            ...req.logContext,
            operation,
            duration,
            ...meta
          };
          
          // Log as warning if slow
          if (duration > 1000) {
            this.logger.warn(`Slow operation: ${operation}`, logData);
          } else {
            this.logger.info(`Operation completed: ${operation}`, logData);
          }
        }
      };

      // Log request start
      this.logger.info('Request started', req.logContext);

      // Log response when finished
      const startTime = Date.now();
      const originalEnd = res.end;
      res.end = (...args) => {
        const duration = Date.now() - startTime;
        
        this.logger.info('Request completed', {
          ...req.logContext,
          statusCode: res.statusCode,
          duration,
          responseSize: res.get('content-length') || 0
        });

        // Log slow requests
        if (duration > 1000) {
          this.logger.warn('Slow request', {
            ...req.logContext,
            statusCode: res.statusCode,
            duration
          });
        }

        return originalEnd.apply(res, args);
      };

      next();
    };
  }

  // Log aggregation points for different service operations
  logDatabaseQuery(query, duration, success, context = {}) {
    const logData = {
      type: 'database',
      query: query.substring(0, 500), // Truncate long queries
      duration,
      success,
      ...context
    };

    if (!success) {
      this.logger.error('Database query failed', logData);
    } else if (duration > 500) {
      this.logger.warn('Slow database query', logData);
    } else {
      this.logger.debug('Database query executed', logData);
    }
  }

  logExternalAPICall(url, method, duration, statusCode, context = {}) {
    const logData = {
      type: 'external_api',
      url,
      method,
      duration,
      statusCode,
      ...context
    };

    if (statusCode >= 500) {
      this.logger.error('External API error', logData);
    } else if (statusCode >= 400) {
      this.logger.warn('External API client error', logData);
    } else if (duration > 2000) {
      this.logger.warn('Slow external API call', logData);
    } else {
      this.logger.info('External API call completed', logData);
    }
  }

  logBusinessEvent(event, metadata = {}) {
    this.logger.info('Business event', {
      type: 'business_event',
      event,
      ...metadata
    });
  }

  logSecurityEvent(event, severity, metadata = {}) {
    const logData = {
      type: 'security_event',
      event,
      severity,
      ...metadata
    };

    if (severity === 'critical') {
      this.logger.error('Security event', logData);
      this.auditLogger.error('Security event', logData);
    } else {
      this.logger.warn('Security event', logData);
      this.auditLogger.warn('Security event', logData);
    }
  }

  // Get the underlying logger
  getLogger() {
    return this.logger;
  }

  getAuditLogger() {
    return this.auditLogger;
  }
}

module.exports = StructuredLogger;
