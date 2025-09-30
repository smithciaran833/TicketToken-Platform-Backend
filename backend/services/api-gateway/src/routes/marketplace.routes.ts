import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function marketplaceRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.marketplace}/api/v1/marketplace`,
    serviceName: 'marketplace',
    publicPaths: ['/health', '/metrics'] // Only health and metrics are public
  });

  return authenticatedRoutes(server);
}
