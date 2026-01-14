import fastify, { FastifyInstance, FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';
import { tenantContextMiddleware, optionalTenantContextMiddleware } from './middleware/tenant-context';
import { BaseError, isBaseError, NotFoundError, ErrorCode } from './errors';
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
// AUDIT FIX #51, #53: Load management middleware
import { loadSheddingMiddleware, getLoadStatus, getLoadSheddingMetrics } from './middleware/load-shedding';
import { getBulkheadMetrics, getBulkheadTypeForRoute, createBulkheadMiddleware, BulkheadType } from './middleware/bulkhead';

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';

// Global state for infrastructure components
let treasuryWallet: TreasuryWallet | null = null;
let db: Pool | null = null;
let solanaConnection: Connection | null = null;
let rpcFailover: RPCFailoverService | null = null;
let blockchainQuery: BlockchainQueryService | null = null;
let transactionConfirmation: TransactionConfirmationService | null = null;

/**
 * AUDIT FIX #30: Trusted proxy configuration
 * 
 * Instead of trustProxy: true (trust all), we restrict to known proxy IPs.
 * Options:
 * - Array of trusted IPs/CIDRs for explicit trust
 * - Number (e.g., 1) to trust only N hops
 * - Function for custom validation
 * 
 * Default: Trust only private network ranges (internal load balancers)
 */
const TRUSTED_PROXIES = process.env.TRUSTED_PROXIES
  ? process.env.TRUSTED_PROXIES.split(',').map(s => s.trim())
  : [
      // Loopback
      '127.0.0.1',
      '::1',
      // Private networks (internal LBs, Kubernetes, Docker)
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      // IPv6 private
      'fc00::/7',
      'fe80::/10'
    ];

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    // AUDIT FIX #30: Restrict trustProxy to known proxy IPs
    // This prevents IP spoofing attacks via X-Forwarded-For headers
    trustProxy: TRUSTED_PROXIES,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4()
  });

  logger.info('Fastify configured with restricted trustProxy', {
    trustedProxies: TRUSTED_PROXIES.length,
    proxies: TRUSTED_PROXIES.slice(0, 3).concat(TRUSTED_PROXIES.length > 3 ? ['...'] : [])
  });

  // Register plugins
  await app.register(helmet);
  await app.register(cors);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  // AUDIT FIX #53: Register load shedding middleware early in the chain
  // This allows the service to gracefully degrade under high load
  app.addHook('onRequest', loadSheddingMiddleware);
  logger.info('Load shedding middleware registered');

  // Note: Tenant context middleware is applied per-route based on authentication requirements
  // - Public routes (health, metrics): No tenant context needed
  // - Authenticated routes: Use tenantContextMiddleware via preHandler hook
  // - Internal service routes: Validate tenant from JWT claims

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

  // Issue #6: 404 Not Found handler
  app.setNotFoundHandler((request, reply) => {
    const notFoundError = new NotFoundError('Route', request.url);
    
    logger.warn('Route not found', {
      path: request.url,
      method: request.method,
      ip: request.ip,
      requestId: request.id
    });

    reply
      .code(404)
      .type('application/problem+json')
      .send(notFoundError.toProblemDetails(request.id as string, request.url));
  });

  // Issue #7, #8: RFC 7807 Error handler (no stack traces in production)
  app.setErrorHandler((error: FastifyError | BaseError, request, reply) => {
    const requestId = request.id as string;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Log the error with full details (server-side only)
    logger.error('Request error', {
      error: error.message,
      code: isBaseError(error) ? error.code : error.code,
      stack: error.stack,
      path: request.url,
      method: request.method,
      requestId,
      statusCode: isBaseError(error) ? error.statusCode : error.statusCode || 500
    });

    // If it's our custom BaseError, use RFC 7807 format
    if (isBaseError(error)) {
      const problemDetails = error.toProblemDetails(requestId, request.url);
      
      // Issue #8: Don't include stack traces in production
      if (!isProduction && error.stack) {
        problemDetails.stack = error.stack;
      }

      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(problemDetails);
    }

    // Handle Fastify validation errors
    if (error.validation) {
      return reply
        .code(400)
        .type('application/problem+json')
        .send({
          type: 'https://api.tickettoken.com/errors/VALIDATION_FAILED',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: ErrorCode.VALIDATION_FAILED,
          instance: request.url,
          timestamp: new Date().toISOString(),
          traceId: requestId,
          validationErrors: error.validation
        });
    }

    // Generic error - RFC 7807 format without exposing internals
    const statusCode = error.statusCode || 500;
    const isServerError = statusCode >= 500;

    return reply
      .code(statusCode)
      .type('application/problem+json')
      .send({
        type: `https://api.tickettoken.com/errors/${isServerError ? 'INTERNAL_ERROR' : 'BAD_REQUEST'}`,
        title: isServerError ? 'Internal Server Error' : 'Bad Request',
        status: statusCode,
        // Issue #8: Don't expose internal error messages in production for 5xx
        detail: isProduction && isServerError 
          ? 'An unexpected error occurred. Please try again later.'
          : error.message,
        code: isServerError ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST,
        instance: request.url,
        timestamp: new Date().toISOString(),
        traceId: requestId
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
