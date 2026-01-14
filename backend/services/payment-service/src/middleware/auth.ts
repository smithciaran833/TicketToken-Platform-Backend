/**
 * Authentication Middleware
 * 
 * MEDIUM FIXES:
 * - JWT-5: Missing tenant returns 401 (not proceed)
 * - JWT-6: UUID format validated for tenant
 * - JWT-7: URL vs JWT tenant validated
 * - VAL-3: Body tenant rejected (must use JWT/URL)
 * - AUTH-4/AUTH-5: Global authentication middleware factory
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';

const log = logger.child({ component: 'Auth' });

// =============================================================================
// UUID VALIDATION (JWT-6)
// =============================================================================

/**
 * Validate UUID v4 format
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: string | undefined): boolean {
  if (!value) return false;
  return UUID_V4_REGEX.test(value);
}

// =============================================================================
// KEY LOADING
// =============================================================================

const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let publicKey: string | undefined;
let useSymmetricKey = false;

try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  log.info('JWT public key loaded for verification (RS256)');
} catch (error) {
  // Fall back to symmetric key if public key not available
  if (config.jwt.secret) {
    useSymmetricKey = true;
    log.warn('JWT public key not found, using symmetric key (HS256)');
  } else {
    log.error({ 
      error, 
      path: publicKeyPath 
    }, 'Failed to load JWT public key and no symmetric key available');
    throw new Error('JWT verification key not available');
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface AuthenticatedUser {
  userId: string;
  id?: string;
  sub: string;  // Required for JWTPayload compatibility
  tenantId: string;
  role: string;
  roles: string[];  // Required for JWTPayload compatibility
  email?: string;
  isAdmin?: boolean;
  venues?: string[];
  permissions?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Extended request type with authentication info
 * Use via type casting: (request as AuthRequest)
 */
export type AuthRequest = FastifyRequest & {
  user?: AuthenticatedUser;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
};

// =============================================================================
// AUTHENTICATION OPTIONS
// =============================================================================

export interface AuthOptions {
  /** Require tenant in JWT */
  requireTenant?: boolean;
  /** Validate URL tenant matches JWT tenant */
  validateUrlTenant?: boolean;
  /** Reject body tenant (must use JWT) */
  rejectBodyTenant?: boolean;
  /** Required roles */
  roles?: string[];
  /** Skip auth entirely (use sparingly) */
  skipAuth?: boolean;
}

const DEFAULT_OPTIONS: AuthOptions = {
  requireTenant: true,
  validateUrlTenant: true,
  rejectBodyTenant: true,
  roles: [],
  skipAuth: false,
};

// =============================================================================
// AUTHENTICATION MIDDLEWARE (AUTH-4, AUTH-5)
// =============================================================================

/**
 * Create authentication middleware with options
 */
export function createAuthMiddleware(options: AuthOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Skip auth if explicitly disabled (for health checks, etc.)
    if (opts.skipAuth) {
      return;
    }

    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        log.warn({ 
          path: request.url, 
          method: request.method,
          ip: request.ip 
        }, 'No authentication token provided');
        
        return reply.status(401).send({ 
          error: 'No token provided',
          code: 'NO_TOKEN',
          type: 'https://api.tickettoken.com/errors/authentication'
        });
      }

      const token = authHeader.substring(7);

      // Verify JWT
      const decoded = jwt.verify(token, useSymmetricKey ? config.jwt.secret : publicKey!, {
        algorithms: useSymmetricKey ? ['HS256', 'HS384', 'HS512'] : ['RS256'],
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      }) as AuthenticatedUser;

      // JWT-6: Validate tenant UUID format
      const tenantId = decoded.tenantId || (decoded as any).tenant_id;
      
      if (opts.requireTenant) {
        // JWT-5: Missing tenant returns 401
        if (!tenantId) {
          log.warn({
            userId: decoded.userId || decoded.sub,
            path: request.url
          }, 'JWT missing required tenant ID');
          
          return reply.status(401).send({
            error: 'Tenant ID required in token',
            code: 'TENANT_REQUIRED',
            type: 'https://api.tickettoken.com/errors/authentication'
          });
        }

        // JWT-6: Validate UUID format
        if (!isValidUUID(tenantId)) {
          log.warn({
            userId: decoded.userId || decoded.sub,
            tenantId: tenantId?.substring(0, 8) + '...',
            path: request.url
          }, 'Invalid tenant UUID format in JWT');
          
          return reply.status(401).send({
            error: 'Invalid tenant ID format',
            code: 'INVALID_TENANT_FORMAT',
            type: 'https://api.tickettoken.com/errors/authentication'
          });
        }
      }

      // JWT-7: Validate URL tenant matches JWT tenant
      if (opts.validateUrlTenant && tenantId) {
        const urlTenantId = (request.params as any)?.tenantId;
        
        if (urlTenantId && urlTenantId !== tenantId) {
          log.warn({
            userId: decoded.userId || decoded.sub,
            jwtTenant: tenantId,
            urlTenant: urlTenantId,
            path: request.url
          }, 'URL tenant does not match JWT tenant');
          
          return reply.status(403).send({
            error: 'Tenant mismatch',
            code: 'TENANT_MISMATCH',
            type: 'https://api.tickettoken.com/errors/authorization'
          });
        }
      }

      // VAL-3: Reject body tenant (must use JWT)
      if (opts.rejectBodyTenant) {
        const body = request.body as any;
        if (body && (body.tenantId || body.tenant_id)) {
          log.warn({
            userId: decoded.userId || decoded.sub,
            bodyTenant: body.tenantId || body.tenant_id,
            path: request.url
          }, 'Tenant ID in request body rejected - use JWT');
          
          return reply.status(400).send({
            error: 'Tenant ID must not be in request body',
            code: 'BODY_TENANT_REJECTED',
            type: 'https://api.tickettoken.com/errors/validation'
          });
        }
      }

      // Check required roles
      if (opts.roles && opts.roles.length > 0) {
        if (!decoded.role || !opts.roles.includes(decoded.role)) {
          log.warn({
            userId: decoded.userId || decoded.sub,
            userRole: decoded.role,
            requiredRoles: opts.roles,
            path: request.url
          }, 'Insufficient role permissions');
          
          return reply.status(403).send({
            error: 'Insufficient permissions',
            code: 'FORBIDDEN',
            type: 'https://api.tickettoken.com/errors/authorization',
            requiredRoles: opts.roles
          });
        }
      }

      // Attach user info to request
      const user: AuthenticatedUser = {
        ...decoded,
        userId: decoded.userId || decoded.id || decoded.sub || '',
        tenantId: tenantId || '',
        role: decoded.role || 'user',
      };
      
      (request as AuthRequest).user = user;
      (request as AuthRequest).userId = user.userId;
      (request as AuthRequest).tenantId = user.tenantId;

      log.debug({
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        path: request.url
      }, 'Authentication successful');

    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        log.warn({ path: request.url, ip: request.ip }, 'Token expired');
        return reply.status(401).send({ 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          type: 'https://api.tickettoken.com/errors/authentication'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        log.warn({ 
          path: request.url, 
          ip: request.ip,
          message: error.message 
        }, 'Invalid JWT token');
        return reply.status(401).send({ 
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
          type: 'https://api.tickettoken.com/errors/authentication'
        });
      }
      
      if (error.name === 'NotBeforeError') {
        log.warn({ path: request.url, ip: request.ip }, 'Token not yet valid');
        return reply.status(401).send({ 
          error: 'Token not yet valid',
          code: 'TOKEN_NOT_ACTIVE',
          type: 'https://api.tickettoken.com/errors/authentication'
        });
      }
      
      log.error({ error, path: request.url }, 'Authentication error');
      return reply.status(500).send({ 
        error: 'Authentication error',
        code: 'AUTH_ERROR',
        type: 'https://api.tickettoken.com/errors/server'
      });
    }
  };
}

