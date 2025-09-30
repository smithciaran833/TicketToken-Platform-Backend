import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import { initializeContainer } from './config/dependencies';
import { configureFastify } from './config/fastify';

export async function buildApp(): Promise<FastifyInstance> {
  // Initialize dependency injection container
  const container = await initializeContainer();

  // Create Fastify instance with built-in logger
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
    bodyLimit: 10485760, // 10MB
  });

  // Decorate with container
  fastify.decorate('container', container);

  // Configure Fastify with plugins and routes
  await configureFastify(fastify, container);

  return fastify;
}
