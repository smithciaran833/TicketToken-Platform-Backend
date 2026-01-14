/**
 * Internal Auth Middleware for Integration Service
 * 
 * Handles service-to-service authentication for internal API calls
 * from other TicketToken services.
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import crypto from 'crypto';
import { config } from '../config/index';
import { logger } from '../utils/logger';
import { AuthenticationError, ForbiddenError } from '../errors/index';

// =============================================================================
// TYPES
// =============================================================================

export interface InternalServiceClaims {
  serviceName: string;
  permissions: string[];
  isInternal: true;
}

declare module 'fastify' {
  interface FastifyRequest {
    internalService?: InternalServiceClaims;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Services allowed to make internal calls
 */
const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_SERVICES || 'auth-service,event-service,ticket-service,payment-service,notification-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

/**
 * Service permissions map
 */
const SERVICE_PERMISSIONS: Record<string, string[]> = {
  'auth-service': ['integrations:read', 'integrations:write', 'webhooks:*'],
  'event-service': ['integrations:read', 'sync:events', 'webhooks:receive'],
  'ticket-service': ['integrations:read', 'sync:tickets', 'webhooks:receive'],
  'payment-service': ['integrations:read', 'integrations:write', 'sync:payments', 'webhooks:*'],
  'notification-service': ['integrations:read', 'sync:contacts'],
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Validate internal service authentication
 * 
 * Expects headers:
 * - x-internal-service-key: Shared secret key
 * - x-service-name: Name of calling service
 * - x-request-timestamp: Timestamp for replay prevention
 * - x-request-signature: HMAC signature of request
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceKey = request.headers['x-internal-service-key'] as string | undefined;
  const serviceName = request.headers['x-service-name'] as string | undefined;
  const timestamp = request.headers['x-request-timestamp'] as string | undefined;
  const signature = request.headers['x-request-signature'] as string | undefined;
  
  // Check for internal service key
  if (!serviceKey) {
    throw new AuthenticationError('Missing internal service key');
  }
  
  // Validate service key
  const expectedKey = config.security.internalServiceKey;
  if (!expectedKey) {
    logger.error('INTERNAL_SERVICE_KEY not configured');
    throw new AuthenticationError('Internal authentication not configured');
  }
  
  // Timing-safe comparison
  const keyBuffer = Buffer.from(serviceKey);
  const expectedBuffer = Buffer.from(expectedKey);
  
  if (keyBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
    logger.warn('Invalid internal service key', { serviceName });
    throw new AuthenticationError('Invalid internal service key');
  }
  
  // Validate service name
  if (!serviceName) {
    throw new AuthenticationError('Missing service name');
  }
  
  const normalizedServiceName = serviceName.toLowerCase();
  if (!ALLOWED_SERVICES.has(normalizedServiceName)) {
    logger.warn('Unauthorized service attempted access', { serviceName });
    throw new ForbiddenError(`Service '${serviceName}' is not authorized`);
  }
  
  // Validate timestamp (prevent replay attacks)
  if (timestamp) {
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
      logger.warn('Request timestamp out of range', { 
        serviceName, 
        timestamp,
        age: now - requestTime 
      });
      throw new AuthenticationError('Request timestamp invalid or expired');
    }
  }
  
  // Validate signature if provided
  if (signature && timestamp) {
    const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
    const expectedSignature = crypto
      .createHmac('sha256', expectedKey)
      .update(payload)
      .digest('hex');
    
    const sigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSignature);
    
    if (sigBuffer.length !== expectedSigBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
      logger.warn('Invalid request signature', { serviceName });
      throw new AuthenticationError('Invalid request signature');
    }
  }
  
  // Set internal service claims
  request.internalService = {
    serviceName: normalizedServiceName,
    permissions: SERVICE_PERMISSIONS[normalizedServiceName] || [],
    isInternal: true
  };
  
  logger.debug('Internal service authenticated', {
    serviceName: normalizedServiceName,
    method: request.method,
    url: request.url
  });
}

/**
 * Check if request has specific permission
 */
export function hasPermission(request: FastifyRequest, permission: string): boolean {
  if (!request.internalService) {
    return false;
  }
  
  const permissions = request.internalService.permissions;
  
  // Check for exact match or wildcard
  return permissions.some(p => {
    if (p === permission) return true;
    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -1); // Remove '*'
      return permission.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Require specific permission middleware factory
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!hasPermission(request, permission)) {
      throw new ForbiddenError(
        `Permission '${permission}' required for service ${request.internalService?.serviceName || 'unknown'}`
      );
    }
  };
}

/**
 * Combined auth middleware - accepts either JWT or internal service auth
 */
export async function combinedAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const hasJwt = request.headers.authorization?.startsWith('Bearer ');
  const hasInternalKey = !!request.headers['x-internal-service-key'];
  
  if (hasInternalKey) {
    // Try internal service auth
    return internalAuthMiddleware(request, reply);
  } else if (hasJwt) {
    // Try JWT auth (import from auth.middleware)
    const { authenticate } = await import('./auth.middleware');
    return authenticate(request, reply);
  } else {
    throw new AuthenticationError('No authentication credentials provided');
  }
}

// =============================================================================
// HELPER TO GENERATE INTERNAL REQUEST HEADERS
// =============================================================================

/**
 * Generate headers for internal service requests
 * Use this when making calls to other internal services
 */
export function getInternalRequestHeaders(serviceName = 'integration-service'): Record<string, string> {
  const internalKey = config.security.internalServiceKey;
  
  if (!internalKey) {
    throw new Error('INTERNAL_SERVICE_KEY not configured');
  }
  
  const timestamp = Date.now().toString();
  
  return {
    'x-internal-service-key': internalKey,
    'x-service-name': serviceName,
    'x-request-timestamp': timestamp
  };
}

/**
 * Generate signed headers for internal service requests
 */
export function getSignedInternalHeaders(
  method: string,
  url: string,
  serviceName = 'integration-service'
): Record<string, string> {
  const internalKey = config.security.internalServiceKey;
  
  if (!internalKey) {
    throw new Error('INTERNAL_SERVICE_KEY not configured');
  }
  
  const timestamp = Date.now().toString();
  const payload = `${serviceName}:${timestamp}:${method}:${url}`;
  const signature = crypto
    .createHmac('sha256', internalKey)
    .update(payload)
    .digest('hex');
  
  return {
    'x-internal-service-key': internalKey,
    'x-service-name': serviceName,
    'x-request-timestamp': timestamp,
    'x-request-signature': signature
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  internalAuthMiddleware,
  hasPermission,
  requirePermission,
  combinedAuthMiddleware,
  getInternalRequestHeaders,
  getSignedInternalHeaders
};
