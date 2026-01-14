import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { db, analyticsDb } from '../config/database';
import { getRedis } from '../config/redis';
import { getChannel } from '../config/rabbitmq';
import { getMongoClient } from '../config/mongodb';
import { logger } from '../utils/logger';

interface HealthStatus {
  status: string;
  healthy: boolean;
  latency?: number;
  error?: string;
}

class HealthController extends BaseController {
  health = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return this.success(reply, { 
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'analytics-service'
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  readiness = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const startTime = Date.now();
      
      // Test critical dependencies
      const dbStatus = await this.testDatabaseConnection();
      const redisStatus = await this.testRedisConnection();
      const rabbitmqStatus = await this.testRabbitMQConnection();
      
      const totalLatency = Date.now() - startTime;
      
      // Service is ready only if all critical dependencies are healthy
      const isReady = dbStatus.healthy && redisStatus.healthy && rabbitmqStatus.healthy;
      
      const response = {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbStatus,
          redis: redisStatus,
          rabbitmq: rabbitmqStatus
        },
        totalLatency
      };
      
      // Return 503 if not ready
      if (!isReady) {
        return reply.code(503).send(response);
      }
      
      return this.success(reply, response);
    } catch (error) {
      logger.error('Readiness check failed:', error);
      return reply.code(503).send({
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };

  liveness = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      // Liveness check - just verify the application is running
      // Don't check external dependencies here
      return this.success(reply, { 
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  dependencies = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const [postgresStatus, redisStatus, rabbitmqStatus, mongodbStatus] = await Promise.all([
        this.testDatabaseConnection(),
        this.testRedisConnection(),
        this.testRabbitMQConnection(),
        this.testMongoDBConnection()
      ]);
      
      const response = {
        timestamp: new Date().toISOString(),
        dependencies: {
          postgres: postgresStatus,
          redis: redisStatus,
          rabbitmq: rabbitmqStatus,
          mongodb: mongodbStatus
        }
      };
      
      // Return 503 if any critical dependency is unhealthy
      const allHealthy = postgresStatus.healthy && redisStatus.healthy && rabbitmqStatus.healthy;
      if (!allHealthy) {
        return reply.code(503).send(response);
      }
      
      return this.success(reply, response);
    } catch (error) {
      logger.error('Dependencies check failed:', error);
      return reply.code(503).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };

  private async testDatabaseConnection(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Test main database
      await db.raw('SELECT 1');
      
      // Test analytics database
      await analyticsDb.raw('SELECT 1');
      
      const latency = Date.now() - startTime;
      
      return {
        status: 'ok',
        healthy: true,
        latency
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('Database health check failed:', error);
      
      return {
        status: 'error',
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    }
  }

  private async testRedisConnection(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      const redis = getRedis();
      await redis.ping();
      
      const latency = Date.now() - startTime;
      
      return {
        status: 'ok',
        healthy: true,
        latency
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('Redis health check failed:', error);
      
      return {
        status: 'error',
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown Redis error'
      };
    }
  }

  private async testRabbitMQConnection(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      const channel = getChannel();
      
      // Verify channel is still open - use optional chaining to safely access nested properties
      const isDestroyed = (channel as any)?.connection?.connection?.stream?.destroyed;
      if (!channel || isDestroyed) {
        throw new Error('RabbitMQ channel is closed');
      }
      
      const latency = Date.now() - startTime;
      
      return {
        status: 'ok',
        healthy: true,
        latency
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('RabbitMQ health check failed:', error);
      
      return {
        status: 'error',
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown RabbitMQ error'
      };
    }
  }

  private async testMongoDBConnection(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    // MongoDB is optional - check if MONGODB_ENABLED env var is set
    const mongoEnabled = process.env.MONGODB_ENABLED === 'true';
    if (!mongoEnabled) {
      return {
        status: 'disabled',
        healthy: true,
        latency: 0
      };
    }
    
    try {
      const mongoClient = getMongoClient();
      
      // Ping MongoDB
      const adminDb = mongoClient.db().admin();
      await adminDb.ping();
      
      const latency = Date.now() - startTime;
      
      return {
        status: 'ok',
        healthy: true,
        latency
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.warn('MongoDB health check failed (optional dependency):', error);
      
      return {
        status: 'warning',
        healthy: true, // Don't fail readiness for optional MongoDB
        latency,
        error: error instanceof Error ? error.message : 'Unknown MongoDB error'
      };
    }
  }
}

export const healthController = new HealthController();
