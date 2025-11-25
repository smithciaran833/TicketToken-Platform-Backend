/**
 * Request ID Middleware
 * Generates unique request IDs for tracing requests across services
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to add unique request ID to each request
 * - Checks for existing X-Request-ID header (from API gateway or client)
 * - Generates new UUID v4 if not present
 * - Adds ID to request object and response header
 * - Enables request tracing across distributed services
 */
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check if request ID already exists in header (from upstream service/gateway)
  const existingRequestId = request.headers['x-request-id'] as string;
  
  // Use existing ID or generate new one
  const requestId = existingRequestId || uuidv4();
  
  // Attach to request object for use in handlers
  (request as any).id = requestId;
  
  // Add to response header for client/downstream services
  reply.header('X-Request-ID', requestId);
}

/**
 * Get request ID from Fastify request
 * @param request Fastify request object
 * @returns Request ID string
 */
export function getRequestId(request: FastifyRequest): string {
  return (request as any).id || 'unknown';
}

/**
 * Middleware to log request details with ID
 * Use after requestIdMiddleware
 */
export async function requestLoggerMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const start = Date.now();
  
  // Log when response finishes
  reply.raw.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId: (request as any).id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userAgent: request.headers['user-agent'],
      ip: request.ip
    };
    
    // Log level based on status code
    if (reply.statusCode >= 500) {
      console.error('Request error:', logData);
    } else if (reply.statusCode >= 400) {
      console.warn('Request warning:', logData);
    } else {
      console.log('Request completed:', logData);
    }
  });
}
