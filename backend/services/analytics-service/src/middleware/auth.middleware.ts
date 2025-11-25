import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: string;
  venueId?: string;
  role: string;
  permissions?: string[];
}

export interface AuthVenue {
  id: string;
  name: string;
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    venue?: AuthVenue;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.code(401).send({
        success: false,
        error: {
          message: 'Authentication required',
          statusCode: 401,
        }
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    // Also set venue info if available
    if (decoded.venueId) {
      request.venue = {
        id: decoded.venueId,
        name: decoded.venueName || 'Venue'
      };
    }
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.code(401).send({
        success: false,
        error: {
          message: 'Token expired',
          statusCode: 401,
        }
      });
    } else if (error.name === 'JsonWebTokenError') {
      return reply.code(401).send({
        success: false,
        error: {
          message: 'Invalid token',
          statusCode: 401,
        }
      });
    } else {
      return reply.code(500).send({
        success: false,
        error: {
          message: 'Authentication error',
          statusCode: 500,
        }
      });
    }
  }
}

export function authorize(permissions: string[] | string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        success: false,
        error: {
          message: 'Authentication required',
          statusCode: 401,
        }
      });
    }

    const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
    const userPerms = request.user.permissions || [];

    // Check if user has admin role (bypass permissions)
    if (request.user.role === 'admin') {
      return;
    }

    // Check if user has required permissions
    const hasPermission = requiredPerms.some(perm =>
      userPerms.includes(perm) || userPerms.includes('*')
    );

    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: {
          message: 'Insufficient permissions',
          statusCode: 403,
        }
      });
    }
  };
}

// Legacy function name support
export const authenticateVenue = authenticate;
