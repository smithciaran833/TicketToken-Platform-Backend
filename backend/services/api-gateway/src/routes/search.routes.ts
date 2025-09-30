import { serviceUrls } from '../config/services';
import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from './authenticated-proxy';

export default async function searchRoutes(server: FastifyInstance) {
  // When the gateway receives /api/v1/search/*, it needs to proxy to ${serviceUrls.search}/api/v1/*
  // But the wildcard in createAuthenticatedProxy appends to the serviceUrl
  // So we need the serviceUrl to be the base that, when combined with the wildcard, creates the correct path
  
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.search}/api/v1`,
    serviceName: 'search',
    publicPaths: ['/*']
  });

  return authenticatedRoutes(server);
}
