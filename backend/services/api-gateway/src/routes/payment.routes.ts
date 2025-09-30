import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function paymentRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.payment}/api/v1/payments`,
    serviceName: 'payment',
    publicPaths: ['/health', '/metrics', '/webhooks/*'] // Added webhooks as public
  });

  return authenticatedRoutes(server);
}
