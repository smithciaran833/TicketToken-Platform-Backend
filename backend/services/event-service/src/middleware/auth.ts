import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { verifyServiceToken, verifyApiKey, isTrustedService } from '../config/service-auth';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

// Load RSA public key for token verification
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let publicKey: string;
let keyRotationInterval: NodeJS.Timeout | null = null;

/**
 * CRITICAL FIX Issue #6: JWT Key Rotation Support
 * Reload public key from filesystem every 5 minutes to support key rotation
 * without service restart.
 * 
 * Phase 2 TODO: Migrate to JWKS endpoint for zero-downtime rotation
 */
async function loadPublicKey(): Promise<void> {
  try {
    publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    logger.info('JWT public key loaded/reloaded successfully');
  } catch (error: any) {
    logger.error({ error: error.message, path: publicKeyPath }, 'Failed to load JWT public key');
    // Only throw if no key is loaded yet (startup)
    // During rotation, log error but continue with existing key
    if (!publicKey) {
      throw new Error('JWT public key not found: ' + publicKeyPath);
    }
  }
}

// Load key on startup (synchronous for startup safety)
try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  logger.info({ path: publicKeyPath }, 'JWT public key loaded for token verification');
} catch (error: any) {
  logger.error({ error: error.message, path: publicKeyPath }, 'Failed to load JWT public key on startup');
  throw new Error('JWT public key not found: ' + publicKeyPath);
}

// Reload key every 5 minutes for rotation support
keyRotationInterval = setInterval(() => {
  loadPublicKey().catch(err => {
    logger.error({ error: err.message }, 'Failed to reload JWT public key during rotation');
  });
}, 5 * 60 * 1000);

/**
 * Cleanup function for graceful shutdown
 */
export function shutdownAuthMiddleware(): void {
  if (keyRotationInterval) {
    clearInterval(keyRotationInterval);
    keyRotationInterval = null;
    logger.info('JWT key rotation interval cleared');
  }
}

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  email?: string;
  permissions?: string[];
  role?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

/**
 * IA4: Request context type - differentiates user vs service requests
 */
export type RequestSource = 'user' | 'service' | 'internal';

/**
 * IA4: Extended request context with source information
 */
export interface AuthContext {
  /** User ID (for user requests) or Service ID (for service requests) */
  id: string;
  sub: string;
  /** Tenant ID */
  tenant_id: string;
  /** Request source type */
  source: RequestSource;
  /** Service ID if this is a service request */
  serviceId?: string;
  /** User email (user requests only) */
  email?: string;
  /** User permissions */
  permissions: string[];
  /** User role */
  role: string;
  /** Whether this request bypasses certain checks (for trusted services) */
  isInternalRequest: boolean;
}

/**
 * AUTH SERVICE URL for token revocation checks
 */
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';

/**
 * Check if a token has been revoked by calling auth-service
 *
 * HIGH PRIORITY FIX: Token Revocation Check (Audit Issue #11)
 * Validates tokens haven't been revoked (logout, password change, security incident)
 *
 * @param jti - JWT Token ID (unique identifier)
 * @returns true if token is revoked, false otherwise
 */
async function checkTokenRevocation(jti: string): Promise<boolean> {
  if (!jti) {
    // No JTI means we can't check revocation - allow by default
    return false;
  }

  try {
    const response = await axios.get<{ revoked?: boolean }>(
      `${AUTH_SERVICE_URL}/internal/token-status/${jti}`,
      {
        headers: {
          'x-internal-service': 'event-service',
          'x-service-name': 'event-service',
        },
        timeout: 2000, // 2 second timeout to prevent blocking
      }
    );

    return response.data.revoked === true;
  } catch (error: any) {
    // Log the error but fail open to prevent cascading failures
    // If auth-service is down, we don't want to block all requests
    logger.warn({
      jti,
      error: error.message,
      status: error.response?.status,
    }, 'Token revocation check failed - failing open');

    // Fail open to prevent service outages
    // Security trade-off: availability over perfect revocation enforcement
    return false;
  }
}

