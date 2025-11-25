import { FastifyInstance } from 'fastify';
import { serviceUrls } from '../config/services';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function venuesRoutes(server: FastifyInstance) {
  const setupProxy = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.venue}/api/v1/venues`,
    serviceName: 'venue-service',
    publicPaths: ['/health', '/metrics'],
    timeout: 10000
  });

  await setupProxy(server);
}
