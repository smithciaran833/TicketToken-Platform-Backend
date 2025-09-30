import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function eventRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.event}/api/v1/event`,
    serviceName: 'event',
    publicPaths: ['/health', '/metrics'] // Only health and metrics are public
  });

  return authenticatedRoutes(server);
}
