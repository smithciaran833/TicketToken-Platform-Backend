import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthRequest extends FastifyRequest {
  user?: any;
}

// CRITICAL: JWT_SECRET must be provided via environment variable
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required for service startup. Generate with: openssl rand -base64 32');
}

export async function authenticate(request: AuthRequest, reply: FastifyReply): Promise<void> {
  try {
    const token = extractToken(request);

    if (!token) {
      return reply.code(401).send({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    request.user = decoded;
  } catch (error) {
    logger.error('Authentication failed:', error);
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

export function authorize(...roles: string[]) {
  return async (request: AuthRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    if (!roles.includes(request.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${request.user.id} with role ${request.user.role}`);
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