// Fastify authentication middleware - verifies JWT locally
export async function authenticateFastify(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required');
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, publicKey, {
      issuer: process.env.JWT_ISSUER || 'tickettoken',
      audience: process.env.JWT_AUDIENCE || process.env.JWT_ISSUER || 'tickettoken',
      algorithms: ['RS256'],
    }) as TokenPayload;

    // Validate it's an access token
    if (decoded.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Validate tenant_id is present
    if (!decoded.tenant_id) {
      throw new UnauthorizedError('Invalid token - missing tenant context');
    }

    // HIGH PRIORITY FIX: Check if token has been revoked (Audit Issue #11)
    if (decoded.jti) {
      const isRevoked = await checkTokenRevocation(decoded.jti);
      if (isRevoked) {
        logger.warn({ jti: decoded.jti, userId: decoded.sub }, 'Revoked token used');
        throw new UnauthorizedError('Token has been revoked');
      }
    }

    // Attach user data to request
    (request as any).user = {
      id: decoded.sub,
      sub: decoded.sub,
      tenant_id: decoded.tenant_id,
      email: decoded.email,
      permissions: decoded.permissions || [],
      role: decoded.role || 'user',
    };

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Authentication failed');
  }
}

// Export as default authenticate function
export const authenticate = authenticateFastify;

/**
 * Middleware to require admin role
 * CRITICAL FIX for audit finding: Missing admin authorization (RO3)
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;

  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (user.role !== 'admin') {
    throw new ForbiddenError('This action requires admin privileges');
  }
}

/**
 * Middleware factory to require specific roles
 * Usage: requireRole(['admin', 'venue_owner'])
 */
export function requireRole(allowedRoles: string[]) {
  return async function(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError(`This action requires one of these roles: ${allowedRoles.join(', ')}`);
    }
  };
}

/**
 * Check if user is admin (helper for service layer)
 */
export function isAdmin(user: any): boolean {
  return user?.role === 'admin';
}

/**
 * Check if user has one of the specified roles
 */
export function hasRole(user: any, roles: string[]): boolean {
  return roles.includes(user?.role);
}

/**
 * IA4: Check if request is from another service (not a user)
 */
export function isServiceRequest(request: FastifyRequest): boolean {
  const user = (request as any).user as AuthContext | undefined;
  return user?.source === 'service';
}

/**
 * IA4: Check if request is internal (from trusted service with elevated privileges)
 */
export function isInternalRequest(request: FastifyRequest): boolean {
  const user = (request as any).user as AuthContext | undefined;
  return user?.isInternalRequest === true;
}

/**
 * IA4: Get the request source type
 */
export function getRequestSource(request: FastifyRequest): RequestSource {
  const user = (request as any).user as AuthContext | undefined;
  return user?.source || 'user';
}

/**
 * IA4: Middleware that authenticates both users AND services
 * 
 * This middleware checks in order:
 * 1. X-Service-Token header (for S2S requests)
 * 2. X-API-Key header (for S2S requests)
 * 3. Authorization Bearer token (for user requests)
 * 
 * Sets request.user with source type for downstream code to differentiate.
 * 
 * TODO Phase 2 - Issue #1: Validate X-Tenant-Id against service_tenant_permissions table
 * TODO Phase 2 - Issue #5: Replace wildcard permissions with granular scopes from database
 */
