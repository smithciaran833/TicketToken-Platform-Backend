import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function complianceRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.compliance}/api/v1/compliance`,
    serviceName: 'compliance',
    publicPaths: ['/health', '/metrics'] // Only health and metrics are public
  });

  return authenticatedRoutes(server);
}
