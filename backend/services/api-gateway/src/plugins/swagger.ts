import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';

export const setupSwagger = fp(async (fastify: any) => {
  const swaggerHost = process.env.SWAGGER_HOST || 'api-gateway:3000';
  
  fastify.register(swagger, {
    swagger: {
      info: {
        title: 'TicketToken API Gateway',
        description: 'API documentation for TicketToken platform',
        version: '1.0.0',
      },
      host: swaggerHost,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });
});

export default setupSwagger;
