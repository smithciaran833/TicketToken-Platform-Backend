import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthServiceClient } from '../services/auth.client';
import { logger } from '../utils/logger';

const authClient = new AuthServiceClient();

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    
    // Validate token with auth service
    const user = await authClient.validateToken(token);
    
    // Attach user to request
    request.user = user;
  } catch (error) {
    logger.error('Authentication failed', { error });
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  
  if (!user || user.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}
