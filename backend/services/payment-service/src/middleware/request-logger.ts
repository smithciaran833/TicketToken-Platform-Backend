import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends Request {
  id: string;
  startTime: number;
}

export const requestLogger = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
) => {
  // Assign unique request ID
  req.id = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Set request ID in response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Log request
  console.log('Incoming request:', {
    id: req.id,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    
    // Log response
    const duration = Date.now() - req.startTime;
    console.log('Outgoing response:', {
      id: req.id,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    // Set response time header
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    return res.send(data);
  };
  
  next();
};

// Performance monitoring
export const performanceMonitor = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
) => {
  const checkpoints: { [key: string]: number } = {
    start: Date.now()
  };
  
  // Add checkpoint function to request
  (req as any).checkpoint = (name: string) => {
    checkpoints[name] = Date.now();
  };
  
  // Log performance metrics on response
  res.on('finish', () => {
    const total = Date.now() - checkpoints.start;
    
    if (total > 1000) { // Log slow requests
      console.warn('Slow request detected:', {
        id: req.id,
        path: req.path,
        totalTime: `${total}ms`,
        checkpoints: Object.entries(checkpoints).map(([name, time]) => ({
          name,
          elapsed: `${time - checkpoints.start}ms`
        }))
      });
    }
  });
  
  next();
};
