import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// Require JWT_SECRET - fail fast if not provided
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthUser {
  id: string;
  email: string;
  roles?: string[];
  tenant_id?: string;
  [key: string]: any;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    tenantId?: string;
  }
}

/**
 * Standard authentication middleware
 * Verifies JWT token and extracts user information
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.code(401).send({
      error: 'Authentication required',
      message: 'No authorization token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    
    // Validate required fields
    if (!decoded.id) {
      return reply.code(401).send({
        error: 'Invalid token',
        message: 'Token missing user ID'
      });
    }

    request.user = decoded;
    
    // Extract tenant_id if present
    if (decoded.tenant_id) {
      request.tenantId = decoded.tenant_id;
    }
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return reply.code(401).send({
        error: 'Token expired',
        message: 'Authentication token has expired'
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      return reply.code(401).send({
        error: 'Invalid token',
        message: 'Authentication token is invalid'
      });
    }
    
    return reply.code(401).send({
      error: 'Authentication failed',
      message: 'Unable to verify authentication token'
    });
  }
}

/**
 * Require tenant context middleware
 * Ensures the user has a valid tenant_id
 */
export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.tenantId) {
    return reply.code(401).send({
      error: 'Tenant required',
      message: 'Token missing tenant context'
    });
  }
}

/**
 * Admin only middleware
 * Requires user to have admin role
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user?.roles?.includes('admin')) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
}

/**
 * Venue manager middleware
 * Requires user to have venue_manager or admin role
 */
export async function requireVenueManager(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const validRoles = ['admin', 'venue_manager'];
  const hasRole = request.user?.roles?.some((role: string) => 
    validRoles.includes(role)
  );

  if (!hasRole) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Venue manager access required'
    });
  }
}
