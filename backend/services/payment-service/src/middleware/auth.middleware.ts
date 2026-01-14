/**
 * Authentication Middleware for Payment Service
 * 
 * HIGH FIX: Implements JWT authentication with:
 * - Issuer and audience validation
 * - Token expiration checking
 * - Proper error responses
 * - Public/private route separation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

const log = logger.child({ component: 'AuthMiddleware' });

// =============================================================================
// Types
// =============================================================================

interface JWTPayload {
  sub: string;           // User ID
  email?: string;
  tenantId: string;      // Required for multi-tenancy
  roles: string[];       // User roles (admin, user, etc.)
  permissions?: string[];
  iss?: string;          // Issuer
  aud?: string | string[]; // Audience
  iat?: number;          // Issued at
  exp?: number;          // Expiration
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
    tenantId?: string;
  }
}

// =============================================================================
// Configuration
// =============================================================================

// Valid issuers (allow list)
const VALID_ISSUERS = [
  'tickettoken-auth-service',
  'auth.tickettoken.com',
  config.jwt?.issuer,
].filter(Boolean);

// Valid audiences
const VALID_AUDIENCES = [
  'payment-service',
  'tickettoken-services',
  'api.tickettoken.com',
  config.jwt?.audience,
].filter(Boolean);

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/health/live' },
  { method: 'GET', path: '/health/ready' },
  { method: 'GET', path: '/health/startup' },
  { method: 'POST', path: '/webhooks/stripe' }, // Stripe uses its own auth
];

// Routes that require admin role
const ADMIN_ROUTES = [
  { method: 'GET', pathPrefix: '/admin' },
  { method: 'POST', pathPrefix: '/admin' },
  { method: 'PUT', pathPrefix: '/admin' },
  { method: 'DELETE', pathPrefix: '/admin' },
  { method: 'GET', path: '/internal/metrics' },
];

// =============================================================================
// Middleware Functions
// =============================================================================

/**
 * Main authentication middleware.
 * Validates JWT and extracts user info.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth for public routes
  if (isPublicRoute(request)) {
    return;
  }

  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    log.warn({ path: request.url, method: request.method }, 'Missing authorization header');
    throw new UnauthorizedError('Authorization header required');
  }

  // Extract token from Bearer scheme
  const [scheme, token] = authHeader.split(' ');
  
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    log.warn({ path: request.url }, 'Invalid authorization scheme');
    throw new UnauthorizedError('Bearer token required');
  }

  try {
    // Verify and decode JWT
    const decoded = verifyToken(token);
    
    // Store user info on request
    request.user = decoded;
    request.tenantId = decoded.tenantId;
    
    log.debug({ 
      userId: decoded.sub, 
      tenantId: decoded.tenantId, 
      path: request.url 
    }, 'User authenticated');
    
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    
    log.warn({ 
      error: (error as Error).message, 
      path: request.url 
    }, 'JWT verification failed');
    
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Require admin role.
 * Must be used after requireAuth.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const isAdmin = request.user.roles?.includes('admin') || 
                  request.user.roles?.includes('superadmin') ||
                  request.user.permissions?.includes('payment:admin');

  if (!isAdmin) {
    log.warn({ 
      userId: request.user.sub, 
      roles: request.user.roles, 
      path: request.url 
    }, 'Admin access denied');
    throw new ForbiddenError('Admin access required');
  }
}

/**
 * Require specific permission.
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const hasPermission = 
      request.user.permissions?.includes(permission) ||
      request.user.roles?.includes('admin') ||
      request.user.roles?.includes('superadmin');

    if (!hasPermission) {
      log.warn({ 
        userId: request.user.sub, 
        requiredPermission: permission, 
        path: request.url 
      }, 'Permission denied');
      throw new ForbiddenError(`Permission '${permission}' required`);
    }
  };
}

/**
 * Require one of specified roles.
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const hasRole = request.user.roles?.some(r => roles.includes(r));

    if (!hasRole) {
      log.warn({ 
        userId: request.user.sub, 
        requiredRoles: roles, 
        userRoles: request.user.roles,
        path: request.url 
      }, 'Role denied');
      throw new ForbiddenError(`One of roles '${roles.join(', ')}' required`);
    }
  };
}

/**
 * Optional auth - extracts user if token present, but doesn't fail.
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    return;
  }

  const [scheme, token] = authHeader.split(' ');
  
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return;
  }

  try {
    const decoded = verifyToken(token);
    request.user = decoded;
    request.tenantId = decoded.tenantId;
  } catch {
    // Ignore errors for optional auth
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify and decode JWT token.
 */
function verifyToken(token: string): JWTPayload {
  const secret = config.jwt.secret;
  
  if (!secret) {
    log.error('JWT secret not configured');
    throw new Error('JWT configuration error');
  }

  // Build verify options
  const verifyOptions: jwt.VerifyOptions = {
    algorithms: ['HS256', 'HS384', 'HS512'],
    clockTolerance: 60, // 60 seconds clock skew tolerance
  };
  
  // Add issuer validation if configured
  if (VALID_ISSUERS.length > 0) {
    verifyOptions.issuer = VALID_ISSUERS[0]; // Use first valid issuer
  }
  
  // Add audience validation if configured
  if (VALID_AUDIENCES.length > 0) {
    verifyOptions.audience = VALID_AUDIENCES[0]; // Use first valid audience
  }

  const decoded = jwt.verify(token, secret, verifyOptions) as unknown as JWTPayload;

  // Validate required fields
  if (!decoded.sub) {
    throw new UnauthorizedError('Token missing subject');
  }
  
  if (!decoded.tenantId) {
    throw new UnauthorizedError('Token missing tenant ID');
  }
  
  if (!decoded.roles || decoded.roles.length === 0) {
    // Default to 'user' role if not specified
    decoded.roles = ['user'];
  }

  return decoded;
}

/**
 * Check if route is public (doesn't require auth).
 */
function isPublicRoute(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0];
  
  return PUBLIC_ROUTES.some(route => {
    if (route.method !== request.method) {
      return false;
    }
    return path === route.path || path.startsWith(route.path + '/');
  });
}

/**
 * Check if route requires admin access.
 */
function isAdminRoute(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0];
  
  return ADMIN_ROUTES.some(route => {
    if (route.method !== request.method && route.method !== '*') {
      return false;
    }
    
    if ('path' in route) {
      return path === route.path;
    }
    
    if ('pathPrefix' in route) {
      return path.startsWith(route.pathPrefix);
    }
    
    return false;
  });
}

/**
 * Create combined auth middleware that checks admin routes automatically.
 */
export async function authWithAdminCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);
  
  if (isAdminRoute(request)) {
    await requireAdmin(request, reply);
  }
}

// =============================================================================
// Exports
// =============================================================================

export { JWTPayload };

// Payment-specific permission constants
export const PERMISSIONS = {
  PAYMENT_CREATE: 'payment:create',
  PAYMENT_READ: 'payment:read',
  PAYMENT_REFUND: 'payment:refund',
  PAYMENT_ADMIN: 'payment:admin',
  TRANSFER_CREATE: 'transfer:create',
  TRANSFER_READ: 'transfer:read',
  ESCROW_MANAGE: 'escrow:manage',
} as const;

// Role constants
export const ROLES = {
  USER: 'user',
  VENUE_OWNER: 'venue_owner',
  ARTIST: 'artist',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
} as const;
