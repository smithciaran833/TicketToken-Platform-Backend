import { AwilixContainer } from 'awilix';

declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }
}
