/**
 * Request ID Middleware for Compliance Service
 * 
 * AUDIT FIX ERR-4, LOG-2: No correlation ID
 * 
 * Generates or propagates request IDs for tracing requests
 * across service boundaries.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const TRACE_ID_HEADER = 'x-trace-id';

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Request ID middleware
 * 
 * Extracts or generates a unique request ID for each request.
 * The ID is propagated in response headers for client tracking.
 */
export function requestIdMiddleware(options?: {
  /** Custom header name */
  headerName?: string;
  /** ID generator function */
  generator?: () => string;
  /** Whether to trust incoming request IDs */
  trustProxy?: boolean;
  /** Prefix for generated IDs */
  prefix?: string;
}): (req: Request, res: Response, next: NextFunction) => void {
  const headerName = options?.headerName ?? REQUEST_ID_HEADER;
  const generator = options?.generator ?? generateRequestId;
  const trustProxy = options?.trustProxy ?? true;
  const prefix = options?.prefix ?? 'compliance';

  return (req: Request, res: Response, next: NextFunction): void => {
    // Try to get request ID from headers (for service-to-service calls)
    let requestId: string | undefined;

    if (trustProxy) {
      requestId = 
        (req.headers[REQUEST_ID_HEADER] as string) ||
        (req.headers[CORRELATION_ID_HEADER] as string) ||
        (req.headers[TRACE_ID_HEADER] as string);
    }

    // Generate new ID if not provided
    if (!requestId) {
      requestId = generator();
      if (prefix) {
        requestId = `${prefix}-${requestId}`;
      }
    }

    // Store in request
    req.requestId = requestId;

    // Set response headers
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, requestId);

    next();
  };
}

// =============================================================================
// ID GENERATORS
// =============================================================================

/**
 * Generate a unique request ID using UUID v4
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Generate a short request ID (8 characters)
 */
export function generateShortRequestId(): string {
  return randomUUID().split('-')[0];
}

/**
 * Generate a timestamp-based request ID
 */
export function generateTimestampRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string {
  return req.requestId || 'unknown';
}

/**
 * Create headers with request ID for outgoing requests
 */
export function createCorrelationHeaders(requestId: string): Record<string, string> {
  return {
    [REQUEST_ID_HEADER]: requestId,
    [CORRELATION_ID_HEADER]: requestId,
    [TRACE_ID_HEADER]: requestId
  };
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  requestIdMiddleware,
  generateRequestId,
  generateShortRequestId,
  generateTimestampRequestId,
  getRequestId,
  createCorrelationHeaders
};
