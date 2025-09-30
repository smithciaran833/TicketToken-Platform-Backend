import { serviceUrls } from '../config/services';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

export default async function ticketsRoutes(server: FastifyInstance) {
  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply, path: string = '') => {
    try {
      const targetUrl = path 
        ? `${serviceUrls.ticket}/api/v1/tickets/${path}`
        : `${serviceUrls.ticket}/api/v1/tickets`;
      
      const response = await axios({
        method: request.method as any,
        url: targetUrl,
        headers: {
          ...request.headers,
          host: undefined,
          'content-length': undefined,
        },
        data: request.body,
        params: request.query,
        validateStatus: () => true,
      });

      return reply
        .code(response.status)
        .headers(response.headers as any)
        .send(response.data);
        
    } catch (error: any) {
      server.log.error({ error: error.message }, 'Proxy error to tickets');
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'tickets service unavailable'
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
