/**
 * Service-to-Service Authentication Middleware
 *
 * HIGH FIX: Implements service authentication with:
 * - HMAC signature verification
 * - Service allowlist (only known services can call)
 * - Request timestamp validation (replay attack prevention)
 * - Per-endpoint authorization rules
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { logger } from '../utils/logger';
import { verifyServiceRequest } from '../utils/crypto.util';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

const log = logger.child({ component: 'ServiceAuthMiddleware' });

// =============================================================================
// Service Allowlist - Only these services can make authenticated S2S calls
// =============================================================================

/**
 * Known services that can call the payment service.
 * Maps service name to allowed endpoints (patterns).
 */
const SERVICE_ALLOWLIST: Record<string, EndpointPermission[]> = {
  'ticket-service': [
    { method: 'POST', path: '/api/v1/payments/intents' },
    { method: 'GET', path: '/api/v1/payments/:id' },
    { method: 'POST', path: '/api/v1/payments/:id/capture' },
    { method: 'POST', path: '/api/v1/payments/:id/cancel' },
    { method: 'POST', path: '/api/v1/refunds' },
    { method: 'GET', path: '/api/v1/refunds/:id' },
    { method: 'GET', path: '/internal/payment-status/:id' },
  ],
  'order-service': [
    { method: 'POST', path: '/api/v1/payments/intents' },
    { method: 'GET', path: '/api/v1/payments/:id' },
    { method: 'POST', path: '/api/v1/payments/:id/capture' },
    { method: 'POST', path: '/api/v1/payments/:id/cancel' },
    { method: 'POST', path: '/api/v1/refunds' },
    { method: 'GET', path: '/internal/order-payments/:orderId' },
  ],
  'venue-service': [
    { method: 'GET', path: '/api/v1/connected-accounts/:accountId' },
    { method: 'POST', path: '/api/v1/connected-accounts' },
    { method: 'GET', path: '/api/v1/transfers/:id' },
    { method: 'GET', path: '/internal/venue-earnings/:venueId' },
  ],
  'marketplace-service': [
    { method: 'POST', path: '/api/v1/payments/intents' },
    { method: 'POST', path: '/api/v1/escrow/hold' },
    { method: 'POST', path: '/api/v1/escrow/release' },
    { method: 'POST', path: '/api/v1/escrow/refund' },
    { method: 'GET', path: '/internal/escrow/:id' },
  ],
  'notification-service': [
    { method: 'GET', path: '/internal/payment-details/:id' },
    { method: 'GET', path: '/internal/refund-details/:id' },
  ],
  // Admin services have broader access
  'admin-service': [
    { method: '*', path: '/api/v1/*' },
    { method: '*', path: '/internal/*' },
    { method: '*', path: '/admin/*' },
  ],
};

interface EndpointPermission {
  method: string;  // 'GET', 'POST', etc. or '*' for all
  path: string;    // Path pattern with :params or * wildcard
}

// =============================================================================
// Service Auth Headers
// =============================================================================

const SERVICE_NAME_HEADER = 'x-service-name';
const SERVICE_SIGNATURE_HEADER = 'x-service-signature';
const SERVICE_TIMESTAMP_HEADER = 'x-service-timestamp';

// Maximum age of a signed request (prevent replay attacks)
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Middleware Functions
// =============================================================================

/**
 * Verify service-to-service authentication.
 *
 * This middleware validates:
 * 1. Service name is in the allowlist
 * 2. HMAC signature is valid
 * 3. Request timestamp is recent
 * 4. Service has permission for this endpoint
 */
