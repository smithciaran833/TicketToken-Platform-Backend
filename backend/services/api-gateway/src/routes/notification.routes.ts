import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function notificationRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.notification}/api/v1/notification`,
    serviceName: 'notification',
    publicPaths: ['/health', '/metrics'] // Only health and metrics are public
  });

  return authenticatedRoutes(server);
}
