import { Request, Response, NextFunction } from 'express';

interface RequestMetrics {
  totalRequests: number;
  requestsByEndpoint: Map<string, number>;
  requestsByStatus: Map<number, number>;
  averageResponseTime: number;
}

const metrics: RequestMetrics = {
  totalRequests: 0,
  requestsByEndpoint: new Map(),
  requestsByStatus: new Map(),
  averageResponseTime: 0
};

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Update metrics
    metrics.totalRequests++;
    
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    metrics.requestsByEndpoint.set(
      endpoint,
      (metrics.requestsByEndpoint.get(endpoint) || 0) + 1
    );
    
    metrics.requestsByStatus.set(
      res.statusCode,
      (metrics.requestsByStatus.get(res.statusCode) || 0) + 1
    );
    
    // Update average response time
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + duration) / 
      metrics.totalRequests;
  });
  
  next();
}

export function getMetrics(): RequestMetrics {
  return metrics;
}
