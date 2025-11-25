import { createServer, startMonitoring } from './server';
import { logger } from './logger';
import knex from 'knex';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3017');

async function start() {
  try {
    // Run database migrations using knexfile
    logger.info('Running database migrations...');
    const knexConfig = require(path.join(__dirname, '../knexfile.js'));
    const migrationDb = knex(knexConfig[process.env.NODE_ENV || 'development']);
    await migrationDb.migrate.latest();
    await migrationDb.destroy();
    logger.info('Database migrations complete');

    // Create Fastify server
    const app = await createServer();

    // Start server
    await app.listen({
      port: PORT,
      host: '0.0.0.0',
    });

    logger.info(`Monitoring service running on port ${PORT}`);
    logger.info(`Metrics available at http://0.0.0.0:${PORT}/metrics`);
    logger.info(`Health check at http://0.0.0.0:${PORT}/health`);

    // Start monitoring loops
    startMonitoring();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully...');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
