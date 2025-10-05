import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware
 */
export function loggingMiddleware(logger: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Log request
    logger.info({
      type: 'request',
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info({
        type: 'response',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`
      });
    });
    
    next();
  };
}

/**
 * Error logging middleware
 */
export function errorLoggingMiddleware(logger: any) {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error({
      type: 'error',
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack
    });
    next(err);
  };
}
