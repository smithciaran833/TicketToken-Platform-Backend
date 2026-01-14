/**
 * Unit Tests for HealthController
 * Tests HTTP handlers for health check operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthController, healthController } from '../../../src/controllers/health.controller';
import { db } from '../../../src/config/database';
import { cache } from '../../../src/services/cache-integration';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/cache-integration');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('HealthController', () => {
  let controller: HealthController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HealthController();

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('health', () => {
    it('should return basic health status', async () => {
      await controller.health(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'healthy',
        service: 'marketplace-service',
        timestamp: expect.any(String),
      });
    });

    it('should return valid ISO timestamp', async () => {
      await controller.health(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sentCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(new Date(sentCall.timestamp).toISOString()).toBe(sentCall.timestamp);
    });
  });

  describe('detailed', () => {
    it('should return healthy status when all checks pass', async () => {
      (db.raw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      (cache.set as jest.Mock).mockResolvedValue(undefined);
      (cache.get as jest.Mock).mockResolvedValue('ok');

      await controller.detailed(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'healthy',
        checks: {
          database: true,
          redis: true,
          dependencies: true,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return unhealthy status when database check fails', async () => {
      (db.raw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      (cache.set as jest.Mock).mockResolvedValue(undefined);
      (cache.get as jest.Mock).mockResolvedValue('ok');

      await controller.detailed(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'unhealthy',
        checks: {
          database: false,
          redis: true,
          dependencies: true,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return unhealthy status when Redis check fails', async () => {
      (db.raw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      (cache.set as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await controller.detailed(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'unhealthy',
        checks: {
          database: true,
          redis: false,
          dependencies: true,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return unhealthy when Redis returns wrong value', async () => {
      (db.raw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      (cache.set as jest.Mock).mockResolvedValue(undefined);
      (cache.get as jest.Mock).mockResolvedValue('wrong_value');

      await controller.detailed(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'unhealthy',
        checks: {
          database: true,
          redis: false,
          dependencies: true,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return unhealthy when all checks fail', async () => {
      (db.raw as jest.Mock).mockRejectedValue(new Error('Database error'));
      (cache.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await controller.detailed(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'unhealthy',
        checks: {
          database: false,
          redis: false,
          dependencies: true,
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('readiness', () => {
    it('should return ready when database is available', async () => {
      (db.raw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      await controller.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ ready: true });
    });

    it('should return not ready with 503 when database fails', async () => {
      (db.raw as jest.Mock).mockRejectedValue(new Error('Database not ready'));

      await controller.readiness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        ready: false,
        error: 'Database not ready',
      });
    });
  });

  describe('liveness', () => {
    it('should always return alive', async () => {
      await controller.liveness(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ alive: true });
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(healthController).toBeInstanceOf(HealthController);
    });
  });
});
