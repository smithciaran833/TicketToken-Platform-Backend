import { FastifyInstance } from 'fastify';
import { serviceUrls } from '../config/services';

export default async function venueRoutes(fastify: FastifyInstance) {
  const config = {
    serviceUrl: `${serviceUrls.venue}/api/v1/venue`,
    prefix: '/api/v1/venue',
  };

  fastify.register(require('@fastify/http-proxy'), {
    upstream: config.serviceUrl,
    prefix: config.prefix,
    rewritePrefix: '/api/v1/venue',
  });
}
