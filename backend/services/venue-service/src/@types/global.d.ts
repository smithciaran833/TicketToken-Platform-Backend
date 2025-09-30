import { AwilixContainer } from 'awilix';
import { JWT } from '@fastify/jwt';
import { FastifyInstance as OriginalFastifyInstance } from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance extends OriginalFastifyInstance {
    container: AwilixContainer;
    jwt: JWT;
  }
  
  export interface FastifyRequest {
    startTime?: number;
  }
}
