import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

interface JWTPayload {
  userId: string;
  tenantId?: string;
  role?: string;
}

export interface AuthRequest extends FastifyRequest {
  user?: {
    userId: string;
    tenantId?: string;
    role?: string;
  };
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No authorization header provided'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization header format'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    (request as any).user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role
    };

    logger.debug('User authenticated', { userId: decoded.userId });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
    logger.error('Authentication error', { error });
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

export function authorize(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user;
    if (!user || !user.role || !roles.includes(user.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
  };
}

export const authMiddleware = authenticate;

export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      (request as any).user = {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role
      };
    }
  } catch (error) {
    logger.debug('Optional auth failed, continuing without user context');
  }
}