export async function requireServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceName = request.headers[SERVICE_NAME_HEADER] as string;
  const signature = request.headers[SERVICE_SIGNATURE_HEADER] as string;
  const timestamp = request.headers[SERVICE_TIMESTAMP_HEADER] as string;

  // Check required headers
  if (!serviceName || !signature || !timestamp) {
    log.warn({
      path: request.url,
      hasServiceName: !!serviceName,
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
    }, 'Missing service auth headers');
    throw new UnauthorizedError('Missing service authentication headers');
  }

  // Check service is in allowlist
  if (!SERVICE_ALLOWLIST[serviceName]) {
    log.warn({
      serviceName,
      path: request.url,
    }, 'Unknown service attempted access');
    throw new UnauthorizedError('Unknown service');
  }

  // Validate timestamp (prevent replay attacks)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  const age = Math.abs(now - requestTime);

  if (isNaN(requestTime) || age > MAX_REQUEST_AGE_MS) {
    log.warn({
      serviceName,
      requestTime,
      age,
      maxAge: MAX_REQUEST_AGE_MS,
    }, 'Request timestamp invalid or expired');
    throw new UnauthorizedError('Request expired or timestamp invalid');
  }

  // Verify HMAC signature using the crypto utility
  const body = request.body as object | string | undefined;

  const verifyResult = verifyServiceRequest(
    signature,
    serviceName,
    timestamp,
    body
  );

  if (!verifyResult.valid) {
    log.warn({
      serviceName,
      path: request.url,
      error: verifyResult.error,
    }, 'Service signature verification failed');
    throw new UnauthorizedError(verifyResult.error || 'Invalid service signature');
  }

  // Check endpoint permission
  const hasPermission = checkEndpointPermission(
    serviceName,
    request.method,
    request.url
  );

  if (!hasPermission) {
    log.warn({
      serviceName,
      method: request.method,
      path: request.url,
    }, 'Service lacks permission for endpoint');
    throw new ForbiddenError(`Service '${serviceName}' is not authorized for this endpoint`);
  }

  // Store authenticated service info on request
  (request as any).authenticatedService = {
    name: serviceName,
    authenticatedAt: new Date().toISOString(),
  };

  log.debug({
    serviceName,
    method: request.method,
    path: request.url,
  }, 'Service authenticated');
}

/**
 * Optional service auth - allows both user and service auth.
 * If service headers are present, validates them.
 * If not, falls through to regular user auth.
 */
export async function optionalServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceName = request.headers[SERVICE_NAME_HEADER];

  if (serviceName) {
    // Service auth headers present, validate them
    await requireServiceAuth(request, reply);
  }
  // If no service headers, continue to allow user auth middleware to handle
}

/**
 * Check if a service has permission for a specific endpoint.
 */
function checkEndpointPermission(
  serviceName: string,
  method: string,
  path: string
): boolean {
  const permissions = SERVICE_ALLOWLIST[serviceName];
  if (!permissions) return false;

  for (const permission of permissions) {
    // Check method (exact match or wildcard)
    if (permission.method !== '*' && permission.method !== method) {
      continue;
    }

    // Check path pattern
    if (matchPath(permission.path, path)) {
      return true;
    }
  }

  return false;
}

/**
 * Match a path pattern against an actual path.
 * Supports:
 * - Exact match: '/api/v1/payments'
 * - Parameter wildcard: '/api/v1/payments/:id'
 * - Glob wildcard: '/api/v1/*'
 */
function matchPath(pattern: string, actualPath: string): boolean {
  // Remove query string from actual path
  const pathWithoutQuery = actualPath.split('?')[0];

  // Handle glob wildcard at end
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return pathWithoutQuery.startsWith(prefix);
  }

  // Convert pattern to regex
  // :id becomes [^/]+ (one or more non-slash characters)
  const regexPattern = pattern
    .replace(/:[a-zA-Z]+/g, '[^/]+')
    .replace(/\//g, '\\/');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(pathWithoutQuery);
}

// =============================================================================
// Helper Functions for Making Service Calls
// =============================================================================

export interface ServiceCallOptions {
  targetService: string;
  method: string;
  path: string;
  body?: any;
}

/**
 * Generate headers for calling another service.
 * Use this when making outbound service-to-service calls.
 */
export function generateServiceAuthHeaders(
  method: string,
  path: string,
  body?: any
): Record<string, string> {
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';

  // Import locally to avoid circular dependency
  const { signServiceRequest } = require('../utils/crypto.util');

  const signResult = signServiceRequest('payment-service', body);

  return {
    [SERVICE_NAME_HEADER]: signResult.serviceName,
    [SERVICE_SIGNATURE_HEADER]: signResult.signature,
    [SERVICE_TIMESTAMP_HEADER]: signResult.timestamp,
    'Content-Type': 'application/json',
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if the current request is from a trusted service.
 */
export function isServiceRequest(request: FastifyRequest): boolean {
  return !!(request as any).authenticatedService;
}

/**
 * Get the authenticated service name from a request.
 */
export function getServiceName(request: FastifyRequest): string | null {
  return (request as any).authenticatedService?.name || null;
}

/**
 * Require the request to be from a specific service.
 */
export function requireService(allowedServices: string[]) {
  return (request: FastifyRequest, reply: FastifyReply): void => {
    const serviceName = getServiceName(request);

    if (!serviceName || !allowedServices.includes(serviceName)) {
      throw new ForbiddenError(
        `This endpoint requires a request from: ${allowedServices.join(', ')}`
      );
    }
  };
}