// =============================================================================
// DEFAULT AUTHENTICATE (backwards compatible)
// =============================================================================

/**
 * Default authenticate middleware with standard options
 */
export const authenticate = createAuthMiddleware();

/**
 * Authenticate without requiring tenant (for user-level endpoints)
 */
export const authenticateWithoutTenant = createAuthMiddleware({
  requireTenant: false,
  validateUrlTenant: false,
  rejectBodyTenant: false,
});

// =============================================================================
// GLOBAL AUTH PLUGIN (AUTH-5)
// =============================================================================

/**
 * Register global authentication on all routes except excluded paths
 */
export async function registerGlobalAuth(
  app: FastifyInstance,
  excludedPaths: string[] = []
): Promise<void> {
  const defaultExcluded = [
    '/health',
    '/health/live',
    '/health/ready',
    '/metrics',
    '/api-docs',
    '/swagger',
  ];
  
  const allExcluded = new Set([...defaultExcluded, ...excludedPaths]);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    
    // Skip excluded paths
    if (allExcluded.has(path)) {
      return;
    }
    
    // Skip webhook endpoints (they use signature verification)
    if (path.includes('/webhook')) {
      return;
    }

    // Run authentication
    await authenticate(request, reply);
  });

  log.info({ 
    excludedPaths: Array.from(allExcluded) 
  }, 'Global authentication registered');
}

// =============================================================================
// ROLE AUTHORIZATION
// =============================================================================

/**
 * Create role-based authorization middleware
 */
export const requireRole = (roles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthRequest).user;
    
    if (!user) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'NO_AUTH',
        type: 'https://api.tickettoken.com/errors/authentication'
      });
    }

    if (!roles.includes(user.role)) {
      log.warn({
        userId: user.userId,
        userRole: user.role,
        requiredRoles: roles,
        path: request.url
      }, 'Role authorization failed');
      
      return reply.status(403).send({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        type: 'https://api.tickettoken.com/errors/authorization',
        requiredRoles: roles,
        userRole: user.role
      });
    }
  };
};

// =============================================================================
// VENUE ACCESS
// =============================================================================

/**
 * Require access to a specific venue
 */
export const requireVenueAccess = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const venueId = (request.params as any).venueId || (request.body as any)?.venueId;
  
  if (!venueId) {
    return reply.status(400).send({
      error: 'Venue ID required',
      code: 'VENUE_ID_MISSING',
      type: 'https://api.tickettoken.com/errors/validation'
    });
  }

  // JWT-6: Validate venue UUID format
  if (!isValidUUID(venueId)) {
    return reply.status(400).send({
      error: 'Invalid venue ID format',
      code: 'INVALID_VENUE_FORMAT',
      type: 'https://api.tickettoken.com/errors/validation'
    });
  }

  const user = (request as AuthRequest).user;
  
  if (!user) {
    return reply.status(401).send({
      error: 'Authentication required',
      code: 'NO_AUTH',
      type: 'https://api.tickettoken.com/errors/authentication'
    });
  }

  // Admins have access to all venues
  if (user.isAdmin || user.role === 'admin') {
    return;
  }

  // Check if user has access to this venue
  if (!user.venues?.includes(venueId)) {
    log.warn({
      userId: user.userId,
      venueId,
      userVenues: user.venues?.length || 0,
      path: request.url
    }, 'Venue access denied');
    
    return reply.status(403).send({
      error: 'Access denied to this venue',
      code: 'VENUE_ACCESS_DENIED',
      type: 'https://api.tickettoken.com/errors/authorization',
      venueId
    });
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

export { isValidUUID };
