import { FastifyRequest, FastifyReply } from 'fastify';
import { logger, createRequestLogger } from '../utils/logger';

/**
 * Distributed tracing middleware for order service
 * Adds trace IDs to requests and logs for end-to-end request tracking
 */
export async function tracingMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Extract or generate trace ID
  const traceId = request.headers['x-trace-id'] as string || 
                  request.headers['x-request-id'] as string ||
                  `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Extract parent span ID if exists
  const parentSpanId = request.headers['x-parent-span-id'] as string;
  
  // Generate span ID for this service
  const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Store trace context in request
  request.traceContext = {
    traceId,
    spanId,
    parentSpanId,
    serviceName: 'order-service',
    startTime: Date.now(),
  };
  
  // Add trace headers to response
  reply.header('x-trace-id', traceId);
  reply.header('x-span-id', spanId);
  
  // Create request-scoped logger with correlation context
  // Note: This will be available after tenant/user middleware runs
  (request as any).log = createRequestLogger(request);
  
  // Log request with trace context
  logger.info('Incoming request', {
    traceId,
    spanId,
    parentSpanId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  });
  
  // Capture response timing
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - request.traceContext.startTime;
    
    logger.info('Outgoing response', {
      traceId: request.traceContext.traceId,
      spanId: request.traceContext.spanId,
      statusCode: reply.statusCode,
      duration,
      method: request.method,
      url: request.url,
    });
    
    // Add duration header
    reply.header('x-response-time', duration.toString());
    
    return payload;
  });
}

// Declare traceContext type extension
declare module 'fastify' {
  interface FastifyRequest {
    traceContext: {
      traceId: string;
      spanId: string;
      parentSpanId?: string;
      serviceName: string;
      startTime: number;
    };
  }
}
