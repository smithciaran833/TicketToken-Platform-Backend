import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function authRoutes(server: FastifyInstance) {
  // Don't append /api/v1/auth since the proxy will handle the path correctly
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: (process.env.AUTH_SERVICE_URL || 'http://auth:3001') + '/auth',
    serviceName: 'auth',
    publicPaths: ['/login', '/register', '/refresh', '/forgot-password', '/reset-password', '/verify-email']
  });

  return authenticatedRoutes(server);
}
