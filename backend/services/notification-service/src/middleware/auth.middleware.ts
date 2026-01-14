import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      venueId?: string;
      role?: string;
    };
  }
}

export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'No authorization token provided',
      });
    }

    // AUDIT FIX SEC-1: Specify allowed algorithms to prevent algorithm confusion attacks
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256', 'HS384', 'HS512']
    }) as any;

    request.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      venueId: decoded.venueId,
      role: decoded.role,
    };

    // No next() - implicit continuation
  } catch (error: any) {
    logger.error('Authentication failed', error);

    if (error.name === 'JsonWebTokenError') {
      return reply.status(401).send({
        success: false,
        error: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        success: false,
        error: 'Token expired',
      });
    }

    return reply.status(500).send({
      success: false,
      error: 'Authentication error',
    });
  }
};

export const optionalAuthMiddleware = async (
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> => {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // AUDIT FIX SEC-1: Specify allowed algorithms
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256', 'HS384', 'HS512']
      }) as any;
      request.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        venueId: decoded.venueId,
        role: decoded.role,
      };
    }

    // No next() - implicit continuation
  } catch (error) {
    // Continue without authentication - no action needed
  }
};
