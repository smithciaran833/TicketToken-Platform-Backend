import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/database';
import { RedisService } from '../services/redisService';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { 
      status: 'healthy', 
      service: 'payment-service',
      timestamp: new Date().toISOString()
    };
  });

  // Database health check
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const duration = Date.now() - start;
      
      return {
        status: 'healthy',
        database: 'connected',
        responseTime: `${duration}ms`,
        service: 'payment-service'
      };
    } catch (error: any) {
      reply.status(503);
      return {
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'payment-service'
      };
    }
  });

  // Redis health check
  fastify.get('/health/redis', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const start = Date.now();
      const redis = RedisService.getClient();
      await redis.ping();
      const duration = Date.now() - start;
      
      return {
        status: 'healthy',
        redis: 'connected',
        responseTime: `${duration}ms`,
        service: 'payment-service'
      };
    } catch (error: any) {
      reply.status(503);
      return {
        status: 'error',
        redis: 'disconnected',
        error: error.message,
        service: 'payment-service'
      };
    }
  });

  // Stripe API health check
  fastify.get('/health/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!stripe) {
      reply.status(503);
      return {
        status: 'error',
        stripe: 'not_configured',
        error: 'STRIPE_SECRET_KEY not set',
        service: 'payment-service'
      };
    }

    try {
      const start = Date.now();
      // Make a lightweight API call to check connectivity
      await stripe.balance.retrieve();
      const duration = Date.now() - start;
      
      return {
        status: 'healthy',
        stripe: 'connected',
        responseTime: `${duration}ms`,
        service: 'payment-service'
      };
    } catch (error: any) {
      reply.status(503);
      return {
        status: 'error',
        stripe: 'unreachable',
        error: error.message,
        service: 'payment-service'
      };
    }
  });

  // Comprehensive readiness check (for K8s readiness probe)
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      database: false,
      redis: false,
      stripe: false
    };
    
    const errors: string[] = [];

    // Check database
    try {
      await pool.query('SELECT 1');
      checks.database = true;
    } catch (error: any) {
      errors.push(`Database: ${error.message}`);
    }

    // Check Redis
    try {
      const redis = RedisService.getClient();
      await redis.ping();
      checks.redis = true;
    } catch (error: any) {
      errors.push(`Redis: ${error.message}`);
    }

    // Check Stripe (optional - don't fail readiness if missing in dev)
    if (stripe) {
      try {
        await stripe.balance.retrieve();
        checks.stripe = true;
      } catch (error: any) {
        errors.push(`Stripe: ${error.message}`);
      }
    } else {
      checks.stripe = true; // Don't fail if not configured
    }

    const allHealthy = checks.database && checks.redis && checks.stripe;

    if (!allHealthy) {
      reply.status(503);
      return {
        status: 'not_ready',
        checks,
        errors,
        service: 'payment-service'
      };
    }

    return {
      status: 'ready',
      checks,
      service: 'payment-service',
      timestamp: new Date().toISOString()
    };
  });
}
