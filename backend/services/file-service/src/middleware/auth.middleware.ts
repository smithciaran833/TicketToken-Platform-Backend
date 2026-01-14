/**
 * Authentication Middleware
 * 
 * AUDIT FIX: S2S-4,5,6, SEC-H1 - JWT validation security
 * - RS256 or HS256 algorithm whitelisting
 * - Issuer validation
 * - Audience validation
 * - Proper error responses
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { VerifyOptions } from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { UnauthorizedError, InvalidTokenError, TokenExpiredError, ForbiddenError } from '../errors';

// =============================================================================
// Types
// =============================================================================

export interface JWTUser {
  id: string;
  sub?: string;
  email?: string;
  tenant_id?: string;
  tenantId?: string;
  organization_id?: string;
  organizationId?: string;
  venue_id?: string;
  venueId?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  is_system_admin?: boolean;
  isSystemAdmin?: boolean;
  isAdmin?: boolean;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

// Use a symbol to store the typed user on the request object
// This avoids conflicts with @fastify/jwt's user property
const JWT_USER_KEY = Symbol('jwtUser');

// Extend FastifyRequest with our symbol-based user storage
declare module 'fastify' {
  interface FastifyRequest {
    [JWT_USER_KEY]?: JWTUser;
  }
}

/**
 * Helper to get typed user from request
 */
export function getUser(request: FastifyRequest): JWTUser | undefined {
  // First try our symbol-based storage
  const symbolUser = (request as unknown as Record<symbol, JWTUser | undefined>)[JWT_USER_KEY];
  if (symbolUser) {
    return symbolUser;
  }
  // Fall back to casting request.user if it exists and looks like JWTUser
  const rawUser = request.user;
  if (rawUser && typeof rawUser === 'object' && 'id' in rawUser) {
    return rawUser as unknown as JWTUser;
  }
  return undefined;
}

/**
 * Helper to set typed user on request
 */
function setUser(request: FastifyRequest, user: JWTUser): void {
  (request as unknown as Record<symbol, JWTUser>)[JWT_USER_KEY] = user;
  // Also set on request.user for compatibility
  (request as unknown as { user: unknown }).user = user;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * AUDIT FIX: S2S-4 - Whitelist allowed JWT algorithms
 * Only allow secure algorithms, never allow 'none'
 */
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['RS256', 'HS256', 'HS384', 'HS512'];

/**
 * AUDIT FIX: S2S-5 - Validate issuer
 */
const EXPECTED_ISSUER = process.env.JWT_ISSUER || 'tickettoken-auth-service';

/**
 * AUDIT FIX: S2S-6 - Validate audience
 */
const EXPECTED_AUDIENCE = process.env.JWT_AUDIENCE || 'tickettoken-file-service';

/**
 * Get JWT verification options
 */
function getVerifyOptions(): VerifyOptions {
  return {
    algorithms: ALLOWED_ALGORITHMS,
    issuer: EXPECTED_ISSUER,
    audience: EXPECTED_AUDIENCE,
    complete: false,
  };
}

/**
 * Get JWT secret - supports both symmetric and asymmetric keys
 */
function getJWTSecret(): string | Buffer {
  const secret = process.env.JWT_SECRET;
  const publicKey = process.env.JWT_PUBLIC_KEY;
  
  if (publicKey) {
    // Use public key for RS256/asymmetric verification
    return Buffer.from(publicKey, 'base64');
  }
  
  if (!secret) {
    logger.error({}, 'JWT_SECRET or JWT_PUBLIC_KEY environment variable is not set');
    throw new Error('JWT configuration error');
  }
  
  return secret;
}

// =============================================================================
// Middleware Functions
// =============================================================================

/**
 * Optional authentication - attaches user if valid token present
 * Does not reject request if token is missing or invalid
 */
export async function authenticateOptional(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }
    
    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return;
    }
    
    const decoded = jwt.verify(
      token,
      getJWTSecret(),
      getVerifyOptions()
    ) as JWTUser;
    
    setUser(request, decoded);
    
    logger.debug({
      event: 'auth_optional_success',
      userId: decoded.id || decoded.sub,
      tenantId: decoded.tenant_id || decoded.tenantId,
    }, 'Optional authentication successful');
    
  } catch (error) {
    // Don't fail on optional auth - just log and continue
    logger.debug({
      event: 'auth_optional_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Optional authentication failed - continuing without auth');
  }
}

