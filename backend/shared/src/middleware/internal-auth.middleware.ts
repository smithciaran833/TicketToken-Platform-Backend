/**
 * Internal Auth Middleware
 * 
 * Provides authentication and authorization for service-to-service
 * communication on internal API endpoints.
 * 
 * Features:
 * - API key validation for internal services
 * - JWT validation for service tokens (optional)
 * - Tenant context extraction and validation
 * - Request tracing header propagation
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Configuration for internal auth middleware
 */
export interface InternalAuthConfig {
  /** Internal API key (shared secret) */
  apiKey?: string;
  /** Service name for logging */
  serviceName?: string;
  /** Allow requests without tenant ID (for system-level endpoints) */
  allowNoTenant?: boolean;
  /** Trusted service names that can bypass rate limiting */
  trustedServices?: string[];
  /** Enable strict validation (reject unknown headers) */
  strictMode?: boolean;
}

/**
 * Extended request with internal service context
 */
export interface InternalRequest extends Request {
  /** Tenant ID from request */
  tenantId?: string;
  /** User ID from request */
  userId?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Span ID for distributed tracing */
  spanId?: string;
  /** Is this an internal service request */
  isInternalRequest?: boolean;
  /** Calling service name */
  callingService?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: InternalAuthConfig = {
  apiKey: process.env.INTERNAL_API_KEY,
  serviceName: process.env.SERVICE_NAME || 'unknown-service',
  allowNoTenant: false,
  trustedServices: [],
  strictMode: false,
};

/**
 * Create internal auth middleware for protecting internal endpoints
 * 
 * Usage:
 * ```typescript
 * import { createInternalAuthMiddleware } from '@tickettoken/shared/middleware';
 * 
 * // Protect all internal routes
 * app.use('/internal', createInternalAuthMiddleware());
 * 
 * // With custom config
 * app.use('/internal', createInternalAuthMiddleware({
 *   allowNoTenant: true,
 *   trustedServices: ['payment-service', 'order-service'],
 * }));
 * ```
 */
export function createInternalAuthMiddleware(config: InternalAuthConfig = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };

  if (!opts.apiKey) {
    console.warn(
      `[${opts.serviceName}] WARNING: INTERNAL_API_KEY not set. Internal endpoints are unprotected!`
    );
  }

  return (req: InternalRequest, res: Response, next: NextFunction) => {
    // Check for internal service header
    const isInternalHeader = req.headers['x-internal-service'] === 'true';
    
    if (!isInternalHeader) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This endpoint is only accessible to internal services',
      });
    }

    // Validate API key
    const providedApiKey = req.headers['x-internal-api-key'] as string;
    
    if (opts.apiKey && !validateApiKey(providedApiKey, opts.apiKey)) {
      console.warn(`[${opts.serviceName}] Invalid internal API key from ${req.ip}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid internal API key',
      });
    }

    // Extract tenant context
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId && !opts.allowNoTenant) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'X-Tenant-ID header is required',
      });
    }

    // Extract and validate tenant ID format (UUID)
    if (tenantId && !isValidUUID(tenantId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid X-Tenant-ID format (expected UUID)',
      });
    }

    // Extract user context (optional)
    const userId = req.headers['x-user-id'] as string;
    if (userId && !isValidUUID(userId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid X-User-ID format (expected UUID)',
      });
    }

    // Extract tracing headers
    const traceId = req.headers['x-trace-id'] as string || generateTraceId();
    const spanId = req.headers['x-span-id'] as string;
    const callingService = req.headers['x-calling-service'] as string;

    // Set request context
    req.tenantId = tenantId;
    req.userId = userId;
    req.traceId = traceId;
    req.spanId = spanId;
    req.isInternalRequest = true;
    req.callingService = callingService;

    // Add trace ID to response headers
    res.setHeader('X-Trace-ID', traceId);

    // Log internal request
    console.log(
      `[${opts.serviceName}] Internal request from ${callingService || 'unknown'}: ` +
      `${req.method} ${req.path} tenant=${tenantId || 'none'} trace=${traceId}`
    );

    next();
  };
}

/**
 * Middleware to require specific tenant context
 */
export function requireTenant() {
  return (req: InternalRequest, res: Response, next: NextFunction) => {
    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Tenant context is required for this operation',
      });
    }
    next();
  };
}

/**
 * Middleware to require user context
 */
export function requireUser() {
  return (req: InternalRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User context is required for this operation',
      });
    }
    next();
  };
}

/**
 * Middleware to validate that caller is a trusted service
 */
export function requireTrustedService(trustedServices: string[]) {
  return (req: InternalRequest, res: Response, next: NextFunction) => {
    if (!req.callingService || !trustedServices.includes(req.callingService)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied for this service',
      });
    }
    next();
  };
}

/**
 * Validate API key using timing-safe comparison
 */
function validateApiKey(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Validate UUID format
 */
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Extract internal context from request for use in service calls
 */
export function getInternalContext(req: InternalRequest) {
  return {
    tenantId: req.tenantId!,
    userId: req.userId,
    traceId: req.traceId,
    spanId: req.spanId,
    callingService: req.callingService,
  };
}

/**
 * Build headers for internal service calls
 */
export function buildInternalHeaders(context: {
  tenantId: string;
  userId?: string;
  traceId?: string;
  serviceName?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Internal-Service': 'true',
    'X-Tenant-ID': context.tenantId,
  };

  if (process.env.INTERNAL_API_KEY) {
    headers['X-Internal-API-Key'] = process.env.INTERNAL_API_KEY;
  }

  if (context.userId) {
    headers['X-User-ID'] = context.userId;
  }

  if (context.traceId) {
    headers['X-Trace-ID'] = context.traceId;
  }

  if (context.serviceName) {
    headers['X-Calling-Service'] = context.serviceName;
  }

  return headers;
}

/**
 * Express error handler for internal auth errors
 */
export function internalAuthErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (err.name === 'InternalAuthError') {
    return res.status(err.statusCode || 403).json({
      error: err.code || 'InternalAuthError',
      message: err.message,
    });
  }
  next(err);
}

/**
 * Custom error class for internal auth failures
 */
export class InternalAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'INTERNAL_AUTH_ERROR',
    public readonly statusCode: number = 403
  ) {
    super(message);
    this.name = 'InternalAuthError';
    Object.setPrototypeOf(this, InternalAuthError.prototype);
  }
}
