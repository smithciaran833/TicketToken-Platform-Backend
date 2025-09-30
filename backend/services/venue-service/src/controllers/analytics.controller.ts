import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3010';

export async function analyticsRoutes(fastify: FastifyInstance) {
  const { logger } = (fastify as any).container.cradle;

  // Proxy all analytics requests to the analytics service
  fastify.all('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const venueId = (request.params as any).venueId;
      const path = (request.params as any)['*'] || '';
      
      const response = await axios({
        method: request.method as any,
        url: `${ANALYTICS_SERVICE_URL}/venues/${venueId}/${path}`,
        headers: {
          ...request.headers,
          'x-venue-id': venueId,
          'x-forwarded-for': request.ip
        },
        data: request.body,
        params: request.query as any
      });

      return reply.code(response.status).send(response.data);
    } catch (error: any) {
      logger.error({ error, venueId: (request.params as any).venueId }, 'Analytics proxy error');
      
      if (error.response) {
        return reply.code(error.response.status).send(error.response.data);
      }
      
      return reply.code(503).send({
        error: 'Analytics service unavailable',
        message: 'The analytics service is currently unavailable'
      });
    }
  });
}