/**
 * Required authentication - rejects request if token is missing or invalid
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({
      event: 'auth_no_token',
      requestId: request.id,
      path: request.url,
    }, 'Authentication required but no token provided');
    
    throw new UnauthorizedError('No authentication token provided', 'NO_TOKEN');
  }
  
  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  
  if (!token) {
    throw new UnauthorizedError('Empty authentication token', 'EMPTY_TOKEN');
  }
  
  try {
    const decoded = jwt.verify(
      token,
      getJWTSecret(),
      getVerifyOptions()
    ) as JWTUser;
    
    setUser(request, decoded);
    
    logger.debug({
      event: 'auth_success',
      userId: decoded.id || decoded.sub,
      tenantId: decoded.tenant_id || decoded.tenantId,
      requestId: request.id,
    }, 'Authentication successful');
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn({
        event: 'auth_token_expired',
        requestId: request.id,
      }, 'JWT token has expired');
      
      throw new TokenExpiredError('Authentication token has expired');
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({
        event: 'auth_token_invalid',
        error: error.message,
        requestId: request.id,
      }, 'Invalid JWT token');
      
      throw new InvalidTokenError(`Invalid authentication token: ${error.message}`);
    }
    
    logger.error({
      event: 'auth_unexpected_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: request.id,
    }, 'Unexpected authentication error');
    
    throw new InvalidTokenError('Authentication failed');
  }
}

/**
 * Require admin role - must be called after authenticate
 */
export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = getUser(request);
  
  if (!user) {
    throw new UnauthorizedError('Authentication required for admin access', 'AUTH_REQUIRED');
  }
  
  // Check if user has admin role (support multiple field formats)
  const isAdmin = 
    user.is_system_admin === true ||
    user.isSystemAdmin === true ||
    user.isAdmin === true ||
    user.role === 'admin' ||
    user.roles?.includes('admin') ||
    user.roles?.includes('system_admin');
  
  if (!isAdmin) {
    logger.warn({
      event: 'admin_access_denied',
      userId: user.id || user.sub,
      roles: user.roles || user.role,
      requestId: request.id,
    }, 'Unauthorized admin access attempt');
    
    throw new ForbiddenError(
      'Administrator access required for this operation',
      'ADMIN_REQUIRED'
    );
  }
  
  logger.debug({
    event: 'admin_access_granted',
    userId: user.id || user.sub,
    requestId: request.id,
  }, 'Admin access granted');
}

/**
 * Require specific role
 */
export function requireRole(role: string) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = getUser(request);
    
    if (!user) {
      throw new UnauthorizedError('Authentication required', 'AUTH_REQUIRED');
    }
    
    const hasRole = 
      user.role === role ||
      user.roles?.includes(role) ||
      user.is_system_admin === true ||
      user.isSystemAdmin === true;
    
    if (!hasRole) {
      logger.warn({
        event: 'role_access_denied',
        userId: user.id || user.sub,
        requiredRole: role,
        userRoles: user.roles || user.role,
        requestId: request.id,
      }, 'User does not have required role');
      
      throw new ForbiddenError(
        `Role '${role}' is required for this operation`,
        'ROLE_REQUIRED',
        { requiredRole: role }
      );
    }
  };
}

/**
 * Require file owner or admin - for file-specific operations
 */
export function requireFileOwnerOrAdmin(getFileOwnerId: (request: FastifyRequest) => Promise<string | null>) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = getUser(request);
    
    if (!user) {
      throw new UnauthorizedError('Authentication required', 'AUTH_REQUIRED');
    }
    
    const userId = user.id || user.sub;
    
    // Admins can access any file
    const isAdmin = 
      user.is_system_admin === true ||
      user.isSystemAdmin === true ||
      user.isAdmin === true ||
      user.roles?.includes('admin');
    
    if (isAdmin) {
      return;
    }
    
    // Check if user owns the file
    const fileOwnerId = await getFileOwnerId(request);
    
    if (!fileOwnerId || fileOwnerId !== userId) {
      throw new ForbiddenError(
        'You do not have permission to access this file',
        'FILE_ACCESS_DENIED'
      );
    }
  };
}

export default {
  authenticate,
  authenticateOptional,
  requireAdmin,
  requireRole,
  requireFileOwnerOrAdmin,
  getUser,
};
