import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function analyticsRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.analytics}/api/v1/analytics`,
    serviceName: 'analytics',
    publicPaths: ['/health', '/metrics'] // Only these paths are public
  });

  return authenticatedRoutes(server);
}
