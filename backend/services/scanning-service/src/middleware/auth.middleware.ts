import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  venueId?: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

// Extend Fastify request to include user context
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
    tenantId?: string;
  }
}

/**
 * Middleware to authenticate requests using JWT tokens
 * SECURITY: All scanning endpoints must use this middleware
 */
export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'No authorization token provided'
      });
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid authorization header format. Expected: Bearer <token>'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT secret is configured
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET not configured');
      return reply.status(500).send({ 
        error: 'Configuration Error',
        message: 'Authentication system not properly configured'
      });
    }

    // Verify and decode JWT token
    const payload = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;

    // Validate required payload fields
    if (!payload.userId || !payload.tenantId || !payload.role) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid token payload'
      });
    }

    // Attach user context to request for downstream handlers
    request.user = payload;
    request.tenantId = payload.tenantId;

    logger.debug('Request authenticated', {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      path: request.url
    });

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    logger.error('Authentication error:', error);
    return reply.status(401).send({ 
      error: 'Unauthorized',
      message: 'Authentication failed'
    });
  }
}

/**
 * Middleware factory to require specific roles
 * Examples: requireRole('VENUE_STAFF', 'ADMIN')
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Not authenticated'
      });
    }

    // Check if user's role is in the allowed roles list
    if (!allowedRoles.includes(request.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: request.user.userId,
        userRole: request.user.role,
        requiredRoles: allowedRoles,
        path: request.url
      });

      return reply.status(403).send({ 
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: allowedRoles,
        current: request.user.role
      });
    }

    logger.debug('Role check passed', {
      userId: request.user.userId,
      role: request.user.role,
      path: request.url
    });
  };
}

/**
 * Middleware to require specific permissions
 * More granular than role-based checks
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Not authenticated'
      });
    }

    const userPermissions = request.user.permissions || [];

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every(perm => 
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      logger.warn('Missing required permissions', {
        userId: request.user.userId,
        userPermissions,
        requiredPermissions,
        path: request.url
      });

      return reply.status(403).send({ 
        error: 'Forbidden',
        message: 'Missing required permissions',
        required: requiredPermissions
      });
    }
  };
}

/**
 * Optional authentication - sets user if token present but doesn't require it
 * Useful for endpoints that behave differently for authenticated vs anonymous users
 */
export async function optionalAuthentication(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided - continue without user context
    return;
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    
    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET not configured for optional auth');
      return;
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    request.user = payload;
    request.tenantId = payload.tenantId;

  } catch (error) {
    // Token is invalid but auth is optional - log and continue
    logger.debug('Optional auth failed', { error });
  }
}
