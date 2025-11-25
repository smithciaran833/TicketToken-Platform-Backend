import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

interface JWTPayload {
  userId: string;
  serviceId?: string;
  [key: string]: any;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function verifyJWT(
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
    
    const [bearer, token] = authHeader.split(' ');
    
    if (bearer !== 'Bearer' || !token) {
      return reply.code(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    }
    
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return reply.code(500).send({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    request.user = decoded;
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return reply.code(401).send({ 
        error: 'Unauthorized',
        message: 'Token expired'
      });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.code(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }
    
    logger.error({ error }, 'JWT verification error');
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}
