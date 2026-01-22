import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { authenticate } from '../middleware/auth.middleware';
import { requireTenant } from '../middleware/tenant.middleware';
import { ForbiddenError } from '../utils/errors';

const COMPLIANCE_SERVICE_URL = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance-service:3018';

export async function complianceRoutes(fastify: FastifyInstance) {
  const { logger, venueService } = (fastify as any).container.cradle;

  // SECURITY FIX: Add authentication and tenant isolation to proxy endpoint
  // Proxy all compliance requests to the compliance service
  fastify.all('/*', {
    preHandler: [authenticate, requireTenant]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const venueId = (request.params as any).venueId;
      const path = (request.params as any)['*'] || '';
      const userId = (request as any).user?.id;
      const tenantId = (request as any).tenantId;

      // SECURITY FIX: Verify user has access to this venue before proxying
      const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
      if (!hasAccess) {
        throw new ForbiddenError('No access to this venue compliance data');
      }

      // SECURITY FIX: Add tenant context to proxied request
      const response = await axios({
        method: request.method as any,
        url: `${COMPLIANCE_SERVICE_URL}/api/v1/venues/${venueId}/compliance/${path}`,
        headers: {
          ...request.headers,
          'x-venue-id': venueId,
          'x-tenant-id': tenantId,
          'x-user-id': userId,
          'x-forwarded-for': request.ip
        },
        data: request.body,
        params: request.query as any
      });

      return reply.code(response.status).send(response.data);
    } catch (error: any) {
      // Handle ForbiddenError and other custom errors
      if (error instanceof ForbiddenError) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: error.message
        });
      }
      
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
