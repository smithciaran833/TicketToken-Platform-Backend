import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

interface ProxyOptions {
  serviceUrl: string;
  serviceName: string;
  publicPaths?: string[];
  timeout?: number;
}

// Headers that should never be forwarded to backend services
const BLOCKED_HEADERS = [
  'x-internal-service',
  'x-internal-signature',
  'x-internal-key',
  'x-admin-token',
  'x-privileged',
  'x-tenant-id',  // Block external tenant headers - must come from JWT
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'expect',
  'proxy-authenticate',
  'proxy-authorization',
  'www-authenticate',
  'te'
];

// Headers that are allowed to pass through
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
  // Removed x-tenant-id from allowed list
  'x-api-key',
  'idempotency-key'
];

function filterHeaders(headers: any): any {
  const filtered: any = {};

  // Only forward allowed headers
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    // Skip blocked headers (including x-tenant-id)
    if (BLOCKED_HEADERS.includes(lowerKey)) {
      continue;
    }

    // Only allow specific headers
    if (ALLOWED_HEADERS.includes(lowerKey) || lowerKey.startsWith('x-custom-')) {
      filtered[key] = value;
    }
  }

  return filtered;
}

export function createAuthenticatedProxy(server: FastifyInstance, options: ProxyOptions) {
  const { serviceUrl, serviceName, publicPaths = [], timeout = 5000 } = options;

  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply, path: string = '') => {
    try {
      const targetUrl = path ? `${serviceUrl}/${path}` : serviceUrl;

      // Filter headers before forwarding
      const filteredHeaders = filterHeaders(request.headers);

      // Add service identification for internal requests
      filteredHeaders['x-gateway-forwarded'] = 'true';
      filteredHeaders['x-original-ip'] = request.ip;

      // Extract tenant_id from JWT and add as internal header
      // This is secure because it comes from the verified JWT, not from the client
      if (request.user) {
        const user = request.user as any;
        if (user.tenant_id) {
          filteredHeaders['x-tenant-id'] = user.tenant_id;
          filteredHeaders['x-tenant-source'] = 'jwt';  // Mark that this came from JWT
        }
      }

      const response = await axios({
        method: request.method as any,
        url: targetUrl,
        headers: filteredHeaders,
        data: request.body,
        params: request.query,
        timeout: timeout,
        maxRedirects: 0,
        validateStatus: () => true,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      // Filter response headers too
      const responseHeaders: any = {};
      for (const [key, value] of Object.entries(response.headers)) {
        const lowerKey = key.toLowerCase();
        // Don't forward internal response headers
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
        service: serviceName,
        url: path
      }, `Proxy error to ${serviceName}`);

      // Handle specific error types
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return reply.code(504).send({
          error: 'Gateway Timeout',
          message: `${serviceName} service timeout after ${timeout}ms`
        });
      }

      if (error.code === 'ECONNREFUSED') {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: `${serviceName} service is down`
        });
      }

      return reply.code(502).send({
        error: 'Bad Gateway',
        message: `${serviceName} service error: ${error.message}`
      });
    }
  };

  return async function setupRoutes(server: FastifyInstance) {
    // Handle base route
    server.all('/', {
      preHandler: async (request, _reply) => {
        const path = request.url.replace(/\?.*$/, '');
        if (!publicPaths.some(p => path.endsWith(p))) {
          await (server as any).authenticate(request);
        }
      }
    }, async (request, reply) => {
      return proxyHandler(request, reply, '');
    });

    // Handle wildcard routes
    server.all('/*', {
      preHandler: async (request, _reply) => {
        const wildcardPath = (request.params as any)['*'] || '';
        const fullPath = '/' + wildcardPath;

        // Check if this is a public path
        const isPublic = publicPaths.some(publicPath => {
          if (publicPath.includes('*')) {
            const regex = new RegExp('^' + publicPath.replace('*', '.*') + '$');
            return regex.test(fullPath);
          }
          return fullPath === publicPath || fullPath.startsWith(publicPath + '/');
        });

        if (!isPublic) {
          await (server as any).authenticate(request);
        }
      }
    }, async (request, reply) => {
      const wildcardPath = (request.params as any)['*'] || '';
      return proxyHandler(request, reply, wildcardPath);
    });
  };
}
