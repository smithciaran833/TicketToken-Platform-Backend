import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthRequest extends FastifyRequest {
  user?: any;
}

export async function requireAuth(request: AuthRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    reply.code(401).send({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
    request.user = decoded;
  } catch (error) {
    reply.code(401).send({ error: 'Invalid token' });
  }
}

export async function optionalAuth(request: AuthRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
      request.user = decoded;
    } catch {
      // Invalid token, but continue without user
    }
  }
}
