import fastify, { FastifyInstance } from 'fastify';
import { config } from './config';
import { logger } from './utils/logger';
import { setupMiddleware } from './middleware';
import { setupRoutes } from './routes';
import { setupServices } from './services';
import { setupSwagger } from './plugins/swagger';
import { gracefulShutdown } from './utils/graceful-shutdown';
import { nanoid } from 'nanoid';

// Create Fastify instance with custom logger
const server: FastifyInstance = fastify({
  logger: logger as any,
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  genReqId: (req) => (req.headers['x-request-id'] as string) || nanoid(),
  bodyLimit: 10485760, // 10MB
  caseSensitive: false,
  ignoreTrailingSlash: true,
  maxParamLength: 500,
  connectionTimeout: 30000, // 30 seconds
  keepAliveTimeout: 72000, // 72 seconds
  pluginTimeout: 30000, // 30 seconds for plugin registration
});

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled Rejection');
  process.exit(1);
});

// Start server
async function start() {
  try {
    // Setup dependency injection and services
    await setupServices(server);
    
    // Setup middleware in correct order
    await setupMiddleware(server);
    
    // Setup Swagger documentation BEFORE routes
    await setupSwagger(server);
    
    // Setup routes
    await setupRoutes(server);
    
    // Start listening
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(
      `API Gateway running at http://${config.server.host}:${config.server.port}`
    );
    logger.info(
      `📚 API Documentation available at http://${config.server.host}:${config.server.port}/documentation`
    );

    // Setup graceful shutdown
    gracefulShutdown(server);
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
start();
