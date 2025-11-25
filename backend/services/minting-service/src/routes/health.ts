import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConnection } from '../config/solana';
import { getBalanceMonitor } from '../services/BalanceMonitor';
import db from '../config/database';
import { updateSystemHealth } from '../utils/metrics';
import logger from '../utils/logger';

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  timestamp: string;
  version: string;
  uptime: number;
  components?: {
    [key: string]: {
      status: 'healthy' | 'unhealthy';
      message?: string;
      latency?: number;
    };
  };
}

export default async function healthRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  // Basic health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const response: HealthResponse = {
      status: 'healthy',
      service: 'minting-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime()
    };

    return reply.send(response);
  });

  // Detailed health check
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const components: HealthResponse['components'] = {};
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Check Solana connection
    try {
      const startTime = Date.now();
      const connection = getConnection();
      await connection.getVersion();
      const latency = Date.now() - startTime;

      components.solana = {
        status: 'healthy',
        latency,
        message: 'Connected to Solana RPC'
      };
      updateSystemHealth('solana', true);
    } catch (error) {
      components.solana = {
        status: 'unhealthy',
        message: (error as Error).message
      };
      updateSystemHealth('solana', false);
      overallStatus = 'unhealthy';
    }

    // Check database connection
    try {
      const startTime = Date.now();
      await db.raw('SELECT 1');
      const latency = Date.now() - startTime;

      components.database = {
        status: 'healthy',
        latency,
        message: 'Database connection OK'
      };
      updateSystemHealth('database', true);
    } catch (error) {
      components.database = {
        status: 'unhealthy',
        message: (error as Error).message
      };
      updateSystemHealth('database', false);
      overallStatus = 'unhealthy';
    }

    // Check wallet balance
    try {
      const balanceMonitor = getBalanceMonitor();
      const balanceStatus = await balanceMonitor.getBalanceStatus();

      components.wallet = {
        status: balanceStatus.sufficient ? 'healthy' : 'unhealthy',
        message: balanceStatus.balance 
          ? `Balance: ${balanceStatus.balance.toFixed(4)} SOL` 
          : 'Balance unavailable'
      };
      updateSystemHealth('wallet', balanceStatus.sufficient);

      if (!balanceStatus.sufficient) {
        overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
      }
    } catch (error) {
      components.wallet = {
        status: 'unhealthy',
        message: (error as Error).message
      };
      updateSystemHealth('wallet', false);
      overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    const response: HealthResponse = {
      status: overallStatus,
      service: 'minting-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      components
    };

    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 207 : 503;
    return reply.code(statusCode).send(response);
  });

  // Liveness probe (for Kubernetes)
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    // Service is alive if it can respond
    return reply.send({ status: 'alive' });
  });

  // Readiness probe (for Kubernetes)
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical dependencies
      const connection = getConnection();
      await connection.getVersion();

      await db.raw('SELECT 1');

      return reply.send({ status: 'ready' });
    } catch (error) {
      logger.error('Readiness check failed', { error: (error as Error).message });
      return reply.code(503).send({ 
        status: 'not_ready',
        message: (error as Error).message
      });
    }
  });
}
