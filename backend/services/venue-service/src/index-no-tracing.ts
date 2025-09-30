// Skipping tracing for local testing
const sdk = { shutdown: async () => {} };

import { buildApp } from './app';
import { logger } from './utils/logger';

const start = async () => {
  try {
    const app = await buildApp();
    const port = parseInt(process.env.PORT || '3002', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    logger.info(`Venue Service (Fastify) running on http://${host}:${port}`);
  } catch (err) {
    logger.error(err, 'Failed to start venue service');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await sdk.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await sdk.shutdown();
  process.exit(0);
});

start();
