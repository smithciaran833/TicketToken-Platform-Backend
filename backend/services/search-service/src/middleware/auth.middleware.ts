import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// Augment Fastify's types
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      venueId?: string;
      tenant_id?: string;
      role: string;
      permissions?: string[];
    };
  }
}

// Export type alias for backwards compatibility
export type AuthenticatedRequest = FastifyRequest;

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({
        error: 'Authentication required'
      });
    }

    // SECURITY: JWT_SECRET must be set in production
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
      }
      // Only allow fallback in development
      console.warn('WARNING: Using default JWT secret in development mode');
    }

    const decoded = jwt.verify(token, jwtSecret || 'dev-secret-key-change-in-production') as any;
    
    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      tenant_id: decoded.tenant_id || decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        error: 'Token expired'
      });
    }
    
    return reply.status(401).send({
      error: 'Invalid token'
      });
  }
}

export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Authentication required'
      });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        error: 'Insufficient permissions'
      });
    }
  };
}

export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user?.venueId && !request.user?.tenant_id) {
    return reply.status(403).send({
      error: 'Tenant context required'
    });
  }
}
