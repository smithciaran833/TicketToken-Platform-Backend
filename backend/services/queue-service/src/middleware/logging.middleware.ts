import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  
  // Log request
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
      duration: `${duration}ms`
    });
  });
  
  next();
}
