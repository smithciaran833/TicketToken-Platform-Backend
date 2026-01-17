// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock database config
jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(),
}));

// Mock QueueFactory
jest.mock('../../../src/queues/factories/queue.factory', () => ({
  QueueFactory: {
    getQueueMetrics: jest.fn(),
  },
}));

// Mock cache integration (imported but not used in controller methods)
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {},
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthController } from '../../../src/controllers/health.controller';
import { getPool } from '../../../src/config/database.config';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { logger } from '../../../src/utils/logger';

describe('HealthController', () => {
  let controller: HealthController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockPool: any;

  beforeEach(() => {
    controller = new HealthController();

    mockRequest = {};

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockPool = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
  });

  describe('checkHealth', () => {
    it('should return 200 with healthy status when all checks pass', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({ active: 0, waiting: 0 });

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'healthy',
        checks: {
          service: 'healthy',
          database: 'healthy',
          queues: 'healthy',
        },
        timestamp: expect.any(String),
      });
    });

    it('should return 503 with degraded status when database check fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({ active: 0, waiting: 0 });

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'degraded',
        checks: {
          service: 'healthy',
          database: 'unhealthy',
          queues: 'healthy',
        },
        timestamp: expect.any(String),
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Database health check failed:',
        expect.any(Error)
      );
    });

    it('should return 503 with degraded status when queue check fails', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      (QueueFactory.getQueueMetrics as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'degraded',
        checks: {
          service: 'healthy',
          database: 'healthy',
          queues: 'unhealthy',
        },
        timestamp: expect.any(String),
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Queue health check failed:',
        expect.any(Error)
      );
    });

    it('should return 503 with degraded status when both database and queue checks fail', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));
      (QueueFactory.getQueueMetrics as jest.Mock).mockRejectedValue(new Error('Queue error'));

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'degraded',
        checks: {
          service: 'healthy',
          database: 'unhealthy',
          queues: 'unhealthy',
        },
        timestamp: expect.any(String),
      });
    });

    it('should return valid ISO timestamp', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({});

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(() => new Date(sendCall.timestamp)).not.toThrow();
      expect(new Date(sendCall.timestamp).toISOString()).toBe(sendCall.timestamp);
    });

    it('should return 503 with unhealthy status when unexpected error occurs', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({});
      
      // Make reply.code throw on first call to trigger outer catch block
      (mockReply.code as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('Unexpected failure');
        })
        .mockReturnThis();

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'unhealthy',
        error: 'Health check failed',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Health check failed:',
        expect.any(Error)
      );
    });

    it('should mark database as unhealthy when getPool throws', async () => {
      (getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool not initialized');
      });
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({});

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'degraded',
        checks: {
          service: 'healthy',
          database: 'unhealthy',
          queues: 'healthy',
        },
        timestamp: expect.any(String),
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Database health check failed:',
        expect.any(Error)
      );
    });

    it('should call getPool to obtain database connection', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({});

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(getPool).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should call QueueFactory.getQueueMetrics with money queue', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({});

      await controller.checkHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(QueueFactory.getQueueMetrics).toHaveBeenCalledWith('money');
    });
  });

  describe('checkReadiness', () => {
    it('should return 200 with ready status when database is accessible', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      await controller.checkReadiness(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'ready',
        timestamp: expect.any(String),
      });
      // Should not call code() for 200 (default)
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 503 with not ready status when database is inaccessible', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection timeout'));

      await controller.checkReadiness(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'not ready',
        error: 'Service not ready',
      });
    });

    it('should log error when readiness check fails', async () => {
      const dbError = new Error('Database unavailable');
      mockPool.query.mockRejectedValue(dbError);

      await controller.checkReadiness(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Readiness check failed:',
        dbError
      );
    });

    it('should execute SELECT 1 query to verify database connection', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await controller.checkReadiness(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return valid ISO timestamp on success', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await controller.checkReadiness(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(() => new Date(sendCall.timestamp)).not.toThrow();
    });

    it('should handle getPool throwing an error', async () => {
      (getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool not initialized');
      });

      await controller.checkReadiness(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'not ready',
        error: 'Service not ready',
      });
    });
  });
});
