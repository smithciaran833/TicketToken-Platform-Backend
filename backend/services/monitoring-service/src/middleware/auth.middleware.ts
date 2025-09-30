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

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
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
