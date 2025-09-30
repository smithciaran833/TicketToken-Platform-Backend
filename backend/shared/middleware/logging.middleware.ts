import { Request, Response, NextFunction } from 'express';
import { PIISanitizer } from '../utils/pii-sanitizer';

/**
 * Express middleware for request/response logging with PII sanitization
 */
export function loggingMiddleware(logger: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log incoming request (sanitized)
    logger.info('Incoming request', {
      request: PIISanitizer.sanitizeRequest(req),
      timestamp: new Date().toISOString()
    });

    // Capture the original res.json and res.send
    const originalJson = res.json;
    const originalSend = res.send;

    // Override res.json
    res.json = function(body: any) {
      res.locals.body = body;
      return originalJson.call(this, body);
    };

    // Override res.send
    res.send = function(body: any) {
      res.locals.body = body;
      return originalSend.call(this, body);
    };

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.info('Response sent', {
        request: {
          method: req.method,
          url: req.url,
          id: (req as any).id
        },
        response: {
          statusCode: res.statusCode,
          // Only log response body for errors or debug mode
          ...(res.statusCode >= 400 || process.env.LOG_LEVEL === 'debug' 
            ? { body: PIISanitizer.sanitize(res.locals.body) }
            : {}
          )
        },
        duration: `${duration}ms`
      });
    });

    next();
  };
}

/**
 * Error logging middleware with PII sanitization
 */
export function errorLoggingMiddleware(logger: any) {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Request error', {
      error: PIISanitizer.sanitize({
        name: err.name,
        message: err.message,
        stack: err.stack
      }),
      request: {
        method: req.method,
        url: req.url,
        id: (req as any).id
      }
    });

    next(err);
  };
}