export async function authenticateUserOrService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check for service token first (S2S authentication)
  const serviceToken = request.headers['x-service-token'] as string | undefined;
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const tenantIdHeader = request.headers['x-tenant-id'] as string | undefined;

  // Try service token authentication
  if (serviceToken) {
    const result = await verifyServiceToken(serviceToken);
    if (result.valid && result.serviceId) {
      const isTrusted = isTrustedService(result.serviceId);
      
      // SECURITY DECISION #2: Removed 'system' default - require explicit tenant
      if (!tenantIdHeader) {
        throw new BadRequestError('X-Tenant-Id header required for service requests', 'MISSING_TENANT_HEADER');
      }
      
      // TODO Phase 2 - Issue #1: Query service_tenant_permissions table
      // Validate: SELECT 1 FROM service_tenant_permissions WHERE service_id = ? AND tenant_id = ?
      // Use Redis cache with 5min TTL for performance
      
      // TODO Phase 2 - Issue #11 (HIGH): Token Revocation Check
      // Before accepting token, check Redis set: revoked_tokens:{jti}
      // If exists, throw UnauthorizedError('Token has been revoked')
      // Coordinate with auth-service on revocation events
      
      (request as any).user = {
        id: result.serviceId,
        sub: result.serviceId,
        tenant_id: tenantIdHeader,
        source: 'service' as RequestSource,
        serviceId: result.serviceId,
        // TODO Phase 2 - Issue #5 & #12 (HIGH): Granular permissions per service
        // Query service_tenant_permissions table for actual permissions
        // Trusted services: elevated permissions
        // Untrusted services: restricted permissions only
        // For now: all authenticated services get wildcard (to be refined)
        permissions: ['*'],
        role: 'service',
        isInternalRequest: isTrusted,
      } as AuthContext;
      
      return;
    } else {
      // Issue #9 (HIGH): Log failed service authentication attempts
      request.log.warn({
        ip: request.ip,
        url: request.url,
        method: request.method,
        serviceToken: 'present',
        error: result.error || 'invalid_token',
        serviceId: result.serviceId || 'unknown'
      }, 'Service token authentication failed');
    }
  }

  // Try API key authentication
  if (apiKey) {
    const result = await verifyApiKey(apiKey);
    if (result.valid && result.serviceId) {
      const isTrusted = isTrustedService(result.serviceId);
      
      // SECURITY DECISION #2: Removed 'system' default - require explicit tenant
      if (!tenantIdHeader) {
        throw new BadRequestError('X-Tenant-Id header required for service requests', 'MISSING_TENANT_HEADER');
      }
      
      // TODO Phase 2 - Issue #1: Query service_tenant_permissions table
      
      (request as any).user = {
        id: result.serviceId,
        sub: result.serviceId,
        tenant_id: tenantIdHeader,
        source: 'service' as RequestSource,
        serviceId: result.serviceId,
        // TODO Phase 2 - Issue #5 & #12 (HIGH): Load from service_tenant_permissions.permissions
        permissions: ['*'],
        role: 'service',
        isInternalRequest: isTrusted,
      } as AuthContext;
      
      return;
    } else {
      // Issue #9 (HIGH): Log failed service authentication attempts
      request.log.warn({
        ip: request.ip,
        url: request.url,
        method: request.method,
        apiKey: 'present',
        error: result.error || 'invalid_key',
        serviceId: result.serviceId || 'unknown'
      }, 'API key authentication failed');
    }
  }

  // Fall back to user JWT authentication
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Provide either Bearer token, X-Service-Token, or X-API-Key');
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, publicKey, {
      issuer: process.env.JWT_ISSUER || 'tickettoken',
      audience: process.env.JWT_AUDIENCE || process.env.JWT_ISSUER || 'tickettoken',
      algorithms: ['RS256'],
    }) as TokenPayload;

    if (decoded.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    if (!decoded.tenant_id) {
      throw new UnauthorizedError('Invalid token - missing tenant context');
    }

    // HIGH PRIORITY FIX: Check if token has been revoked (Audit Issue #11)
    if (decoded.jti) {
      const isRevoked = await checkTokenRevocation(decoded.jti);
      if (isRevoked) {
        logger.warn({ jti: decoded.jti, userId: decoded.sub }, 'Revoked token used in authenticateUserOrService');
        throw new UnauthorizedError('Token has been revoked');
      }
    }

    // User authentication - set source as 'user'
    (request as any).user = {
      id: decoded.sub,
      sub: decoded.sub,
      tenant_id: decoded.tenant_id,
      source: 'user' as RequestSource,
      email: decoded.email,
      permissions: decoded.permissions || [],
      role: decoded.role || 'user',
      isInternalRequest: false,
    } as AuthContext;

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Authentication failed');
  }
}

/**
 * IA4: Middleware to allow ONLY service requests (blocks user requests)
 */
export async function requireServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First authenticate
  await authenticateUserOrService(request, reply);

  // Check if response was already sent (authentication failed)
  if (reply.sent) return;

  const user = (request as any).user as AuthContext;

  if (user.source !== 'service') {
    throw new ForbiddenError('This endpoint only accepts service-to-service requests');
  }
}

/**
 * IA4: Middleware to allow ONLY trusted internal services
 */
export async function requireInternalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First authenticate
  await authenticateUserOrService(request, reply);

  if (reply.sent) return;

  const user = (request as any).user as AuthContext;

  if (!user.isInternalRequest) {
    throw new ForbiddenError('This endpoint only accepts requests from trusted internal services');
  }
}
