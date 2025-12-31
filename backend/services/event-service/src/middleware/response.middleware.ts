/**
 * Response Middleware
 * 
 * AUDIT FIX (LOW): Response headers and request ID propagation
 * 
 * This middleware handles:
 * - Adding X-Request-ID header to all responses (GROUP 1)
 * - Adding Cache-Control: no-store to mutation responses (GROUP 2)
 * - Adding server_time to responses (optional)
 */
import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

/**
 * Mutation HTTP methods that should not be cached
 */
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * onSend hook to add X-Request-ID header to all responses.
 * 
 * AUDIT FIX (RL9/HR4): Ensures request ID is always in response headers,
 * not just error responses. This enables request tracing through
 * load balancers, CDNs, and client applications.
 */
export async function addRequestIdHeader(
  request: FastifyRequest,
  reply: FastifyReply,
  _payload: any
): Promise<void> {
  // Add X-Request-ID header if not already present
  if (!reply.hasHeader('X-Request-ID')) {
    reply.header('X-Request-ID', request.id);
  }
}

/**
 * onSend hook to add Cache-Control: no-store to mutation responses.
 * 
 * AUDIT FIX (HR5): Prevents caching of mutation responses.
 * This is important for:
 * - Preventing stale data after mutations
 * - Security (sensitive operation results shouldn't be cached)
 * - Idempotency (ensures fresh responses)
 */
export async function addNoCacheHeader(
  request: FastifyRequest,
  reply: FastifyReply,
  _payload: any
): Promise<void> {
  // Add Cache-Control: no-store for mutation methods
  if (MUTATION_METHODS.includes(request.method.toUpperCase())) {
    if (!reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}

/**
 * Combined onSend hook for all response header modifications.
 * Use this single hook instead of registering multiple hooks.
 */
export async function responseHeadersHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  // Add X-Request-ID header
  if (!reply.hasHeader('X-Request-ID')) {
    reply.header('X-Request-ID', request.id);
  }
  
  // Add Cache-Control: no-store for mutations
  if (MUTATION_METHODS.includes(request.method.toUpperCase())) {
    if (!reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
  
  return payload;
}

/**
 * Register all response middleware hooks on a Fastify instance.
 * 
 * Usage:
 * ```typescript
 * import { registerResponseMiddleware } from './middleware/response.middleware';
 * registerResponseMiddleware(app);
 * ```
 */
export function registerResponseMiddleware(app: FastifyInstance): void {
  // Single combined hook for efficiency
  app.addHook('onSend', responseHeadersHook);
}

/**
 * Helper to create a standardized success response with request metadata.
 * Use this in controllers for consistent response format.
 * 
 * @param request - Fastify request
 * @param data - Response data
 * @param meta - Optional additional metadata
 * @returns Standardized response object
 */
export function createSuccessResponse<T>(
  request: FastifyRequest,
  data: T,
  meta?: Record<string, unknown>
): {
  success: boolean;
  data: T;
  requestId: string;
  serverTime: string;
  meta?: Record<string, unknown>;
} {
  return {
    success: true,
    data,
    requestId: request.id as string,
    serverTime: new Date().toISOString(),
    ...(meta && { meta }),
  };
}

/**
 * Helper to create a standardized list response with pagination and request metadata.
 * 
 * @param request - Fastify request
 * @param items - Array of items
 * @param pagination - Pagination info (total, limit, offset)
 * @returns Standardized list response
 */
export function createListResponse<T>(
  request: FastifyRequest,
  items: T[],
  pagination: {
    total: number;
    limit: number;
    offset: number;
  }
): {
  success: boolean;
  data: T[];
  requestId: string;
  serverTime: string;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
} {
  return {
    success: true,
    data: items,
    requestId: request.id as string,
    serverTime: new Date().toISOString(),
    pagination: {
      ...pagination,
      hasMore: pagination.offset + items.length < pagination.total,
    },
  };
}
