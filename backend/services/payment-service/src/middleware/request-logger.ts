import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RequestLogger' });

export interface RequestWithId extends FastifyRequest {
  id: string;
  startTime: number;
}

export const requestLogger = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Assign unique request ID
  const reqId = request.headers['x-request-id'] as string || uuidv4();
  (request as any).id = reqId;
  (request as any).startTime = Date.now();
  
  // Set request ID in response headers
  reply.header('X-Request-ID', reqId);
  
  // Log request
  log.info('Incoming request', {
    id: reqId,
    method: request.method,
    path: request.url,
    query: request.query,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  });
  
  // Log response after it's sent
  reply.raw.on('finish', () => {
    const duration = Date.now() - (request as any).startTime;
    log.info('Outgoing response', {
      id: reqId,
      statusCode: reply.statusCode,
      duration
    });
    
    // Set response time header
    reply.header('X-Response-Time', `${duration}ms`);
  });
};

// Performance monitoring
export const performanceMonitor = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const checkpoints: { [key: string]: number } = {
    start: Date.now()
  };
  
  // Add checkpoint function to request
  (request as any).checkpoint = (name: string) => {
    checkpoints[name] = Date.now();
  };
  
  // Log performance metrics on response
  reply.raw.on('finish', () => {
    const total = Date.now() - checkpoints.start;
    const reqId = (request as any).id;
    
    if (total > 1000) { // Log slow requests
      log.warn('Slow request detected', {
        id: reqId,
        path: request.url,
        totalTime: total,
        checkpoints: Object.entries(checkpoints).map(([name, time]) => ({
          name,
          elapsed: time - checkpoints.start
        }))
      });
    }
  });
};
