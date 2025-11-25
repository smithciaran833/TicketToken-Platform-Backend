import { Pool } from 'pg';
import { createApp } from './app';
import logger from './utils/logger';
import { validateConfigOrExit, testSolanaConnection, getConfigSummary } from './config/validate';

/**
 * SERVER ENTRY POINT
 * 
 * Application bootstrap and server startup
 * Enhanced with configuration validation and connection testing
 */

// Validate all required environment variables
validateConfigOrExit();

// Log configuration summary
const configSummary = getConfigSummary();
logger.info('Service configuration', configSummary);

// Create database pool
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Handle pool errors
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
  process.exit(-1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database pool');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing database pool');
  await pool.end();
  process.exit(0);
});

// Start server
const PORT = parseInt(process.env.PORT || '3019');
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // Test Solana connection
    const solanaConnected = await testSolanaConnection();
    if (!solanaConnected) {
      logger.warn('Solana connection test failed - service will start but blockchain operations may fail');
    }

    // Create and start application
    const app = await createApp(pool);
    
    await app.listen({ port: PORT, host: HOST });
    
    logger.info(`Transfer service running on ${HOST}:${PORT}`, {
      port: PORT,
      host: HOST,
      healthEndpoint: `http://${HOST}:${PORT}/health`
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
