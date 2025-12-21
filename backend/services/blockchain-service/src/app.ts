import fastify, { FastifyInstance, FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';
import { setTenantContext } from './middleware/tenant-context';
import healthRoutes from './routes/health.routes';
import metricsRoutes from './routes/metrics.routes';
import internalMintRoutes from './routes/internal-mint.routes';
import blockchainRoutes from './routes/blockchain.routes';
import config from './config';
import TreasuryWallet from './wallets/treasury';
import listenerManager from './listeners';
import queueManager from './queues';
import { logger } from './utils/logger';
import BlockchainQueryService from './services/BlockchainQueryService';
import TransactionConfirmationService from './services/TransactionConfirmationService';
import RPCFailoverService from './services/RPCFailoverService';

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';

// Global state for infrastructure components
let treasuryWallet: TreasuryWallet | null = null;
let db: Pool | null = null;
let solanaConnection: Connection | null = null;
let rpcFailover: RPCFailoverService | null = null;
let blockchainQuery: BlockchainQueryService | null = null;
let transactionConfirmation: TransactionConfirmationService | null = null;

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4()
  });

  // Register plugins
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
      logger.error('Failed to set tenant context', error);
    }
  });

  // Initialize infrastructure components
  logger.info('Initializing blockchain service infrastructure...');

  try {
    // Initialize Solana connection
    solanaConnection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment as any,
      wsEndpoint: config.solana.wsUrl
    });
    logger.info('Solana connection initialized', { rpcUrl: config.solana.rpcUrl });

    // Initialize database connection pool
    db = new Pool(config.database);
    
    // Decorate app with db for middleware
    app.decorate('db', db);
    
    // Test database connection
    await db.query('SELECT 1');
    logger.info('Database connection pool initialized');

    // Initialize treasury wallet
    treasuryWallet = new TreasuryWallet(solanaConnection, db);
    await treasuryWallet.initialize();
    logger.info('Treasury wallet initialized');

    // Check treasury balance
    const balance = await treasuryWallet.getBalance();
    logger.info('Treasury wallet balance', { balance, unit: 'SOL' });
    
    if (balance < 0.1) {
      logger.warn('Treasury wallet has low balance - needs funding!', { 
        balance, 
        minimumRecommended: 0.1 
      });
    }

    // Initialize event listener system
    if (config.solana.programId) {
      await listenerManager.initialize();
      logger.info('Event listener system initialized');
    } else {
      logger.warn('Program ID not configured - event listeners will not start');
    }

    // Initialize queue system
    await queueManager.initialize();
    logger.info('Queue system initialized');

    // Initialize RPC failover (if multiple endpoints configured)
    const rpcEndpoints = (process.env.SOLANA_RPC_ENDPOINTS || config.solana.rpcUrl)
      .split(',')
      .map(url => url.trim());
    
    if (rpcEndpoints.length > 1) {
      rpcFailover = new RPCFailoverService({
        endpoints: rpcEndpoints,
        commitment: config.solana.commitment as any
      });
      solanaConnection = rpcFailover.getConnection();
      logger.info('RPC Failover initialized', { endpoints: rpcEndpoints.length });
    }

    // Initialize blockchain services
    blockchainQuery = new BlockchainQueryService(solanaConnection);
    transactionConfirmation = new TransactionConfirmationService(solanaConnection);
    logger.info('Blockchain services initialized');

    // Decorate Fastify instance with services for route access
    app.decorate('blockchainQuery', blockchainQuery);
    app.decorate('transactionConfirmation', transactionConfirmation);
    app.decorate('rpcFailover', rpcFailover);

  } catch (error: any) {
    logger.error('Failed to initialize infrastructure', { error: error.message, stack: error.stack });
    throw error;
  }

  // Register routes
  await app.register(healthRoutes);
  await app.register(metricsRoutes);
  await app.register(internalMintRoutes);
  await app.register(blockchainRoutes);

  // Ready endpoint - checks if all systems are operational
  app.get('/ready', async (request, reply) => {
    try {
      const checks = {
        treasury: treasuryWallet !== null,
        database: db !== null,
        solana: solanaConnection !== null,
        listeners: listenerManager ? true : false,
        queues: queueManager ? true : false
      };

      const allReady = Object.values(checks).every(status => status === true);

      if (allReady) {
        return { 
          ready: true,
          systems: checks
        };
      } else {
        return reply.status(503).send({ 
          ready: false,
          systems: checks
        });
      }
    } catch (error: any) {
      logger.error('Readiness check failed', { error: error.message });
      return reply.status(503).send({ ready: false, error: error.message });
    }
  });

  // Service info endpoint
  app.get('/info', async (request, reply) => {
    return {
      service: SERVICE_NAME,
      version: '1.0.0',
      port: process.env.PORT || 3011,
      status: 'healthy'
    };
  });

  // Basic service endpoint
  app.get('/api/v1/status', async (request, reply) => {
    return {
      status: 'running',
      service: SERVICE_NAME,
      port: process.env.PORT || 3011
    };
  });

  // Test communication endpoint
  app.get('/api/v1/test-communication', async (request, reply) => {
    return {
      success: true,
      service: SERVICE_NAME,
      message: 'Service communication not yet implemented'
    };
  });

  // Error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    logger.error('Unhandled error', { 
      error: error.message, 
      stack: error.stack,
      path: request.url,
      method: request.method
    });
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message
    });
  });

  return app;
}

// Shutdown function to clean up resources
export async function shutdownApp(): Promise<void> {
  logger.info('Shutting down blockchain service infrastructure...');

  try {
    // Shutdown queue system
    if (queueManager) {
      await queueManager.shutdown();
      logger.info('Queue system shut down');
    }

    // Shutdown event listeners
    if (listenerManager) {
      await listenerManager.shutdown();
      logger.info('Event listener system shut down');
    }

    // Close database connection pool
    if (db) {
      await db.end();
      logger.info('Database connection pool closed');
    }

    logger.info('Blockchain service infrastructure shutdown complete');
  } catch (error: any) {
    logger.error('Error during shutdown', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Export infrastructure components for access by other modules
export function getInfrastructure() {
  return {
    treasuryWallet,
    db,
    solanaConnection,
    listenerManager,
    queueManager
  };
}
