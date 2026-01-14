/**
 * Internal Service Authentication Middleware
 * 
 * AUDIT FIX: S2S-1,2,3 - Secure service-to-service authentication
 * Uses shared secret or mTLS for internal service communication
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';
import { UnauthorizedError, ForbiddenError } from '../errors';
import crypto from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;
const SERVICE_MESH_ENABLED = process.env.SERVICE_MESH_ENABLED === 'true';
const ALLOWED_SERVICES = (process.env.ALLOWED_INTERNAL_SERVICES || 
  'api-gateway,event-service,ticket-service,order-service,notification-service').split(',');

// Internal service request header
const INTERNAL_SERVICE_HEADER = 'x-internal-service';
const INTERNAL_SIGNATURE_HEADER = 'x-internal-signature';
const INTERNAL_TIMESTAMP_HEADER = 'x-internal-timestamp';

// Maximum age of internal requests (5 minutes)
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

// =============================================================================
// Types
// =============================================================================

export interface InternalAuthContext {
  isInternalRequest: boolean;
  sourceService: string | null;
  verified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    internalAuth?: InternalAuthContext;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate HMAC signature for request verification
 */
function generateSignature(
  serviceName: string,
  timestamp: string,
  method: string,
  path: string,
  body?: string
): string {
  if (!INTERNAL_SERVICE_SECRET) {
    throw new Error('INTERNAL_SERVICE_SECRET not configured');
  }
  
  const payload = `${serviceName}:${timestamp}:${method}:${path}:${body || ''}`;
  return crypto
    .createHmac('sha256', INTERNAL_SERVICE_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verify HMAC signature
 */
function verifySignature(
  providedSignature: string,
  serviceName: string,
  timestamp: string,
  method: string,
  path: string,
  body?: string
): boolean {
  const expectedSignature = generateSignature(serviceName, timestamp, method, path, body);
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Internal authentication middleware
 * Verifies that requests come from trusted internal services
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const serviceName = request.headers[INTERNAL_SERVICE_HEADER] as string;
  const signature = request.headers[INTERNAL_SIGNATURE_HEADER] as string;
  const timestamp = request.headers[INTERNAL_TIMESTAMP_HEADER] as string;

  // Initialize context
  request.internalAuth = {
    isInternalRequest: false,
    sourceService: null,
    verified: false,
  };

  // If no internal headers, skip (external request)
  if (!serviceName) {
    return;
  }

  // Check if service-to-service auth is required
  if (!INTERNAL_SERVICE_SECRET && !SERVICE_MESH_ENABLED) {
    logger.error({
      event: 'internal_auth_not_configured',
      serviceName,
    }, 'Internal service authentication not configured');
    
    throw new ForbiddenError(
      'Internal service authentication not configured',
      'S2S_NOT_CONFIGURED'
    );
  }

  // Validate service name
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    logger.warn({
      event: 'internal_auth_unknown_service',
      serviceName,
      allowedServices: ALLOWED_SERVICES,
    }, 'Request from unknown service');
    
    throw new ForbiddenError(
      'Service not authorized for internal access',
      'S2S_UNAUTHORIZED_SERVICE'
    );
  }

  // If service mesh is enabled, trust the headers (mTLS handles auth)
  if (SERVICE_MESH_ENABLED) {
    request.internalAuth = {
      isInternalRequest: true,
      sourceService: serviceName,
      verified: true,
    };
    return;
  }

  // Validate required headers
  if (!signature || !timestamp) {
    logger.warn({
      event: 'internal_auth_missing_headers',
      serviceName,
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
    }, 'Missing internal auth headers');
    
    throw new UnauthorizedError(
      'Missing internal authentication headers',
      'S2S_MISSING_HEADERS'
    );
  }

  // Validate timestamp (prevent replay attacks)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  
  if (isNaN(requestTime) || Math.abs(now - requestTime) > MAX_REQUEST_AGE_MS) {
    logger.warn({
      event: 'internal_auth_expired',
      serviceName,
      requestTime,
      now,
      ageMs: Math.abs(now - requestTime),
    }, 'Internal request timestamp expired');
    
    throw new UnauthorizedError(
      'Internal request expired',
      'S2S_REQUEST_EXPIRED'
    );
  }

  // Verify signature
  const body = request.body ? JSON.stringify(request.body) : '';
  const isValid = verifySignature(
    signature,
    serviceName,
    timestamp,
    request.method,
    request.url,
    body
  );

  if (!isValid) {
    logger.warn({
      event: 'internal_auth_invalid_signature',
      serviceName,
      method: request.method,
      url: request.url,
    }, 'Invalid internal auth signature');
    
    throw new UnauthorizedError(
      'Invalid internal authentication signature',
      'S2S_INVALID_SIGNATURE'
    );
  }

  // Success
  request.internalAuth = {
    isInternalRequest: true,
    sourceService: serviceName,
    verified: true,
  };

  logger.debug({
    event: 'internal_auth_success',
    sourceService: serviceName,
    method: request.method,
    url: request.url,
  }, 'Internal service authenticated');
}

/**
 * Require internal auth - rejects external requests
 */
export async function requireInternalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First run internal auth middleware if not already run
  if (!request.internalAuth) {
    await internalAuthMiddleware(request, reply);
  }

  if (!request.internalAuth?.isInternalRequest || !request.internalAuth?.verified) {
    throw new ForbiddenError(
      'This endpoint requires internal service authentication',
      'S2S_REQUIRED'
    );
  }
}

// =============================================================================
// Client Helper - For making internal service calls
// =============================================================================

/**
 * Generate headers for internal service calls
 */
export function generateInternalAuthHeaders(
  targetMethod: string,
  targetPath: string,
  body?: object
): Record<string, string> {
  const serviceName = process.env.SERVICE_NAME || 'analytics-service';
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  
  const signature = generateSignature(
    serviceName,
    timestamp,
    targetMethod,
    targetPath,
    bodyStr
  );
  
  return {
    [INTERNAL_SERVICE_HEADER]: serviceName,
    [INTERNAL_SIGNATURE_HEADER]: signature,
    [INTERNAL_TIMESTAMP_HEADER]: timestamp,
  };
}

// =============================================================================
// Fastify Plugin Registration
// =============================================================================

export async function registerInternalAuth(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('internalAuth', null);
}

export default {
  internalAuthMiddleware,
  requireInternalAuth,
  generateInternalAuthHeaders,
  registerInternalAuth,
};
