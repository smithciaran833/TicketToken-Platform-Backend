import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { serviceUrls } from '../config/services';
import { createAuthenticatedProxy } from './authenticated-proxy';
import { validateBody } from '../middleware/validation.middleware';
import { generateInternalAuthHeaders } from '../utils/internal-auth';

// Validate idempotency key format
function validateIdempotencyKey(request: FastifyRequest, reply: FastifyReply): boolean {
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  
  if (!idempotencyKey) {
    return true; // Optional header
  }

  // Must be 1-128 characters, alphanumeric with dashes/underscores
  const validFormat = /^[a-zA-Z0-9_-]{1,128}$/.test(idempotencyKey);
  
  if (!validFormat) {
    reply.code(400).send({
      error: 'Invalid idempotency key',
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must be 1-128 alphanumeric characters (dashes and underscores allowed)',
      requestId: request.id
    });
    return false;
  }

  return true;
}

export default async function ticketsRoutes(server: FastifyInstance) {
  // Validated endpoints - gateway validates before proxying

  // POST /tickets/purchase (CRITICAL - financial transaction)
  server.post('/purchase', {
    preHandler: [
      (server as any).authenticate,
      validateBody('purchaseTickets')
    ]
  }, async (request, reply) => {
    if (!validateIdempotencyKey(request, reply)) return;
    return proxyToTicketService(server, request, reply, '/purchase');
  });

  // POST /tickets/types - Create ticket type
  server.post('/types', {
    preHandler: [
      (server as any).authenticate,
      validateBody('createTicketType')
    ]
  }, async (request, reply) => {
    return proxyToTicketService(server, request, reply, '/types');
  });

  // POST /tickets/transfer
  server.post('/transfer', {
    preHandler: [
      (server as any).authenticate,
      validateBody('transferTicket')
    ]
  }, async (request, reply) => {
    if (!validateIdempotencyKey(request, reply)) return;
    return proxyToTicketService(server, request, reply, '/transfer');
  });

  // POST /tickets/validate-qr
  server.post('/validate-qr', {
    preHandler: [
      (server as any).authenticate,
      validateBody('validateQR')
    ]
  }, async (request, reply) => {
    return proxyToTicketService(server, request, reply, '/validate-qr');
  });

  // All other ticket routes - proxy with auth but no body validation
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.ticket}/api/v1/tickets`,
    serviceName: 'ticket',
    publicPaths: ['/health', '/metrics']
  });

  return authenticatedRoutes(server);
}

// Helper to proxy to ticket service
async function proxyToTicketService(
  server: FastifyInstance,
  request: any,
  reply: any,
  path: string
) {
  const axios = require('axios');
  const serviceUrl = `${serviceUrls.ticket}/api/v1/tickets${path}`;

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-request-id': request.id,
      'x-correlation-id': request.id,
      'x-original-ip': request.ip
    };

    if (request.headers.authorization) {
      headers.authorization = request.headers.authorization;
    }

    if (request.user?.tenant_id) {
      headers['x-tenant-id'] = request.user.tenant_id;
      headers['x-tenant-source'] = 'jwt';
    }

    if (request.user?.id) {
      headers['x-user-id'] = request.user.id;
    }

    // Add validated idempotency key if present
    if (request.headers['idempotency-key']) {
      headers['idempotency-key'] = request.headers['idempotency-key'];
    }

    // Add internal auth headers
    const internalAuthHeaders = generateInternalAuthHeaders(
      request.method,
      `/api/v1/tickets${path}`,
      request.body
    );
    Object.assign(headers, internalAuthHeaders);

    const response = await axios({
      method: request.method,
      url: serviceUrl,
      headers,
      data: request.body,
      timeout: 30000,
      validateStatus: () => true
    });

    // Add correlation ID to response
    const responseHeaders = { ...response.headers };
    responseHeaders['x-correlation-id'] = request.id;

    return reply
      .code(response.status)
      .headers(responseHeaders)
      .send(response.data);

  } catch (error: any) {
    server.log.error({ error: error.message, path, correlationId: request.id }, 'Ticket proxy error');

    if (error.code === 'ECONNREFUSED') {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Ticket service is unavailable',
        correlationId: request.id
      });
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return reply.code(504).send({
        error: 'Gateway Timeout',
        message: 'Ticket service timed out',
        correlationId: request.id
      });
    }

    return reply.code(502).send({
      error: 'Bad Gateway',
      message: 'Ticket service error',
      correlationId: request.id
    });
  }
}
