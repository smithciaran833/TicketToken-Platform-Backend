/**
 * Health Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  db: {
    raw: jest.fn(),
  },
  analyticsDb: {
    raw: jest.fn(),
  },
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(),
}));

jest.mock('../../../src/config/rabbitmq', () => ({
  getChannel: jest.fn(),
}));

jest.mock('../../../src/config/mongodb', () => ({
  getMongoClient: jest.fn(),
}));

import { healthController } from '../../../src/controllers/health.controller';
import { db, analyticsDb } from '../../../src/config/database';
import { getRedis } from '../../../src/config/redis';
import { getChannel } from '../../../src/config/rabbitmq';
import { getMongoClient } from '../../../src/config/mongodb';

describe('HealthController', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {};
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Set healthy defaults
    (db.raw as jest.Mock).mockResolvedValue([{ result: 1 }]);
    (analyticsDb.raw as jest.Mock).mockResolvedValue([{ result: 1 }]);
    
    (getRedis as jest.Mock).mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG'),
    });

    (getChannel as jest.Mock).mockReturnValue({
      connection: {
        connection: {
          stream: {
            destroyed: false,
          },
        },
      },
    });

    (getMongoClient as jest.Mock).mockReturnValue({
      db: () => ({
        admin: () => ({
          ping: jest.fn().mockResolvedValue({ ok: 1 }),
        }),
      }),
    });
  });

  describe('health', () => {
    it('should return ok status', async () => {
      await healthController.health(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'ok',
          timestamp: expect.any(String),
          service: 'analytics-service',
        }),
      });
    });

    it('should include timestamp in response', async () => {
      await healthController.health(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.timestamp).toBeDefined();
      expect(new Date(sendCall.data.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Unexpected error');
      mockReply.send.mockImplementationOnce(() => {
        throw error;
      });

      await healthController.health(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalled();
    });
  });

  describe('liveness', () => {
    it('should return alive status', async () => {
      await healthController.liveness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'alive',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        }),
      });
    });

    it('should include uptime in response', async () => {
      await healthController.liveness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should not check external dependencies', async () => {
      await healthController.liveness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(db.raw).not.toHaveBeenCalled();
      expect(getRedis).not.toHaveBeenCalled();
      expect(getChannel).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('should return ready when all dependencies are healthy', async () => {
      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'ready',
          checks: expect.objectContaining({
            database: expect.objectContaining({ healthy: true }),
            redis: expect.objectContaining({ healthy: true }),
            rabbitmq: expect.objectContaining({ healthy: true }),
          }),
        }),
      });
    });

    it('should check database connection', async () => {
      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(db.raw).toHaveBeenCalledWith('SELECT 1');
      expect(analyticsDb.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should check redis connection', async () => {
      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(getRedis).toHaveBeenCalled();
    });

    it('should check rabbitmq connection', async () => {
      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(getChannel).toHaveBeenCalled();
    });

    it('should return 503 when database is down', async () => {
      (db.raw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          checks: expect.objectContaining({
            database: expect.objectContaining({ healthy: false }),
          }),
        })
      );
    });

    it('should return 503 when redis is down', async () => {
      (getRedis as jest.Mock).mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
      });

      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
        })
      );
    });

    it('should return 503 when rabbitmq is down', async () => {
      (getChannel as jest.Mock).mockReturnValue(null);

      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should include latency metrics', async () => {
      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.checks.database.latency).toBeGreaterThanOrEqual(0);
      expect(sendCall.data.checks.redis.latency).toBeGreaterThanOrEqual(0);
      expect(sendCall.data.totalLatency).toBeGreaterThanOrEqual(0);
    });

    it('should handle exception gracefully', async () => {
      (db.raw as jest.Mock).mockRejectedValue(new Error('Timeout'));

      await healthController.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
        })
      );
    });
  });

  describe('dependencies', () => {
    it('should check all dependencies', async () => {
      await healthController.dependencies(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(db.raw).toHaveBeenCalled();
      expect(getRedis).toHaveBeenCalled();
      expect(getChannel).toHaveBeenCalled();
    });

    it('should return 200 when all dependencies are healthy', async () => {
      process.env.MONGODB_ENABLED = 'true';

      await healthController.dependencies(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          dependencies: expect.objectContaining({
            postgres: expect.objectContaining({ healthy: true }),
            redis: expect.objectContaining({ healthy: true }),
            rabbitmq: expect.objectContaining({ healthy: true }),
            mongodb: expect.any(Object),
          }),
        }),
      });
    });

    it('should return 503 when postgres is unhealthy', async () => {
      (db.raw as jest.Mock).mockRejectedValue(new Error('DB down'));

      await healthController.dependencies(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should handle MongoDB when disabled', async () => {
      process.env.MONGODB_ENABLED = 'false';

      await healthController.dependencies(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.dependencies.mongodb.status).toBe('disabled');
    });

    it('should not fail on MongoDB errors when optional', async () => {
      process.env.MONGODB_ENABLED = 'true';
      (getMongoClient as jest.Mock).mockReturnValue({
        db: () => ({
          admin: () => ({
            ping: jest.fn().mockRejectedValue(new Error('MongoDB down')),
          }),
        }),
      });

      await healthController.dependencies(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.dependencies.mongodb.status).toBe('warning');
      expect(sendCall.data.dependencies.mongodb.healthy).toBe(true);
    });

    it('should include error messages for failed checks', async () => {
      (getRedis as jest.Mock).mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      });

      await healthController.dependencies(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Since redis fails, should return 503
      expect(mockReply.code).toHaveBeenCalledWith(503);
      
      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.dependencies.redis.error).toContain('timeout');
    });
  });

  describe('Performance', () => {
    it('should complete health check quickly', async () => {
      const start = Date.now();
      await healthController.health(mockRequest as FastifyRequest, mockReply as FastifyReply);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should complete liveness check quickly', async () => {
      const start = Date.now();
      await healthController.liveness(mockRequest as FastifyRequest, mockReply as FastifyReply);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
