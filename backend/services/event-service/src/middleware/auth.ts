import { createAxiosInstance } from "@tickettoken/shared/src/http";
import { FastifyReply } from 'fastify';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UnauthorizedError } from '../types';

// For Express middleware
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
    // Create axios instance for auth service
    const authService = createAxiosInstance(
      process.env.AUTH_SERVICE_URL || 'http://auth-service:3001'
    );
    
    // Verify token with auth service - using GET as per auth-service contract
    const response = await authService.get('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // Attach user to request
    (req as any).user = response.data.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}

// Keep the Fastify version if needed elsewhere
export async function authenticateFastify(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }
  
  try {
    const authService = createAxiosInstance(
      process.env.AUTH_SERVICE_URL || 'http://auth-service:3001'
    );
    
    // Using GET with token in header
    const response = await authService.get('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    request.user = response.data.user;
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
}
