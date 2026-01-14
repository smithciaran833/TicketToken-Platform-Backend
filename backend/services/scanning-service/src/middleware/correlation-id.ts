import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * Correlation ID Middleware
 * 
 * Fixes ERR-2: Adds correlation ID implementation
 * Fixes LOG-2: Adds correlation ID middleware
 * Fixes LOG-3: Enables context propagation across services
 * 
 * The correlation ID follows requests across service boundaries
 * for distributed tracing and debugging.
 */

// Header names for correlation ID (support multiple naming conventions)
const CORRELATION_ID_HEADERS = [
  'x-correlation-id',
  'x-request-id',
  'x-trace-id',
  'traceparent',  // W3C Trace Context
];

// Response header name
const RESPONSE_HEADER = 'x-correlation-id';

/**
 * Generate a unique correlation ID
 * Uses UUID v4 format for compatibility with tracing systems
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Extract correlation ID from request headers
 * Supports multiple header naming conventions
 */
export function extractCorrelationId(request: FastifyRequest): string | undefined {
  for (const header of CORRELATION_ID_HEADERS) {
    const value = request.headers[header];
    if (value) {
      // Handle array case (multiple headers with same name)
      const id = Array.isArray(value) ? value[0] : value;
      // For traceparent, extract the trace-id portion
      if (header === 'traceparent' && id.includes('-')) {
        const parts = id.split('-');
        return parts[1] || id; // trace-id is the second part
      }
      return id;
    }
  }
  return undefined;
}

/**
 * Validate correlation ID format
 * Accepts UUID, hex strings, and alphanumeric IDs
 */
export function isValidCorrelationId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Must be between 8-128 characters, alphanumeric with hyphens
  const pattern = /^[a-zA-Z0-9-]{8,128}$/;
  return pattern.test(id);
}

/**
 * Correlation ID middleware for Fastify
 * Extracts or generates correlation ID and attaches to request/response
 */
export async function correlationIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try to extract existing correlation ID from incoming request
  let correlationId = extractCorrelationId(request);
  
  // Validate the correlation ID if present
  if (correlationId && !isValidCorrelationId(correlationId)) {
    logger.warn('Invalid correlation ID received, generating new one', {
      receivedId: correlationId?.substring(0, 20), // Log only prefix for safety
    });
    correlationId = undefined;
  }
  
  // Generate new ID if not present or invalid
  if (!correlationId) {
    correlationId = generateCorrelationId();
  }
  
  // Attach to request for downstream handlers
  request.correlationId = correlationId;
  
  // Set response header for client-side tracing
  reply.header(RESPONSE_HEADER, correlationId);
}

/**
 * Register correlation ID hook as a Fastify plugin
 */
export async function registerCorrelationIdMiddleware(fastify: FastifyInstance): Promise<void> {
  // Add hook to run on every request
  fastify.addHook('onRequest', correlationIdMiddleware);
  
  // Log with correlation ID on response
  fastify.addHook('onResponse', async (request, reply) => {
    // Only log for non-health endpoints
    if (!request.url.includes('/health') && !request.url.includes('/metrics')) {
      logger.debug('Request completed', {
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      });
    }
  });
}

/**
 * Create context object for passing to downstream services
 */
export function createServiceContext(request: FastifyRequest): ServiceContext {
  return {
    correlationId: request.correlationId || generateCorrelationId(),
    tenantId: request.tenantId,
    userId: request.user?.userId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Headers to propagate to downstream services
 */
export function getCorrelationHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  
  if (request.correlationId) {
    headers['x-correlation-id'] = request.correlationId;
  }
  
  if (request.tenantId) {
    headers['x-tenant-id'] = request.tenantId;
  }
  
  // Forward authorization if present (for service-to-service calls)
  const authHeader = request.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    headers['authorization'] = authHeader;
  }
  
  return headers;
}

/**
 * Service context for inter-service communication
 */
export interface ServiceContext {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  timestamp: string;
}

/**
 * Async local storage for correlation ID (for use in async contexts)
 * This allows accessing correlation ID without explicitly passing it
 */
import { AsyncLocalStorage } from 'async_hooks';

export const correlationStorage = new AsyncLocalStorage<{
  correlationId: string;
  tenantId?: string;
  userId?: string;
}>();

/**
 * Get correlation ID from current async context
 */
export function getCurrentCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

/**
 * Run function with correlation context
 */
export function runWithCorrelation<T>(
  context: { correlationId: string; tenantId?: string; userId?: string },
  fn: () => T
): T {
  return correlationStorage.run(context, fn);
}

/**
 * Enhanced logging with automatic correlation ID
 */
export function createCorrelatedLogger(baseLogger: typeof logger) {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      baseLogger.info(message, {
        ...meta,
        correlationId: meta?.correlationId || getCurrentCorrelationId(),
      });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      baseLogger.warn(message, {
        ...meta,
        correlationId: meta?.correlationId || getCurrentCorrelationId(),
      });
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      baseLogger.error(message, {
        ...meta,
        correlationId: meta?.correlationId || getCurrentCorrelationId(),
      });
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      baseLogger.debug(message, {
        ...meta,
        correlationId: meta?.correlationId || getCurrentCorrelationId(),
      });
    },
  };
}
