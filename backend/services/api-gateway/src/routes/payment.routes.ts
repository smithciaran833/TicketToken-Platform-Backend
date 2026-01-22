import { FastifyInstance } from 'fastify';
import { serviceUrls } from '../config/services';
import { createAuthenticatedProxy } from './authenticated-proxy';
import { validateBody, validateUuidParam } from '../middleware/validation.middleware';

export default async function paymentRoutes(server: FastifyInstance) {
  // Validated endpoints - gateway validates before proxying
  
  // POST /payments - Process payment (CRITICAL - financial transaction)
  server.post('/', {
    preHandler: [
      (server as any).authenticate,
      validateBody('processPayment')
    ]
  }, async (request, reply) => {
    return proxyToPaymentService(server, request, reply, '');
  });

  // POST /payments/calculate-fees
  server.post('/calculate-fees', {
    preHandler: [
      (server as any).authenticate,
      validateBody('calculateFees')
    ]
  }, async (request, reply) => {
    return proxyToPaymentService(server, request, reply, '/calculate-fees');
  });

  // POST /payments/:id/refund
  server.post('/:id/refund', {
    preHandler: [
      (server as any).authenticate,
      validateUuidParam('id'),
      validateBody('refundTransaction')
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return proxyToPaymentService(server, request, reply, `/${id}/refund`);
  });

  // All other payment routes - proxy with auth but no body validation
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.payment}/api/v1/payments`,
    serviceName: 'payment',
    publicPaths: ['/health', '/metrics', '/webhooks/*']
  });
  
  return authenticatedRoutes(server);
}

// Helper to proxy to payment service
async function proxyToPaymentService(
  server: FastifyInstance,
  request: any,
  reply: any,
  path: string
) {
  const axios = require('axios');
  const { generateInternalAuthHeaders } = require('../utils/internal-auth');
  const serviceUrl = `${serviceUrls.payment}/api/v1/payments${path}`;

  try {
    // Build headers - filter and add gateway headers
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-request-id': request.id,
      'x-gateway-forwarded': 'true',
      'x-original-ip': request.ip
    };

    // Add auth header if present
    if (request.headers.authorization) {
      headers.authorization = request.headers.authorization;
    }

    // Add tenant from JWT
    if (request.user?.tenant_id) {
      headers['x-tenant-id'] = request.user.tenant_id;
      headers['x-tenant-source'] = 'jwt';
    }

    // PHASE A FIX: Add HMAC authentication headers for S2S calls
    const internalAuthHeaders = generateInternalAuthHeaders(
      request.method,
      `/api/v1/payments${path}`,
      request.body
    );
    Object.assign(headers, internalAuthHeaders);

    const response = await axios({
      method: request.method,
      url: serviceUrl,
      headers,
      data: request.body,
      timeout: 30000, // Payment timeout
      validateStatus: () => true
    });

    return reply
      .code(response.status)
      .headers(response.headers)
      .send(response.data);

  } catch (error: any) {
    server.log.error({ error: error.message, path }, 'Payment proxy error');
    
    if (error.code === 'ECONNREFUSED') {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Payment service is unavailable'
      });
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return reply.code(504).send({
        error: 'Gateway Timeout',
        message: 'Payment service timed out'
      });
    }

    return reply.code(502).send({
      error: 'Bad Gateway',
      message: 'Payment service error'
    });
  }
}
