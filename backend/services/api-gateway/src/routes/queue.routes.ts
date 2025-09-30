import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function queueRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.queue}/api/v1/queue`,
    serviceName: 'queue',
    publicPaths: ['/health', '/metrics'] // Only health and metrics are public
  });

  return authenticatedRoutes(server);
}
