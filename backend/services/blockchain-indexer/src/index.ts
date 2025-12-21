import 'dotenv/config';
import fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { connectMongoDB, disconnectMongoDB } from './config/mongodb';
import { setTenantContext } from './middleware/tenant-context';
import BlockchainIndexer from './indexer';
import config from './config';
import logger from './utils/logger';
import queryRoutes from './routes/query.routes';
import { register, isHealthy } from './utils/metrics';
import db from './utils/database';
import { validateConfigOrExit, testAllConnections, getConfigSummary } from './config/validate';

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-indexer';
const PORT = parseInt(process.env.PORT || '3012', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startService(): Promise<void> {
  try {
    logger.info(`Starting ${SERVICE_NAME}...`);

    // Validate configuration
    validateConfigOrExit();

    // Log configuration summary
    const configSummary = getConfigSummary();
    logger.info({ config: configSummary }, 'Service configuration');

    // Test all connections before starting
    logger.info('Testing service connections...');
    const connectionsOk = await testAllConnections();
    if (!connectionsOk) {
      logger.warn('Some connections failed during testing, but service will attempt to start');
    }

    // Connect to MongoDB
    await connectMongoDB();

    // Initialize BlockchainIndexer
    let indexer: BlockchainIndexer | null = null;
    
    try {
      logger.info('Initializing BlockchainIndexer...');
      
      indexer = new BlockchainIndexer({
        solana: {
          rpcUrl: process.env.SOLANA_RPC_URL!,
          wsUrl: process.env.SOLANA_WS_URL,
          commitment: (process.env.SOLANA_COMMITMENT as any) || 'confirmed',
          programId: process.env.SOLANA_PROGRAM_ID
        }
      });
      
      const initialized = await indexer.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize indexer');
      }
      
      await indexer.start();
      logger.info('✅ BlockchainIndexer started successfully');
      
    } catch (error) {
      logger.error({ error }, '❌ Failed to start BlockchainIndexer');
      throw error;
    }

    const app = fastify({
      logger: false,
      trustProxy: true,
      requestIdHeader: 'x-request-id',
      genReqId: () => uuidv4()
    });

    await app.register(helmet);
    await app.register(cors);
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    // Tenant isolation middleware
    app.addHook('onRequest', async (request, reply) => {
      try {
        await setTenantContext(request, reply);
      } catch (error) {
        // Allow request to proceed - RLS will block unauthorized access
      }
    });

    app.get('/health', async (request, reply) => {
      try {
        // Check indexer status
        const indexerRunning = indexer && (indexer as any).isRunning;
        
        // Check MongoDB connection
        const mongooseConnection = require('./config/mongodb').mongoose.connection;
        const mongoConnected = mongooseConnection.readyState === 1;
        
        // Check PostgreSQL connection
        let pgConnected = false;
        try {
          await db.query('SELECT 1');
          pgConnected = true;
        } catch (err) {
          logger.error({ error: err }, 'PostgreSQL health check failed');
        }
        
        // Check indexer state
        let indexerState: any = null;
        let lag = 0;
        try {
          const result = await db.query('SELECT * FROM indexer_state WHERE id = 1');
          if (result.rows.length > 0) {
            indexerState = result.rows[0];
            // Calculate lag (would need current slot from indexer)
            lag = (indexer as any).syncStats?.lag || 0;
          }
        } catch (err) {
          logger.error({ error: err }, 'Failed to get indexer state');
        }
        
        const allHealthy = mongoConnected && pgConnected && indexerRunning;
        const status = allHealthy ? 'healthy' : 'degraded';
        
        // Update Prometheus health metric
        isHealthy.set(allHealthy ? 1 : 0);
        
        if (!allHealthy) {
          return reply.code(503).send({
            status,
            service: SERVICE_NAME,
            timestamp: new Date().toISOString(),
            checks: {
              mongodb: mongoConnected ? 'ok' : 'failed',
              postgresql: pgConnected ? 'ok' : 'failed',
              indexer: indexerRunning ? 'running' : 'stopped'
            },
            indexer: indexerState ? {
              lastProcessedSlot: indexerState.last_processed_slot,
              lag,
              isRunning: indexerState.is_running
            } : null
          });
        }
        
        return {
          status,
          service: SERVICE_NAME,
          timestamp: new Date().toISOString(),
          checks: {
            mongodb: 'ok',
            postgresql: 'ok',
            indexer: 'running'
          },
          indexer: indexerState ? {
            lastProcessedSlot: indexerState.last_processed_slot,
            lag,
            isRunning: indexerState.is_running
          } : null
        };
      } catch (error) {
        logger.error({ error }, 'Health check error');
        isHealthy.set(0);
        return reply.code(503).send({
          status: 'unhealthy',
          service: SERVICE_NAME,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    app.get('/info', async (request, reply) => {
      return {
        service: SERVICE_NAME,
        version: '1.0.0',
        port: PORT,
        status: 'healthy'
      };
    });

    app.get('/api/v1/status', async (request, reply) => {
      return {
        status: 'running',
        service: SERVICE_NAME,
        port: PORT
      };
    });

    app.get('/api/v1/test-communication', async (request, reply) => {
      return {
        success: true,
        service: SERVICE_NAME,
        message: 'Service communication not yet implemented'
      };
    });

    // Register query routes
    await app.register(queryRoutes);
    logger.info('Query routes registered');

    // Metrics endpoint (no auth required for Prometheus)
    app.get('/metrics', async (request, reply) => {
      try {
        reply.header('Content-Type', register.contentType);
        return await register.metrics();
      } catch (error) {
        logger.error({ error }, 'Error generating metrics');
        return reply.code(500).send({ error: 'Failed to generate metrics' });
      }
    });
    logger.info('Metrics endpoint registered at /metrics');

    app.setErrorHandler((error, request, reply) => {
      logger.error({ error }, 'Unhandled error');
      reply.status(500).send({
        error: 'Internal Server Error',
        message: (error as Error).message
      });
    });

    await app.listen({ port: PORT, host: HOST });
    logger.info(`✅ ${SERVICE_NAME} running on port ${PORT}`);
    logger.info(`   - Health: http://${HOST}:${PORT}/health`);
    logger.info(`   - Info: http://${HOST}:${PORT}/info`);

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down ${SERVICE_NAME}...`);
      
      if (indexer) {
        logger.info('Stopping BlockchainIndexer...');
        await indexer.stop();
        logger.info('✅ BlockchainIndexer stopped');
      }
      
      await disconnectMongoDB();
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, `Failed to start ${SERVICE_NAME}`);
    process.exit(1);
  }
}

startService().catch((error) => {
  logger.error({ error }, 'Failed to start service');
  process.exit(1);
});
