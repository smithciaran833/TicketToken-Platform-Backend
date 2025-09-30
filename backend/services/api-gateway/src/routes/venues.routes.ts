import { serviceUrls } from '../config/services';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

export default async function venuesRoutes(server: FastifyInstance) {
  // Handler function for proxying
  const proxyToVenueService = async (request: FastifyRequest, reply: FastifyReply, path: string = '') => {
    try {
      const targetUrl = path 
        ? `${serviceUrls.venue}/api/v1/venues/${path}`
        : `${serviceUrls.venue}/api/v1/venues`;
      
      console.log('Venue proxy:', {
        path,
        targetUrl,
        method: request.method
      });

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
      console.error('Venue proxy error:', error.message);
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Venue service unavailable'
      });
    }
  };

  // Register both base route and wildcard
  server.all('/', async (request, reply) => {
    return proxyToVenueService(request, reply, '');
  });

  server.all('/*', async (request, reply) => {
    const wildcardPath = (request.params as any)['*'] || '';
    return proxyToVenueService(request, reply, wildcardPath);
  });
}
