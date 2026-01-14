/**
 * Request ID Middleware for Integration Service
 * 
 * AUDIT FIX LOG-1: Request ID middleware not registered
 * 
 * Ensures every request has a unique, traceable request ID for:
 * - Distributed tracing
 * - Log correlation
 * - Error tracking
 * - Debugging across services
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

// Regex to validate UUID format
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// FASTIFY TYPE EXTENSIONS
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    id: string;
    correlationId?: string;
    startTime?: number;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate and sanitize request ID
 * Returns null if invalid, sanitized ID if valid
 */
function validateRequestId(id: string | undefined): string | null {
  if (!id) return null;
  
  // Trim and convert to lowercase
  const sanitized = id.trim().toLowerCase();
  
  // Check length (max 64 chars to prevent header abuse)
  if (sanitized.length > 64 || sanitized.length < 8) return null;
  
  // Check for valid characters (alphanumeric, dashes, underscores)
  if (!/^[a-z0-9_-]+$/i.test(sanitized)) return null;
  
  return sanitized;
}

/**
 * Generate a new request ID
 */
function generateRequestId(): string {
  return randomUUID();
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Request ID middleware
 * AUDIT FIX LOG-1: Ensure all requests have traceable IDs
 */
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Record start time for duration tracking
  request.startTime = Date.now();
  
  // Get or generate request ID
  const incomingId = request.headers[REQUEST_ID_HEADER] as string | undefined;
  const validatedId = validateRequestId(incomingId);
  
  // Use validated incoming ID or generate new one
  const requestId = validatedId || generateRequestId();
  
  // Set on request object (Fastify will use this)
  request.id = requestId;
  
  // Get or propagate correlation ID (for tracing across services)
  const incomingCorrelationId = request.headers[CORRELATION_ID_HEADER] as string | undefined;
  const correlationId = validateRequestId(incomingCorrelationId) || requestId;
  request.correlationId = correlationId;
  
  // Set response headers
  reply.header(REQUEST_ID_HEADER, requestId);
  reply.header(CORRELATION_ID_HEADER, correlationId);
}

/**
 * Get request duration in milliseconds
 */
export function getRequestDuration(request: FastifyRequest): number {
  if (!request.startTime) return 0;
  return Date.now() - request.startTime;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  requestIdMiddleware,
  getRequestDuration,
  REQUEST_ID_HEADER,
  CORRELATION_ID_HEADER
};
