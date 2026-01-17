// Mock dependencies BEFORE imports
const mockGetActiveAlerts = jest.fn();
const mockGetAlert = jest.fn();
const mockAcknowledgeAlert = jest.fn();
const mockResolveAlert = jest.fn();
const mockGetAlertHistory = jest.fn();
const mockGetAlertRules = jest.fn();
const mockCreateAlertRule = jest.fn();
const mockUpdateAlertRule = jest.fn();
const mockDeleteAlertRule = jest.fn();

jest.mock('../../../src/services/alert.service', () => ({
  alertService: {
    getActiveAlerts: mockGetActiveAlerts,
    getAlert: mockGetAlert,
    acknowledgeAlert: mockAcknowledgeAlert,
    resolveAlert: mockResolveAlert,
    getAlertHistory: mockGetAlertHistory,
    getAlertRules: mockGetAlertRules,
    createAlertRule: mockCreateAlertRule,
    updateAlertRule: mockUpdateAlertRule,
    deleteAlertRule: mockDeleteAlertRule,
  },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { alertController } from '../../../src/controllers/alert.controller';

describe('AlertController', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      params: {},
      query: {},
      body: {},
    };
    mockReply = {
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('getActiveAlerts', () => {
    it('should return active alerts on success', async () => {
      const mockAlerts = [
        { id: '1', severity: 'critical', message: 'CPU high', status: 'active' },
        { id: '2', severity: 'warning', message: 'Memory usage', status: 'active' },
      ];
      mockGetActiveAlerts.mockResolvedValue(mockAlerts);

      await alertController.getActiveAlerts(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetActiveAlerts).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith(mockAlerts);
    });

    it('should return empty array when no active alerts', async () => {
      mockGetActiveAlerts.mockResolvedValue([]);

      await alertController.getActiveAlerts(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith([]);
    });

    it('should return 500 on service error', async () => {
      mockGetActiveAlerts.mockRejectedValue(new Error('Database connection failed'));

      await alertController.getActiveAlerts(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('getAlert', () => {
    it('should return alert when found', async () => {
      const mockAlert = {
        id: 'alert-123',
        severity: 'critical',
        message: 'Service down',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockRequest.params = { id: 'alert-123' };
      mockGetAlert.mockResolvedValue(mockAlert);

      await alertController.getAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockGetAlert).toHaveBeenCalledWith('alert-123');
      expect(mockReply.send).toHaveBeenCalledWith(mockAlert);
    });

    it('should return 404 when alert not found', async () => {
      mockRequest.params = { id: 'nonexistent-id' };
      mockGetAlert.mockResolvedValue(null);

      await alertController.getAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockGetAlert).toHaveBeenCalledWith('nonexistent-id');
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Alert not found' });
    });

    it('should return 404 when alert is undefined', async () => {
      mockRequest.params = { id: 'undefined-id' };
      mockGetAlert.mockResolvedValue(undefined);

      await alertController.getAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('should return 500 on service error', async () => {
      mockRequest.params = { id: 'error-id' };
      mockGetAlert.mockRejectedValue(new Error('Query failed'));

      await alertController.getAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert with body data', async () => {
      const acknowledgeData = { acknowledgedBy: 'user-123', notes: 'Looking into it' };
      const mockResult = { id: 'alert-1', status: 'acknowledged', ...acknowledgeData };
      mockRequest.params = { id: 'alert-1' };
      mockRequest.body = acknowledgeData;
      mockAcknowledgeAlert.mockResolvedValue(mockResult);

      await alertController.acknowledgeAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('alert-1', acknowledgeData);
      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should handle empty body', async () => {
      mockRequest.params = { id: 'alert-1' };
      mockRequest.body = {};
      mockAcknowledgeAlert.mockResolvedValue({ id: 'alert-1', status: 'acknowledged' });

      await alertController.acknowledgeAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('alert-1', {});
    });

    it('should return 500 on service error', async () => {
      mockRequest.params = { id: 'alert-1' };
      mockAcknowledgeAlert.mockRejectedValue(new Error('Update failed'));

      await alertController.acknowledgeAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve alert with resolution data', async () => {
      const resolveData = { resolvedBy: 'user-456', resolution: 'Fixed the issue' };
      const mockResult = { id: 'alert-2', status: 'resolved', ...resolveData };
      mockRequest.params = { id: 'alert-2' };
      mockRequest.body = resolveData;
      mockResolveAlert.mockResolvedValue(mockResult);

      await alertController.resolveAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockResolveAlert).toHaveBeenCalledWith('alert-2', resolveData);
      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 on service error', async () => {
      mockRequest.params = { id: 'alert-2' };
      mockResolveAlert.mockRejectedValue(new Error('Resolution failed'));

      await alertController.resolveAlert(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history with query params', async () => {
      const queryParams = { startDate: '2024-01-01', endDate: '2024-01-31', severity: 'critical' };
      const mockHistory = [
        { id: '1', severity: 'critical', resolvedAt: '2024-01-15' },
        { id: '2', severity: 'critical', resolvedAt: '2024-01-20' },
      ];
      mockRequest.query = queryParams;
      mockGetAlertHistory.mockResolvedValue(mockHistory);

      await alertController.getAlertHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetAlertHistory).toHaveBeenCalledWith(queryParams);
      expect(mockReply.send).toHaveBeenCalledWith(mockHistory);
    });

    it('should handle empty query params', async () => {
      mockRequest.query = {};
      mockGetAlertHistory.mockResolvedValue([]);

      await alertController.getAlertHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetAlertHistory).toHaveBeenCalledWith({});
    });

    it('should return 500 on service error', async () => {
      mockGetAlertHistory.mockRejectedValue(new Error('History query failed'));

      await alertController.getAlertHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getAlertRules', () => {
    it('should return all alert rules', async () => {
      const mockRules = [
        { id: 'rule-1', name: 'High CPU', condition: 'cpu > 90', severity: 'critical' },
        { id: 'rule-2', name: 'Memory Warning', condition: 'memory > 80', severity: 'warning' },
      ];
      mockGetAlertRules.mockResolvedValue(mockRules);

      await alertController.getAlertRules(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetAlertRules).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith(mockRules);
    });

    it('should return empty array when no rules exist', async () => {
      mockGetAlertRules.mockResolvedValue([]);

      await alertController.getAlertRules(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith([]);
    });

    it('should return 500 on service error', async () => {
      mockGetAlertRules.mockRejectedValue(new Error('Rules fetch failed'));

      await alertController.getAlertRules(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('createAlertRule', () => {
    it('should create rule and return 201', async () => {
      const ruleData = { name: 'Disk Full', condition: 'disk > 95', severity: 'critical' };
      const createdRule = { id: 'rule-new', ...ruleData, createdAt: '2024-01-01' };
      mockRequest.body = ruleData;
      mockCreateAlertRule.mockResolvedValue(createdRule);

      await alertController.createAlertRule(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCreateAlertRule).toHaveBeenCalledWith(ruleData);
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(createdRule);
    });

    it('should return 500 on creation error', async () => {
      mockRequest.body = { name: 'Invalid Rule' };
      mockCreateAlertRule.mockRejectedValue(new Error('Validation failed'));

      await alertController.createAlertRule(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('updateAlertRule', () => {
    it('should update rule and return updated data', async () => {
      const updateData = { severity: 'warning' };
      const updatedRule = { id: 'rule-1', name: 'High CPU', severity: 'warning' };
      mockRequest.params = { id: 'rule-1' };
      mockRequest.body = updateData;
      mockUpdateAlertRule.mockResolvedValue(updatedRule);

      await alertController.updateAlertRule(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockUpdateAlertRule).toHaveBeenCalledWith('rule-1', updateData);
      expect(mockReply.send).toHaveBeenCalledWith(updatedRule);
    });

    it('should return 500 on update error', async () => {
      mockRequest.params = { id: 'rule-1' };
      mockUpdateAlertRule.mockRejectedValue(new Error('Update failed'));

      await alertController.updateAlertRule(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteAlertRule', () => {
    it('should delete rule and return 204', async () => {
      mockRequest.params = { id: 'rule-to-delete' };
      mockDeleteAlertRule.mockResolvedValue(undefined);

      await alertController.deleteAlertRule(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockDeleteAlertRule).toHaveBeenCalledWith('rule-to-delete');
      expect(mockReply.code).toHaveBeenCalledWith(204);
      expect(mockReply.send).toHaveBeenCalledWith();
    });

    it('should return 500 on deletion error', async () => {
      mockRequest.params = { id: 'rule-1' };
      mockDeleteAlertRule.mockRejectedValue(new Error('Deletion failed'));

      await alertController.deleteAlertRule(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
