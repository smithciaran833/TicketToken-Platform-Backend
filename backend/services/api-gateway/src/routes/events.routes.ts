import { FastifyInstance } from 'fastify';
import { serviceUrls } from '../config/services';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function eventsRoutes(server: FastifyInstance) {
  const setupProxy = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.event}/api/v1/events`,
    serviceName: 'event-service',
    publicPaths: ['/health', '/metrics'],
    timeout: 5000
  });

  await setupProxy(server);
}
