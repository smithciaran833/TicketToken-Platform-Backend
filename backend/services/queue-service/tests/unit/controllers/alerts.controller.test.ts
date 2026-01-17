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

// Mock cache integration
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {},
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { AlertsController } from '../../../src/controllers/alerts.controller';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';
import { AuthRequest } from '../../../src/middleware/auth.middleware';

describe('AlertsController', () => {
  let controller: AlertsController;
  let mockReply: Partial<FastifyReply>;
  let mockPool: any;

  beforeEach(() => {
    controller = new AlertsController();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockPool = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
  });

  describe('getAlerts', () => {
    it('should return alerts with default limit', async () => {
      const mockAlerts = [
        { id: 'alert-1', severity: 'critical', message: 'Queue overloaded', created_at: new Date() },
        { id: 'alert-2', severity: 'warning', message: 'High latency', created_at: new Date() },
      ];

      mockPool.query.mockResolvedValue({ rows: mockAlerts, rowCount: 2 });

      const mockRequest = {
        query: {},
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(getPool).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM alert_history'),
        [50]
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        alerts: mockAlerts,
        count: 2,
      });
    });

    it('should filter by severity when provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockRequest = {
        query: { severity: 'critical' },
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND severity = $1'),
        ['critical', 50]
      );
    });

    it('should respect custom limit parameter', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockRequest = {
        query: { limit: 10 },
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [10]
      );
    });

    it('should filter by severity and respect custom limit', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockRequest = {
        query: { severity: 'warning', limit: 25 },
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND severity = $1'),
        ['warning', 25]
      );
    });

    it('should query alerts from last 24 hours', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockRequest = {
        query: {},
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      const queryCall = mockPool.query.mock.calls[0][0];
      expect(queryCall).toContain("NOW() - INTERVAL '24 hours'");
    });

    it('should order alerts by created_at descending', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockRequest = {
        query: {},
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      const queryCall = mockPool.query.mock.calls[0][0];
      expect(queryCall).toContain('ORDER BY created_at DESC');
    });

    it('should return empty array when no alerts found', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockRequest = {
        query: {},
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        alerts: [],
        count: 0,
      });
    });

    it('should return 500 when database query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const mockRequest = {
        query: {},
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get alerts' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get alerts:', expect.any(Error));
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool not initialized');
      });

      const mockRequest = {
        query: {},
      } as unknown as FastifyRequest;

      await controller.getAlerts(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get alerts' });
    });

    it('should handle various severity levels', async () => {
      const severityLevels = ['info', 'warning', 'critical', 'error'];

      for (const severity of severityLevels) {
        mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

        const mockRequest = {
          query: { severity },
        } as unknown as FastifyRequest;

        await controller.getAlerts(mockRequest, mockReply as FastifyReply);

        expect(mockPool.query).toHaveBeenLastCalledWith(
          expect.stringContaining('AND severity = $1'),
          [severity, 50]
        );
      }
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert successfully', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      const mockRequest = {
        params: { id: 'alert-123' },
        user: { userId: 'user-456' },
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alert_history'),
        ['user-456', 'alert-123']
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        alertId: 'alert-123',
        status: 'acknowledged',
        acknowledgedBy: 'user-456',
      });
    });

    it('should set acknowledged flag and timestamp', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      const mockRequest = {
        params: { id: 'alert-123' },
        user: { userId: 'admin-user' },
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      const queryCall = mockPool.query.mock.calls[0][0];
      expect(queryCall).toContain('acknowledged = true');
      expect(queryCall).toContain('acknowledged_by = $1');
      expect(queryCall).toContain('acknowledged_at = NOW()');
      expect(queryCall).toContain('WHERE id = $2');
    });

    it('should log acknowledgment action', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      const mockRequest = {
        params: { id: 'alert-789' },
        user: { userId: 'ops-user' },
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      // The source uses template literal syntax (info`...`) which is unusual
      // but we test that logger.info was called
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle missing user gracefully', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      const mockRequest = {
        params: { id: 'alert-123' },
        user: undefined,
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [undefined, 'alert-123']
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        alertId: 'alert-123',
        status: 'acknowledged',
        acknowledgedBy: undefined,
      });
    });

    it('should return 500 when database update fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const mockRequest = {
        params: { id: 'alert-123' },
        user: { userId: 'user-456' },
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to acknowledge alert' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to acknowledge alert:',
        expect.any(Error)
      );
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool unavailable');
      });

      const mockRequest = {
        params: { id: 'alert-123' },
        user: { userId: 'user-456' },
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to acknowledge alert' });
    });

    it('should handle non-existent alert gracefully', async () => {
      // Even if no rows updated, the controller doesn't check rowCount
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      const mockRequest = {
        params: { id: 'nonexistent-alert' },
        user: { userId: 'user-456' },
      } as unknown as AuthRequest;

      await controller.acknowledgeAlert(mockRequest, mockReply as FastifyReply);

      // Controller doesn't verify if alert exists, just returns success
      expect(mockReply.send).toHaveBeenCalledWith({
        alertId: 'nonexistent-alert',
        status: 'acknowledged',
        acknowledgedBy: 'user-456',
      });
    });
  });

  describe('testAlert', () => {
    it('should send test alert with default values', async () => {
      const mockRequest = {
        body: {},
        user: { userId: 'test-user' },
      } as unknown as AuthRequest;

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'sent',
        severity: 'info',
        channel: 'log',
        message: 'Test alert sent successfully',
      });
    });

    it('should send test alert with custom severity', async () => {
      const mockRequest = {
        body: { severity: 'critical' },
        user: { userId: 'test-user' },
      } as unknown as AuthRequest;

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'sent',
        severity: 'critical',
        channel: 'log',
        message: 'Test alert sent successfully',
      });
    });

    it('should send test alert with custom channel', async () => {
      const mockRequest = {
        body: { channel: 'slack' },
        user: { userId: 'test-user' },
      } as unknown as AuthRequest;

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'sent',
        severity: 'info',
        channel: 'slack',
        message: 'Test alert sent successfully',
      });
    });

    it('should send test alert with custom severity and channel', async () => {
      const mockRequest = {
        body: { severity: 'warning', channel: 'email' },
        user: { userId: 'admin-user' },
      } as unknown as AuthRequest;

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'sent',
        severity: 'warning',
        channel: 'email',
        message: 'Test alert sent successfully',
      });
    });

    it('should log warning when test alert is triggered', async () => {
      const mockRequest = {
        body: {},
        user: { userId: 'ops-user' },
      } as unknown as AuthRequest;

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      // The source uses template literal syntax (warn`...`)
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle missing user gracefully', async () => {
      const mockRequest = {
        body: { severity: 'info' },
        user: undefined,
      } as unknown as AuthRequest;

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'sent',
        severity: 'info',
        channel: 'log',
        message: 'Test alert sent successfully',
      });
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const mockRequest = {
        body: null, // This might cause an error when destructuring
        user: { userId: 'test-user' },
      } as unknown as AuthRequest;

      // Force an error by making the body access throw
      Object.defineProperty(mockRequest, 'body', {
        get: () => {
          throw new Error('Unexpected error');
        },
      });

      await controller.testAlert(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to send test alert' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send test alert:',
        expect.any(Error)
      );
    });

    it('should handle various severity levels', async () => {
      const severityLevels = ['info', 'warning', 'error', 'critical'];

      for (const severity of severityLevels) {
        const mockRequest = {
          body: { severity },
          user: { userId: 'test-user' },
        } as unknown as AuthRequest;

        await controller.testAlert(mockRequest, mockReply as FastifyReply);

        expect(mockReply.send).toHaveBeenLastCalledWith(
          expect.objectContaining({ severity })
        );
      }
    });

    it('should handle various channel types', async () => {
      const channels = ['log', 'slack', 'email', 'pagerduty', 'webhook'];

      for (const channel of channels) {
        const mockRequest = {
          body: { channel },
          user: { userId: 'test-user' },
        } as unknown as AuthRequest;

        await controller.testAlert(mockRequest, mockReply as FastifyReply);

        expect(mockReply.send).toHaveBeenLastCalledWith(
          expect.objectContaining({ channel })
        );
      }
    });
  });
});
