import { createAxiosInstance } from "@tickettoken/shared";
import { FastifyRequest, FastifyReply } from 'fastify';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

// Fastify version (for routes)
export async function authenticateFastify(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  try {
    const authService = createAxiosInstance(
      process.env.AUTH_SERVICE_URL || 'http://localhost:3001'
    );
    
    const response = await authService.get('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Map JWT 'sub' field to 'id' for compatibility
    const userData = response.data.user;
    (request as any).user = {
      ...userData,
      id: userData.sub || userData.id
    };
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

// Express version (keeping for now, will remove later)
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const authService = createAxiosInstance(
      process.env.AUTH_SERVICE_URL || 'http://auth-service:3001'
    );
    
    const response = await authService.get('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Map JWT 'sub' field to 'id' for compatibility
    const userData = response.data.user;
    (req as any).user = {
      ...userData,
      id: userData.sub || userData.id
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}
