import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

// Extend FastifyRequest to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      tenant_id: string;
      email: string;
      role: string;
      permissions?: string[];
    };
  }
}

interface JWTPayload {
  sub: string;
  tenant_id: string;
  email: string;
  role: string;
  permissions?: string[];
  iat: number;
  exp: number;
}

/**
 * Middleware to authenticate JWT tokens
 * Validates the token and populates request.user
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      logger.warn('Request without authorization header', {
        ip: request.ip,
        path: request.url
      });
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authorization header required'
      });
    }

    // Extract token from "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid authorization header format'
      });
    }

    const token = parts[1];

    // Get JWT secret - MUST be configured
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return reply.code(500).send({
        error: 'CONFIGURATION_ERROR',
        message: 'Authentication not properly configured'
      });
    }

    // Verify and decode the token
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Populate request.user with decoded JWT data
    request.user = {
      id: decoded.sub,
      tenant_id: decoded.tenant_id,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions
    };

    logger.debug('User authenticated', {
      userId: request.user.id,
      tenantId: request.user.tenant_id,
      role: request.user.role
    });

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired JWT token', { ip: request.ip });
      return reply.code(401).send({
        error: 'TOKEN_EXPIRED',
        message: 'Token has expired'
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token', { ip: request.ip, error: (error as Error).message });
      return reply.code(401).send({
        error: 'INVALID_TOKEN',
        message: 'Invalid token'
      });
    }

    logger.error('Auth middleware error:', error);
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Authentication failed'
    });
  }
}

/**
 * Middleware to require admin role
 * Must be used AFTER authMiddleware
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Ensure authMiddleware ran first
  if (!request.user) {
    logger.error('requireAdmin called without user context - authMiddleware missing');
    return reply.code(500).send({
      error: 'CONFIGURATION_ERROR',
      message: 'Authentication middleware not configured'
    });
  }

  const adminRoles = ['admin', 'super_admin', 'platform_admin'];
  
  if (!adminRoles.includes(request.user.role)) {
    logger.warn('Non-admin user attempted admin access', {
      userId: request.user.id,
      role: request.user.role,
      path: request.url
    });
    return reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Admin access required'
    });
  }

  logger.info('Admin access granted', {
    userId: request.user.id,
    role: request.user.role,
    path: request.url
  });
}

/**
 * Middleware to require specific permission
 * Must be used AFTER authMiddleware
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      logger.error('requirePermission called without user context');
      return reply.code(500).send({
        error: 'CONFIGURATION_ERROR',
        message: 'Authentication middleware not configured'
      });
    }

    const userPermissions = request.user.permissions || [];
    
    // Admins have all permissions
    const adminRoles = ['admin', 'super_admin', 'platform_admin'];
    if (adminRoles.includes(request.user.role)) {
      return;
    }

    if (!userPermissions.includes(permission)) {
      logger.warn('User lacks required permission', {
        userId: request.user.id,
        required: permission,
        has: userPermissions
      });
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: `Permission required: ${permission}`
      });
    }
  };
}
