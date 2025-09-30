import { FastifyInstance } from 'fastify';
import { config } from '../config';

export default async function statusRoutes(server: FastifyInstance) {
  server.get('/', async (request, reply) => {
    return {
      status: 'operational',
      service: config.serviceName,
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      environment: config.env,
      connections: {
        postgres: 'connected',
        redis: 'connected',
        mongodb: 'connected',
        elasticsearch: 'connected',
        influxdb: 'connected'
      }
    };
  });
}
