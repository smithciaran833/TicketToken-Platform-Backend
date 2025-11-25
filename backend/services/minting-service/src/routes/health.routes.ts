import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConnection, getWallet } from '../config/solana';
import { getPool } from '../config/database';
import { walletBalanceSOL } from '../utils/metrics';
import logger from '../utils/logger';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
      responseTime?: number;
    };
  };
}

export default async function healthRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  // Basic health check - fast response
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'minting-service'
    });
  });

  // Detailed health check - checks all dependencies
  fastify.get('/health/full', async (request: FastifyRequest, reply: FastifyReply) => {
    const healthCheck: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    let hasFailures = false;
    let hasDegradation = false;

    // Check PostgreSQL
    try {
      const start = Date.now();
      const pool = getPool();
      await pool.query('SELECT 1');
      healthCheck.checks.database = {
        status: 'pass',
        responseTime: Date.now() - start
      };
    } catch (error) {
      hasFailures = true;
      healthCheck.checks.database = {
        status: 'fail',
        message: (error as Error).message
      };
    }

    // Check Solana RPC
    try {
      const start = Date.now();
      const connection = getConnection();
      const slot = await connection.getSlot();
      healthCheck.checks.solana_rpc = {
        status: 'pass',
        responseTime: Date.now() - start,
        message: `Current slot: ${slot}`
      };
    } catch (error) {
      hasFailures = true;
      healthCheck.checks.solana_rpc = {
        status: 'fail',
        message: (error as Error).message
      };
    }

    // Check wallet balance
    try {
      const connection = getConnection();
      const wallet = getWallet();
      const balance = await connection.getBalance(wallet.publicKey);
      const balanceSOL = balance / 1e9;
      
      walletBalanceSOL.set(balanceSOL);
      
      const minBalance = parseFloat(process.env.MIN_SOL_BALANCE || '0.1');
      if (balanceSOL < minBalance) {
        hasDegradation = true;
        healthCheck.checks.wallet_balance = {
          status: 'fail',
          message: `Low balance: ${balanceSOL} SOL (minimum: ${minBalance} SOL)`
        };
      } else {
        healthCheck.checks.wallet_balance = {
          status: 'pass',
          message: `Balance: ${balanceSOL.toFixed(4)} SOL`
        };
      }
    } catch (error) {
      hasFailures = true;
      healthCheck.checks.wallet_balance = {
        status: 'fail',
        message: (error as Error).message
      };
    }

    // Check IPFS (if configured)
    if (process.env.PINATA_JWT || process.env.PINATA_API_KEY) {
      try {
        const start = Date.now();
        const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.PINATA_JWT || process.env.PINATA_API_KEY}`
          }
        });
        
        if (response.ok) {
          healthCheck.checks.ipfs = {
            status: 'pass',
            responseTime: Date.now() - start
          };
        } else {
          hasDegradation = true;
          healthCheck.checks.ipfs = {
            status: 'fail',
            message: `HTTP ${response.status}`
          };
        }
      } catch (error) {
        hasDegradation = true;
        healthCheck.checks.ipfs = {
          status: 'fail',
          message: (error as Error).message
        };
      }
    }

    // Determine overall status
    if (hasFailures) {
      healthCheck.status = 'unhealthy';
    } else if (hasDegradation) {
      healthCheck.status = 'degraded';
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                       healthCheck.status === 'degraded' ? 200 : 503;

    reply.code(statusCode).send(healthCheck);
  });

  // Readiness check - is service ready to accept traffic?
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical dependencies only
      const pool = getPool();
      await pool.query('SELECT 1');
      
      const connection = getConnection();
      await connection.getSlot();
      
      reply.send({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: (error as Error).message
      });
    }
  });

  // Liveness check - is service alive?
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });
}
