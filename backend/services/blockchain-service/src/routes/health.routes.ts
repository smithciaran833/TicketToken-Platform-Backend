import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getInfrastructure } from '../app';
import { logger } from '../utils/logger';

export default async function healthRoutes(fastify: FastifyInstance) {
  /**
   * Basic health check
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { 
      status: 'healthy', 
      service: 'blockchain-service',
      timestamp: new Date().toISOString()
    };
  });

  /**
   * Comprehensive health check with all dependencies
   */
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const infrastructure = getInfrastructure();
    const checks: any = {
      service: 'blockchain-service',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };

    let allHealthy = true;

    // Check database
    try {
      if (infrastructure.db) {
        await infrastructure.db.query('SELECT 1');
        checks.checks.database = {
          status: 'healthy',
          message: 'Database connection active'
        };
      } else {
        checks.checks.database = {
          status: 'unhealthy',
          message: 'Database not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.database = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check Solana RPC
    try {
      if (infrastructure.solanaConnection) {
        const slot = await infrastructure.solanaConnection.getSlot();
        checks.checks.solana = {
          status: 'healthy',
          message: 'Solana RPC connection active',
          currentSlot: slot
        };
      } else {
        checks.checks.solana = {
          status: 'unhealthy',
          message: 'Solana connection not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.solana = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check treasury wallet
    try {
      if (infrastructure.treasuryWallet) {
        const balance = await infrastructure.treasuryWallet.getBalance();
        
        checks.checks.treasury = {
          status: balance > 0.01 ? 'healthy' : 'warning',
          message: balance > 0.01 ? 'Treasury wallet has sufficient balance' : 'Treasury wallet balance is low',
          balance: balance,
          balanceSOL: `${balance.toFixed(4)} SOL`
        };
        
        if (balance <= 0.01) {
          allHealthy = false;
        }
      } else {
        checks.checks.treasury = {
          status: 'unhealthy',
          message: 'Treasury wallet not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.treasury = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check listener system
    try {
      if (infrastructure.listenerManager) {
        checks.checks.listeners = {
          status: 'healthy',
          message: 'Event listener system active'
        };
      } else {
        checks.checks.listeners = {
          status: 'warning',
          message: 'Event listener system not configured (PROGRAM_ID not set)'
        };
      }
    } catch (error: any) {
      checks.checks.listeners = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check queue system
    try {
      if (infrastructure.queueManager) {
        checks.checks.queues = {
          status: 'healthy',
          message: 'Queue system active'
        };
      } else {
        checks.checks.queues = {
          status: 'unhealthy',
          message: 'Queue system not initialized'
        };
        allHealthy = false;
      }
    } catch (error: any) {
      checks.checks.queues = {
        status: 'unhealthy',
        message: error.message
      };
      allHealthy = false;
    }

    // Check RPC failover (if available)
    const rpcFailover = (fastify as any).rpcFailover;
    if (rpcFailover) {
      try {
        const endpoints = rpcFailover.getHealthStatus();
        const healthyCount = endpoints.filter((e: any) => e.healthy).length;
        
        checks.checks.rpcFailover = {
          status: healthyCount > 0 ? 'healthy' : 'unhealthy',
          message: `${healthyCount}/${endpoints.length} RPC endpoints healthy`,
          endpoints: endpoints.map((e: any) => ({
            url: e.url,
            healthy: e.healthy,
            latency: e.latency,
            lastCheck: new Date(e.lastCheck).toISOString()
          }))
        };
        
        if (healthyCount === 0) {
          allHealthy = false;
        }
      } catch (error: any) {
        checks.checks.rpcFailover = {
          status: 'warning',
          message: 'RPC failover check failed: ' + error.message
        };
      }
    }

    checks.status = allHealthy ? 'healthy' : 'degraded';

    if (!allHealthy) {
      return reply.status(503).send(checks);
    }

    return checks;
  });

  /**
   * Database health check
   */
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const infrastructure = getInfrastructure();
      
      if (!infrastructure.db) {
        return reply.status(503).send({
          status: 'error',
          database: 'not_initialized',
          service: 'blockchain-service'
        });
      }

      await infrastructure.db.query('SELECT 1');
      
      return {
        status: 'healthy',
        database: 'connected',
        service: 'blockchain-service'
      };
    } catch (error: any) {
      logger.error('Database health check failed', {
        error: error.message
      });
      
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'blockchain-service'
      });
    }
  });

  /**
   * Solana RPC health check
   */
  fastify.get('/health/solana', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const infrastructure = getInfrastructure();
      
      if (!infrastructure.solanaConnection) {
        return reply.status(503).send({
          status: 'error',
          solana: 'not_initialized',
          service: 'blockchain-service'
        });
      }

      const startTime = Date.now();
      const slot = await infrastructure.solanaConnection.getSlot();
      const latency = Date.now() - startTime;
      
      return {
        status: 'healthy',
        solana: 'connected',
        currentSlot: slot,
        latency: `${latency}ms`,
        service: 'blockchain-service'
      };
    } catch (error: any) {
      logger.error('Solana health check failed', {
        error: error.message
      });
      
      return reply.status(503).send({
        status: 'error',
        solana: 'disconnected',
        error: error.message,
        service: 'blockchain-service'
      });
    }
  });

  /**
   * Treasury wallet health check
   */
  fastify.get('/health/treasury', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const infrastructure = getInfrastructure();
      
      if (!infrastructure.treasuryWallet) {
        return reply.status(503).send({
          status: 'error',
          treasury: 'not_initialized',
          service: 'blockchain-service'
        });
      }

      const balance = await infrastructure.treasuryWallet.getBalance();
      
      const isHealthy = balance > 0.01;
      
      return {
        status: isHealthy ? 'ok' : 'warning',
        treasury: isHealthy ? 'sufficient_balance' : 'low_balance',
        balance: balance,
        balanceSOL: `${balance.toFixed(4)} SOL`,
        service: 'blockchain-service'
      };
    } catch (error: any) {
      logger.error('Treasury health check failed', {
        error: error.message
      });
      
      return reply.status(503).send({
        status: 'error',
        treasury: 'check_failed',
        error: error.message,
        service: 'blockchain-service'
      });
    }
  });
}
