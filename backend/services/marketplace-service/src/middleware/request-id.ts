/**
 * Request ID Middleware for Marketplace Service
 * 
 * Issues Fixed:
 * - LOG-3: No request ID handling → Unique request IDs for all requests
 * - S2S-6: No request ID propagation → IDs propagated to downstream services
 * - ERR-1: Error logging missing context → Request ID in all errors
 * 
 * Features:
 * - Generates unique request IDs if not provided
 * - Accepts incoming X-Request-ID from upstream
 * - Propagates IDs to downstream services
 * - Adds ID to response headers
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

// Header name for request ID
export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    correlationId?: string;
  }
}

// Async local storage for request context
interface RequestContext {
  requestId: string;
  correlationId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  // Format: timestamp-uuid fragment for sortability + uniqueness
  const timestamp = Date.now().toString(36);
  const uuid = randomUUID().split('-')[0]; // First segment of UUID
  return `${timestamp}-${uuid}`;
}

/**
 * Extract request ID from incoming request headers
 */
export function extractRequestId(request: FastifyRequest): string {
  // Check multiple possible headers (lowercase for Fastify)
  const headers = request.headers;
  
  const existingId = 
    headers[REQUEST_ID_HEADER] ||
    headers['request-id'] ||
    headers[CORRELATION_ID_HEADER] ||
    headers['trace-id'] ||
    headers['x-trace-id'];
  
  if (typeof existingId === 'string' && existingId.length > 0 && existingId.length <= 128) {
    return existingId;
  }
  
  return generateRequestId();
}

/**
 * AUDIT FIX LOG-3/S2S-6: Request ID middleware
 */
export function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Extract or generate request ID
  const requestId = extractRequestId(request);
  
  // Attach to request object
  request.requestId = requestId;
  
  // Also check for correlation ID (for distributed tracing)
  const correlationId = request.headers[CORRELATION_ID_HEADER];
  if (typeof correlationId === 'string') {
    request.correlationId = correlationId;
  }
  
  // Add to response headers so clients can reference it
  reply.header(REQUEST_ID_HEADER, requestId);
  
  if (request.correlationId) {
    reply.header(CORRELATION_ID_HEADER, request.correlationId);
  }
  
  done();
}

/**
 * Fastify plugin version for request ID middleware
 */
export async function requestIdPlugin(fastify: any, options: any = {}): Promise<void> {
  // Add request ID to all requests
  fastify.addHook('onRequest', requestIdMiddleware);
  
  // Ensure request ID is in all logs
  fastify.addHook('preHandler', (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
    // Ensure requestId is accessible in log context
    if (request.log) {
      (request as any).log = request.log.child({ 
        requestId: request.requestId,
        correlationId: request.correlationId
      });
    }
    done();
  });
}

/**
 * Get headers to propagate to downstream services
 */
export function getPropagationHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {
    [REQUEST_ID_HEADER]: request.requestId
  };
  
  if (request.correlationId) {
    headers[CORRELATION_ID_HEADER] = request.correlationId;
  }
  
  return headers;
}

/**
 * Utility to create fetch options with propagated headers
 */
export function withRequestId(
  request: FastifyRequest,
  options: RequestInit = {}
): RequestInit {
  const propagationHeaders = getPropagationHeaders(request);
  
  return {
    ...options,
    headers: {
      ...propagationHeaders,
      ...(options.headers || {})
    }
  };
}

/**
 * Run a function with request context (for async operations)
 */
export function runWithRequestContext<T>(
  requestId: string,
  fn: () => T,
  correlationId?: string
): T {
  return asyncLocalStorage.run({ requestId, correlationId }, fn);
}

/**
 * Get current request ID from async context
 */
export function getCurrentRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

/**
 * Get current correlation ID from async context
 */
export function getCurrentCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}

/**
 * Get current request context
 */
export function getCurrentRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}
