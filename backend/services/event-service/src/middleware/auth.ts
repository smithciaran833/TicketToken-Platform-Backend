import { createAxiosInstance } from "@tickettoken/shared";
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../types';

// Fastify authentication middleware
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

// Export as default authenticate function
export const authenticate = authenticateFastify;
