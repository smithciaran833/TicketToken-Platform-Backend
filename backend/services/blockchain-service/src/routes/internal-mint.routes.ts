import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { internalAuthMiddleware } from '../middleware/internal-auth';
import { validateMintRequest } from '../middleware/validation';

async function internalMintRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post('/internal/mint-tickets', {
    preHandler: [internalAuthMiddleware, validateMintRequest]
  }, async (request, reply) => {
    const mintingUrl = process.env.MINTING_SERVICE_URL || 'http://tickettoken-minting:3018';
    
    try {
      const body = request.body as {
        ticketIds: string[];
        eventId: string;
        userId: string;
        queue?: string;
      };

      // Forward to minting service with proper authentication
      
      // Prepare the request body
      const requestBody = {
        ticketIds: body.ticketIds,
        eventId: body.eventId,
        userId: body.userId,
        queue: body.queue || 'ticket.mint'
      };

      // Add internal service authentication headers
      const timestamp = Date.now().toString();
      const secret = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
      const payload = `blockchain-service:${timestamp}:${JSON.stringify(requestBody)}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const response = await axios.post(`${mintingUrl}/internal/mint`, requestBody, {
        headers: {
          'x-internal-service': 'blockchain-service',
          'x-timestamp': timestamp,
          'x-internal-signature': signature,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      logger.error('Minting proxy error', { 
        error: error.message,
        responseData: error.response?.data,
        status: error.response?.status,
        url: mintingUrl
      });
      return reply.status(error.response?.status || 500).send({
        error: error.response?.data?.error || 'Minting request failed',
        message: error.response?.data?.message || error.message
      });
    }
  });
}

export default internalMintRoutes;
