/**
 * Unit Tests for HealthController
 *
 * Tests health check and readiness endpoints
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockRedisPing = jest.fn();
const mockRedisGetClient = jest.fn();
jest.mock('../../../src/services/redis.service', () => ({
  redis: {
    getClient: mockRedisGetClient
  }
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Import module under test AFTER mocks
import { HealthController } from '../../../src/controllers/health.controller';

// =============================================================================
// TESTS
// =============================================================================

describe('HealthController', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockRedisGetClient.mockReturnValue({ ping: mockRedisPing });
    mockRedisPing.mockResolvedValue('PONG');
  });

  // ===========================================================================
  // checkHealth Tests
  // ===========================================================================

  describe('checkHealth', () => {
    it('should return healthy status', async () => {
      await HealthController.checkHealth(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'compliance-service'
        })
      );
    });

    it('should include timestamp in ISO format', async () => {
      await HealthController.checkHealth(mockRequest as any, mockReply as any);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include uptime', async () => {
      await HealthController.checkHealth(mockRequest as any, mockReply as any);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(typeof response.uptime).toBe('number');
      expect(response.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include memory usage', async () => {
      await HealthController.checkHealth(mockRequest as any, mockReply as any);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.memory).toHaveProperty('heapUsed');
      expect(response.memory).toHaveProperty('heapTotal');
      expect(response.memory).toHaveProperty('rss');
    });

    it('should include environment', async () => {
      await HealthController.checkHealth(mockRequest as any, mockReply as any);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response).toHaveProperty('environment');
    });
  });

  // ===========================================================================
  // checkReadiness Tests
  // ===========================================================================

  describe('checkReadiness', () => {
    describe('when all services are healthy', () => {
      beforeEach(() => {
        mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
        mockRedisGetClient.mockReturnValue({ ping: mockRedisPing });
        mockRedisPing.mockResolvedValue('PONG');
      });

      it('should return ready=true', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(200);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            ready: true
          })
        );
      });

      it('should return all checks as true', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database).toBe(true);
        expect(response.checks.redis).toBe(true);
      });

      it('should include service name', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.service).toBe('compliance-service');
      });
    });

    describe('when database is down', () => {
      beforeEach(() => {
        mockDbQuery.mockRejectedValue(new Error('Connection refused'));
        mockRedisGetClient.mockReturnValue({ ping: mockRedisPing });
        mockRedisPing.mockResolvedValue('PONG');
      });

      it('should return ready=false', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(503);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            ready: false
          })
        );
      });

      it('should show database check as false', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database).toBe(false);
      });

      it('should still check redis', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.redis).toBe(true);
      });
    });

    describe('when redis is down', () => {
      beforeEach(() => {
        mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
        mockRedisGetClient.mockReturnValue({ ping: mockRedisPing });
        mockRedisPing.mockRejectedValue(new Error('Redis connection failed'));
      });

      it('should return ready=true (redis is optional)', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(200);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            ready: true
          })
        );
      });

      it('should show redis check as false', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.redis).toBe(false);
      });

      it('should show database check as true', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database).toBe(true);
      });
    });

    describe('when redis client is null', () => {
      beforeEach(() => {
        mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
        mockRedisGetClient.mockReturnValue(null);
      });

      it('should return ready=true (redis is optional)', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(200);
      });

      it('should show redis check as false', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.redis).toBe(false);
      });
    });

    describe('when both services are down', () => {
      beforeEach(() => {
        mockDbQuery.mockRejectedValue(new Error('DB down'));
        mockRedisGetClient.mockReturnValue({ ping: mockRedisPing });
        mockRedisPing.mockRejectedValue(new Error('Redis down'));
      });

      it('should return ready=false with 503 status', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(503);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            ready: false
          })
        );
      });

      it('should show both checks as false', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database).toBe(false);
        expect(response.checks.redis).toBe(false);
      });
    });

    describe('database health check', () => {
      it('should execute SELECT 1 query', async () => {
        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith('SELECT 1');
      });
    });

    describe('redis health check', () => {
      it('should call ping on redis client', async () => {
        mockRedisGetClient.mockReturnValue({ ping: mockRedisPing });

        await HealthController.checkReadiness(mockRequest as any, mockReply as any);

        expect(mockRedisPing).toHaveBeenCalled();
      });
    });
  });
});
