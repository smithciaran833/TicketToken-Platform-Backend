import { serviceUrls } from '../config/services';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

// Same header filtering as authenticated-proxy
const BLOCKED_HEADERS = [
  'x-internal-service',
  'x-internal-signature',
  'x-internal-key',
  'x-admin-token',
  'x-privileged',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade'
];

const ALLOWED_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding',
  'authorization',
  'content-type',
  'user-agent',
  'referer',
  'origin',
  'x-request-id',
  'x-correlation-id',
  'x-tenant-id',
  'x-api-key',
  'idempotency-key'
];

function filterHeaders(headers: any): any {
  const filtered: any = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    if (BLOCKED_HEADERS.includes(lowerKey)) {
      continue;
    }
    
    if (ALLOWED_HEADERS.includes(lowerKey) || lowerKey.startsWith('x-custom-')) {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

export default async function eventsRoutes(server: FastifyInstance) {
  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply, path: string = '') => {
    try {
      const targetUrl = path
        ? `${serviceUrls.event}/api/v1/events/${path}`
        : `${serviceUrls.event}/api/v1/events`;

      // Filter headers before forwarding
      const filteredHeaders = filterHeaders(request.headers);
      filteredHeaders['x-gateway-forwarded'] = 'true';
      filteredHeaders['x-original-ip'] = request.ip;

      const response = await axios({
        method: request.method as any,
        url: targetUrl,
        headers: filteredHeaders,
        data: request.body,
        params: request.query,
        timeout: 5000, // 5 second timeout
        maxRedirects: 0,
        validateStatus: () => true,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      // Filter response headers
      const responseHeaders: any = {};
      for (const [key, value] of Object.entries(response.headers)) {
        const lowerKey = key.toLowerCase();
        if (!lowerKey.startsWith('x-internal-') && !BLOCKED_HEADERS.includes(lowerKey)) {
          responseHeaders[key] = value;
        }
      }

      return reply
        .code(response.status)
        .headers(responseHeaders)
        .send(response.data);

    } catch (error: any) {
      server.log.error({ 
        error: error.message,
        code: error.code,
        path: path
      }, 'Proxy error to events');
      
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return reply.code(504).send({
          error: 'Gateway Timeout',
          message: 'Event service timeout'
        });
      }
      
      if (error.code === 'ECONNREFUSED') {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Event service is down'
        });
      }
      
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Event service unavailable'
      });
    }
  };

  // Handle base route
  server.all('/', async (request, reply) => {
    return proxyHandler(request, reply, '');
  });

  // Handle wildcard routes
  server.all('/*', async (request, reply) => {
    const wildcardPath = (request.params as any)['*'] || '';
    return proxyHandler(request, reply, wildcardPath);
  });
}
