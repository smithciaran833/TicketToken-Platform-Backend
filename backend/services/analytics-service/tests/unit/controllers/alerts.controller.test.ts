/**
 * Alerts Controller Unit Tests
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

const mockAlertService = {
  getAlertsByVenue: jest.fn(),
  getAlertById: jest.fn(),
  createAlert: jest.fn(),
  updateAlert: jest.fn(),
  deleteAlert: jest.fn(),
  toggleAlert: jest.fn(),
  getAlertInstances: jest.fn(),
  acknowledgeAlert: jest.fn(),
  testAlert: jest.fn(),
};

jest.mock('../../../src/services/alert.service', () => ({
  alertService: mockAlertService,
}));

import { alertsController } from '../../../src/controllers/alerts.controller';

describe('AlertsController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockAlertService.getAlertsByVenue.mockResolvedValue([
      { id: 'alert-1', name: 'High Revenue Alert', enabled: true },
    ]);

    mockAlertService.getAlertById.mockResolvedValue({
      id: 'alert-1',
      name: 'Test Alert',
      enabled: true,
    });

    mockAlertService.createAlert.mockResolvedValue({
      id: 'alert-new',
      name: 'New Alert',
      enabled: true,
    });

    mockAlertService.updateAlert.mockResolvedValue({
      id: 'alert-1',
      name: 'Updated Alert',
    });

    mockAlertService.deleteAlert.mockResolvedValue(true);

    mockAlertService.toggleAlert.mockResolvedValue({
      id: 'alert-1',
      enabled: false,
    });

    mockAlertService.getAlertInstances.mockResolvedValue([
      { id: 'instance-1', status: 'active' },
    ]);

    mockAlertService.acknowledgeAlert.mockResolvedValue({
      id: 'instance-1',
      status: 'acknowledged',
    });

    mockAlertService.testAlert.mockResolvedValue(undefined);
  });

  describe('getAlerts', () => {
    it('should get all alerts for a venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await alertsController.getAlerts(mockRequest, mockReply);

      expect(mockAlertService.getAlertsByVenue).toHaveBeenCalledWith('venue-123');
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          alerts: expect.any(Array),
        },
      });
    });

    it('should handle errors', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockAlertService.getAlertsByVenue.mockRejectedValue(new Error('Database error'));

      await alertsController.getAlerts(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getAlert', () => {
    it('should get a specific alert', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };

      await alertsController.getAlert(mockRequest, mockReply);

      expect(mockAlertService.getAlertById).toHaveBeenCalledWith('alert-1', 'venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          alert: expect.objectContaining({
            id: 'alert-1',
          }),
        },
      });
    });

    it('should return 404 if alert not found', async () => {
      mockRequest.params = { alertId: 'nonexistent', venueId: 'venue-123' };
      mockAlertService.getAlertById.mockResolvedValue(null);

      await alertsController.getAlert(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Alert not found',
          statusCode: 404,
        },
      });
    });
  });

  describe('createAlert', () => {
    it('should create a new alert', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        name: 'New Alert',
        description: 'Test description',
        type: 'threshold',
        severity: 'warning',
        conditions: [{ metric: 'revenue', operator: '>', value: 1000 }],
        actions: [{ type: 'email', recipients: ['admin@test.com'] }],
        enabled: true,
      };

      await alertsController.createAlert(mockRequest, mockReply);

      expect(mockAlertService.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-123',
          name: 'New Alert',
          type: 'threshold',
          severity: 'warning',
          enabled: true,
          createdBy: 'user-123',
        })
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should use system as default creator if no user', async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        venueId: 'venue-123',
        name: 'System Alert',
        type: 'threshold',
        severity: 'info',
        conditions: [],
        actions: [],
      };

      await alertsController.createAlert(mockRequest, mockReply);

      expect(mockAlertService.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'system',
        })
      );
    });

    it('should default enabled to true if not specified', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        name: 'Default Enabled Alert',
        type: 'threshold',
        severity: 'info',
        conditions: [],
        actions: [],
      };

      await alertsController.createAlert(mockRequest, mockReply);

      expect(mockAlertService.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      );
    });
  });

  describe('updateAlert', () => {
    it('should update an alert', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };
      mockRequest.body = {
        name: 'Updated Name',
        severity: 'critical',
      };

      await alertsController.updateAlert(mockRequest, mockReply);

      expect(mockAlertService.updateAlert).toHaveBeenCalledWith('alert-1', {
        name: 'Updated Name',
        severity: 'critical',
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          alert: expect.any(Object),
        },
      });
    });
  });

  describe('deleteAlert', () => {
    it('should delete an alert', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };

      await alertsController.deleteAlert(mockRequest, mockReply);

      expect(mockAlertService.deleteAlert).toHaveBeenCalledWith('alert-1', 'venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Alert deleted',
        },
      });
    });

    it('should return 404 if alert not found', async () => {
      mockRequest.params = { alertId: 'nonexistent', venueId: 'venue-123' };
      mockAlertService.deleteAlert.mockResolvedValue(false);

      await alertsController.deleteAlert(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('toggleAlert', () => {
    it('should enable an alert', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };
      mockRequest.body = { enabled: true };

      mockAlertService.toggleAlert.mockResolvedValue({
        id: 'alert-1',
        enabled: true,
      });

      await alertsController.toggleAlert(mockRequest, mockReply);

      expect(mockAlertService.toggleAlert).toHaveBeenCalledWith('alert-1', true);
    });

    it('should disable an alert', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };
      mockRequest.body = { enabled: false };

      await alertsController.toggleAlert(mockRequest, mockReply);

      expect(mockAlertService.toggleAlert).toHaveBeenCalledWith('alert-1', false);
    });
  });

  describe('getAlertInstances', () => {
    it('should get alert instances with default limit', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };
      mockRequest.query = {};

      await alertsController.getAlertInstances(mockRequest, mockReply);

      expect(mockAlertService.getAlertInstances).toHaveBeenCalledWith('alert-1', 50);
    });

    it('should get alert instances with custom limit', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };
      mockRequest.query = { limit: 100 };

      await alertsController.getAlertInstances(mockRequest, mockReply);

      expect(mockAlertService.getAlertInstances).toHaveBeenCalledWith('alert-1', 100);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert with notes', async () => {
      mockRequest.params = { instanceId: 'instance-1' };
      mockRequest.body = { notes: 'Investigating issue' };

      await alertsController.acknowledgeAlert(mockRequest, mockReply);

      expect(mockAlertService.acknowledgeAlert).toHaveBeenCalledWith(
        'instance-1',
        'user-123',
        'Investigating issue'
      );
    });

    it('should acknowledge an alert without notes', async () => {
      mockRequest.params = { instanceId: 'instance-1' };
      mockRequest.body = {};

      await alertsController.acknowledgeAlert(mockRequest, mockReply);

      expect(mockAlertService.acknowledgeAlert).toHaveBeenCalledWith(
        'instance-1',
        'user-123',
        undefined
      );
    });

    it('should use system as default user', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { instanceId: 'instance-1' };
      mockRequest.body = {};

      await alertsController.acknowledgeAlert(mockRequest, mockReply);

      expect(mockAlertService.acknowledgeAlert).toHaveBeenCalledWith(
        'instance-1',
        'system',
        undefined
      );
    });
  });

  describe('testAlert', () => {
    it('should send a test alert', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };

      await alertsController.testAlert(mockRequest, mockReply);

      expect(mockAlertService.testAlert).toHaveBeenCalledWith('alert-1', 'venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Test alert sent',
        },
      });
    });

    it('should handle test alert errors', async () => {
      mockRequest.params = { alertId: 'alert-1', venueId: 'venue-123' };
      mockAlertService.testAlert.mockRejectedValue(new Error('Email service unavailable'));

      await alertsController.testAlert(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
