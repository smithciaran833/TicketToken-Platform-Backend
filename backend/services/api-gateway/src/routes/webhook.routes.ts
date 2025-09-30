import { serviceUrls } from '../config/services';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

// Extend FastifyRequest to include rawBody
interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

export default async function webhookRoutes(server: FastifyInstance) {
  // Special handler for Stripe webhooks that preserves raw body
  const handleStripeWebhook = async (request: RawBodyRequest, reply: FastifyReply) => {
    try {
      // Get the raw body buffer
      const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
      
      // Preserve critical headers exactly as received
      const headers: any = {
        'stripe-signature': request.headers['stripe-signature'],
        'stripe-webhook-id': request.headers['stripe-webhook-id'],
        'content-type': request.headers['content-type'] || 'application/json',
        'content-length': Buffer.byteLength(rawBody).toString(),
        'x-forwarded-for': request.ip,
        'x-original-host': request.headers['host']
      };

      // Remove undefined headers
      Object.keys(headers).forEach(key => 
        headers[key] === undefined && delete headers[key]
      );

      // Forward to payment service with raw body
      const response = await axios({
        method: 'POST',
        url: `${serviceUrls.payment}/api/v1/webhooks/stripe`,
        data: rawBody,
        headers,
        timeout: 10000, // 10 second timeout for webhooks
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
        // Tell axios not to transform the data
        transformRequest: [(data) => data],
        // Raw response
        responseType: 'json'
      });

      return reply
        .code(response.status)
        .send(response.data);

    } catch (error: any) {
      server.log.error({ 
        error: error.message,
        code: error.code,
        path: '/webhooks/stripe'
      }, 'Stripe webhook proxy error');
      
      // Return 500 so Stripe will retry
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process webhook'
      });
    }
  };

  // Stripe webhook endpoint - no auth, raw body preserved
  server.post('/stripe', {
    config: {
      rawBody: true
    }
  }, handleStripeWebhook);

  // Generic webhook endpoint for other providers (standard JSON parsing)
  server.all('/*', async (request, reply) => {
    const wildcardPath = (request.params as any)['*'] || '';
    
    try {
      const response = await axios({
        method: request.method as any,
        url: `${serviceUrls.payment}/api/v1/webhooks/${wildcardPath}`,
        data: request.body,
        headers: {
          'content-type': request.headers['content-type'],
          'x-forwarded-for': request.ip
        },
        timeout: 10000,
        validateStatus: () => true
      });

      return reply
        .code(response.status)
        .headers(response.headers as any)
        .send(response.data);
        
    } catch (error: any) {
      server.log.error({ error: error.message }, 'Webhook proxy error');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Webhook processing failed'
      });
    }
  });
}
