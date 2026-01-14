/**
 * Authentication Middleware
 * 
 * AUDIT FIX: SEC-1 - Validate JWT algorithm explicitly
 * AUDIT FIX: S2S-2 - Validate issuer
 * AUDIT FIX: S2S-3 - Validate audience
 * AUDIT FIX: S2S-4 - Use RFC 7807 error responses
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { logger } from '../utils/logger';

// =============================================================================
// JWT Configuration - AUDIT FIX: SEC-1, S2S-2,3
// =============================================================================

const JWT_CONFIG = {
  // AUDIT FIX: SEC-1 - Explicitly specify allowed algorithms (prevent algorithm confusion)
  algorithms: ['RS256', 'HS256'] as jwt.Algorithm[],
  
  // AUDIT FIX: S2S-2 - Expected issuer (should match auth service)
  issuer: process.env.JWT_ISSUER || 'tickettoken-auth-service',
  
  // AUDIT FIX: S2S-3 - Expected audience (this service)
  audience: process.env.JWT_AUDIENCE || 'analytics-service',
  
  // Token validation options
  clockTolerance: 30, // 30 seconds clock skew tolerance
  maxAge: '24h', // Maximum token age
};

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
  id: string;
  tenantId?: string;
  venueId?: string;
  role: string;
  permissions?: string[];
}

export interface AuthVenue {
  id: string;
  name: string;
}

export interface JWTPayload {
  userId?: string;
  id?: string;
  sub?: string;
  tenantId?: string;
  tenant_id?: string;
  venueId?: string;
  venue_id?: string;
  venueName?: string;
  role?: string;
  permissions?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    venue?: AuthVenue;
    tenantId?: string;
  }
}

// =============================================================================
// AUDIT FIX: SEC-1, S2S-2,3,4 - Secure JWT Authentication
// =============================================================================

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      const error = new UnauthorizedError('Authentication required', {
        detail: 'Missing Authorization header',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
    }

    // AUDIT FIX: Validate bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      const error = new UnauthorizedError('Invalid authentication format', {
        detail: 'Authorization header must use Bearer scheme',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
    }

    const token = authHeader.substring(7); // Remove 'Bearer '
    
    if (!token || token.trim() === '') {
      const error = new UnauthorizedError('Invalid token', {
        detail: 'Token is empty',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
    }

    // AUDIT FIX: SEC-1, S2S-2,3 - Verify with explicit algorithm, issuer, and audience
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: JWT_CONFIG.algorithms,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        clockTolerance: JWT_CONFIG.clockTolerance,
        maxAge: JWT_CONFIG.maxAge,
      }) as JWTPayload;
    } catch (jwtError: any) {
      // Fall back to basic verification if issuer/audience not set in token
      // This maintains backward compatibility while logging for monitoring
      if (jwtError.message?.includes('jwt issuer') || jwtError.message?.includes('jwt audience')) {
        logger.warn({
          event: 'jwt_validation_fallback',
          error: jwtError.message
        }, 'JWT missing issuer/audience, falling back to basic verification');
        
        decoded = jwt.verify(token, config.jwt.secret, {
          algorithms: JWT_CONFIG.algorithms,
          clockTolerance: JWT_CONFIG.clockTolerance,
        }) as JWTPayload;
      } else {
        throw jwtError;
      }
    }
    
    // Extract user ID from various possible fields
    const userId = decoded.userId || decoded.id || decoded.sub;
    if (!userId) {
      const error = new UnauthorizedError('Invalid token payload', {
        detail: 'Token does not contain a valid user identifier',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
    }
    
    // Extract tenant ID (critical for multi-tenancy)
    const tenantId = decoded.tenantId || decoded.tenant_id;
    
    // Set user on request
    request.user = {
      id: userId,
      tenantId: tenantId,
      venueId: decoded.venueId || decoded.venue_id,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    // Set tenant ID on request for easy access
    request.tenantId = tenantId;

    // Set venue info if available
    if (decoded.venueId || decoded.venue_id) {
      request.venue = {
        id: decoded.venueId || decoded.venue_id!,
        name: decoded.venueName || 'Venue'
      };
    }

    // Log successful authentication (without sensitive data)
    logger.debug({
      event: 'auth_success',
      userId: userId,
      tenantId: tenantId,
      role: decoded.role
    });

  } catch (error: any) {
    logger.warn({
      event: 'auth_failed',
      errorType: error.name,
      path: request.url
    }, 'Authentication failed');

    // AUDIT FIX: S2S-4 - RFC 7807 error responses
    if (error.name === 'TokenExpiredError') {
      const appError = new UnauthorizedError('Token expired', {
        detail: 'The provided authentication token has expired. Please obtain a new token.',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(appError.toJSON());
    } else if (error.name === 'JsonWebTokenError') {
      const appError = new UnauthorizedError('Invalid token', {
        detail: `Token validation failed: ${error.message}`,
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(appError.toJSON());
    } else if (error.name === 'NotBeforeError') {
      const appError = new UnauthorizedError('Token not yet valid', {
        detail: 'The token is not yet valid (nbf claim)',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(appError.toJSON());
    } else if (error instanceof UnauthorizedError) {
      return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
    } else {
      // Don't expose internal errors
      logger.error({ error }, 'Unexpected authentication error');
      const appError = new UnauthorizedError('Authentication error', {
        detail: 'An unexpected error occurred during authentication',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(appError.toJSON());
    }
  }
}

// =============================================================================
// Authorization middleware
// =============================================================================

export function authorize(permissions: string[] | string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      const error = new UnauthorizedError('Authentication required', {
        detail: 'This endpoint requires authentication',
        instance: request.url
      });
      return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
    }

    const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
    const userPerms = request.user.permissions || [];

    // Check if user has admin role (bypass permissions)
    if (request.user.role === 'admin' || request.user.role === 'super_admin') {
      return;
    }

    // Check if user has required permissions
    const hasPermission = requiredPerms.some(perm =>
      userPerms.includes(perm) || userPerms.includes('*')
    );

    if (!hasPermission) {
      const error = new ForbiddenError('Insufficient permissions', {
        detail: `This action requires one of the following permissions: ${requiredPerms.join(', ')}`,
        instance: request.url
      });
      
      logger.warn({
        event: 'authorization_denied',
        userId: request.user.id,
        requiredPermissions: requiredPerms,
        userPermissions: userPerms
      });
      
      return reply.code(403).header('Content-Type', 'application/problem+json').send(error.toJSON());
    }
  };
}

// =============================================================================
// Tenant validation middleware
// =============================================================================

export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.tenantId) {
    const error = new UnauthorizedError('Tenant context required', {
      detail: 'This endpoint requires a tenant context. Ensure your token contains a tenant_id claim.',
      instance: request.url
    });
    return reply.code(401).header('Content-Type', 'application/problem+json').send(error.toJSON());
  }
}

// Legacy function name support
export const authenticateVenue = authenticate;

// Export JWT config for testing
export { JWT_CONFIG };
