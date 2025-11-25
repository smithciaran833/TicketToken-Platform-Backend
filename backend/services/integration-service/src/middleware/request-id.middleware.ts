/**
 * Request ID Correlation Middleware
 * 
 * Generates and tracks unique request IDs across the entire request lifecycle
 * for improved debugging, logging, and tracing
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    id: string;
    requestId: string;
  }
}

export interface RequestMetadata {
  requestId: string;
  timestamp: number;
  method: string;
  url: string;
  userAgent?: string;
  userId?: string;
  venueId?: string;
}

/**
 * Request ID middleware
 * Generates or extracts request ID and attaches it to the request
 */
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract request ID from header or generate new one
  const requestId = 
    (request.headers['x-request-id'] as string) ||
    (request.headers['x-correlation-id'] as string) ||
    randomUUID();

  // Attach to request object
  request.requestId = requestId;
  request.id = requestId;

  // Add to response headers for client tracking
  reply.header('X-Request-ID', requestId);
  reply.header('X-Correlation-ID', requestId);

  // Store metadata for logging
  const metadata: RequestMetadata = {
    requestId,
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    userId: request.user?.id,
    venueId: request.user?.venueId,
  };

  // Attach metadata to request for access in routes
  (request as any).metadata = metadata;
}

/**
 * Get request ID from context
 */
export function getRequestId(request: FastifyRequest): string {
  return request.requestId || request.id || 'unknown';
}

/**
 * Get request metadata
 */
export function getRequestMetadata(request: FastifyRequest): RequestMetadata | undefined {
  return (request as any).metadata;
}
