import { FastifyInstance } from 'fastify';
import { buildApp } from './app';

export async function createServer(): Promise<FastifyInstance> {
  const app = await buildApp();
  return app;
}
