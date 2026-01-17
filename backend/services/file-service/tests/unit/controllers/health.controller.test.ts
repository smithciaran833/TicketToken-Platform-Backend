jest.mock('../../../src/config/database.config');
jest.mock('../../../src/utils/logger');

import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { HealthController, healthController } from '../../../src/controllers/health.controller';
import { getPool } from '../../../src/config/database.config';

describe('controllers/health.controller', () => {
  let controller: HealthController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockGetPool: jest.MockedFunction<typeof getPool>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new HealthController();

    mockRequest = {};

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockGetPool = getPool as jest.MockedFunction<typeof getPool>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('check', () => {
    it('should return healthy status when database is available', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ result: 1 }] }),
      };
      mockGetPool.mockReturnValue(mockPool as unknown as Pool);

      await controller.check(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'file-service',
          checks: {
            database: 'healthy',
          },
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });

    it('should return healthy status with unavailable database when pool is null', async () => {
      mockGetPool.mockReturnValue(null as unknown as Pool);

      await controller.check(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'file-service',
          checks: {
            database: 'unavailable',
          },
        })
      );
    });

    it('should return unhealthy status when database query fails', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      mockGetPool.mockReturnValue(mockPool as unknown as Pool);

      await controller.check(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          service: 'file-service',
        })
      );
    });

    it('should include timestamp in response', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ result: 1 }] }),
      };
      mockGetPool.mockReturnValue(mockPool as unknown as Pool);
      const beforeTime = new Date().toISOString();

      await controller.check(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const callArg = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(callArg.timestamp).toBeDefined();
      expect(new Date(callArg.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime()
      );
    });

    it('should handle database connection timeout', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      };
      mockGetPool.mockReturnValue(mockPool as unknown as Pool);

      await controller.check(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
        })
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue('Non-error object'),
      };
      mockGetPool.mockReturnValue(mockPool as unknown as Pool);

      await controller.check(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(healthController).toBeInstanceOf(HealthController);
    });

    it('should be the same instance across imports', () => {
      expect(healthController).toBe(healthController);
    });
  });
});
