import { FastifyInstance } from 'fastify';
import { serviceUrls } from '../config/services';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function ticketsRoutes(server: FastifyInstance) {
  const setupProxy = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.ticket}/api/v1/tickets`,
    serviceName: 'ticket-service',
    publicPaths: ['/health', '/metrics'],
    timeout: 10000
  });

  await setupProxy(server);
}
