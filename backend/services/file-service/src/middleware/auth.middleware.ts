import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export async function authenticateOptional(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      (request as any).user = decoded;
    }
  } catch (error) {
    logger.debug('Invalid token provided');
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (request as any).user = decoded;
    
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  
  if (!user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  
  // Check if user has admin role
  const isAdmin = user.roles?.includes('admin') || user.role === 'admin' || user.isAdmin;
  
  if (!isAdmin) {
    logger.warn(`Unauthorized admin access attempt by user ${user.id || 'unknown'}`);
    return reply.status(403).send({ 
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
}
