import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export async function authenticate(
  request: AuthenticatedRequest,
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
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
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
