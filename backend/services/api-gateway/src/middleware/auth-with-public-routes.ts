import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// List of public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/api/v1',
  '/api-docs',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh'
];

export function authMiddleware(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    if (PUBLIC_ROUTES.some(route => request.url.startsWith(route))) {
      return; // Allow request to proceed
    }
    
    // Check for authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Verify token (simplified for now)
    const token = authHeader.substring(7);
    if (!token || token === 'test') {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED', 
          message: 'Invalid token',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Token is valid, proceed
  });
}
