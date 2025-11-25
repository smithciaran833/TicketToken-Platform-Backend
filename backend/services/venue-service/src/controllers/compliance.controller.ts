import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

const COMPLIANCE_SERVICE_URL = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance-service:3018';

export async function complianceRoutes(fastify: FastifyInstance) {
  const { logger } = (fastify as any).container.cradle;

  // Proxy all compliance requests to the compliance service
  fastify.all('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const venueId = (request.params as any).venueId;
      const path = (request.params as any)['*'] || '';

      const response = await axios({
        method: request.method as any,
        url: `${COMPLIANCE_SERVICE_URL}/api/v1/venues/${venueId}/compliance/${path}`,
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
      logger.error({ error, venueId: (request.params as any).venueId }, 'Compliance proxy error');

      if (error.response) {
        return reply.code(error.response.status).send(error.response.data);
      }

      return reply.code(503).send({
        error: 'Compliance service unavailable',
        message: 'The compliance service is currently unavailable'
      });
    }
  });
}
