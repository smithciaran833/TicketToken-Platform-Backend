/**
 * Alert Service Unit Tests
 */

import { AlertType, AlertSeverity, AlertStatus, ComparisonOperator } from '../../../src/types';

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

const mockAlertModel = {
  findById: jest.fn(),
  createAlert: jest.fn(),
  updateAlert: jest.fn(),
  delete: jest.fn(),
  toggleAlert: jest.fn(),
  getAlertsByVenue: jest.fn(),
  getAlertInstances: jest.fn(),
  createAlertInstance: jest.fn(),
  incrementTriggerCount: jest.fn(),
  resolveAlertInstance: jest.fn(),
  acknowledgeAlertInstance: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  AlertModel: mockAlertModel,
}));

const mockMessageGatewayService = {
  sendAlertNotification: jest.fn(),
};

jest.mock('../../../src/services/message-gateway.service', () => ({
  messageGatewayService: mockMessageGatewayService,
}));

const mockMetricsService = {
  getRealTimeMetric: jest.fn(),
};

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: mockMetricsService,
}));

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => jest.fn().mockReturnValue({
    distinct: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    pluck: jest.fn().mockResolvedValue(['venue-1', 'venue-2']),
  })),
}));

import { AlertService, alertService } from '../../../src/services/alert.service';

describe('AlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AlertService.getInstance();
      const instance2 = AlertService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return the exported alertService singleton', () => {
      expect(alertService).toBe(AlertService.getInstance());
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring interval', async () => {
      await alertService.startMonitoring();
      expect(mockLogger.info).toHaveBeenCalledWith('Alert monitoring started');
    });

    it('should set up interval for checking alerts', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      await alertService.startMonitoring();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and clear interval', async () => {
      await alertService.startMonitoring();
      await alertService.stopMonitoring();
      expect(mockLogger.info).toHaveBeenCalledWith('Alert monitoring stopped');
    });

    it('should handle stop when not started', async () => {
      await alertService.stopMonitoring();
      expect(mockLogger.info).toHaveBeenCalledWith('Alert monitoring stopped');
    });
  });

  describe('getAlertById', () => {
    it('should return mapped alert when found', async () => {
      const dbAlert = {
        id: 'alert-123',
        tenant_id: 'venue-123',
        message: 'High sales alert',
        alert_type: AlertType.THRESHOLD,
        severity: AlertSeverity.WARNING,
        status: 'active',
        metric_type: 'sales',
        threshold_value: 100,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAlertModel.findById.mockResolvedValue(dbAlert);

      const result = await alertService.getAlertById('alert-123', 'venue-123');

      expect(mockAlertModel.findById).toHaveBeenCalledWith('alert-123', 'venue-123');
      expect(result).toEqual(expect.objectContaining({
        id: 'alert-123',
        venueId: 'venue-123',
        name: 'High sales alert',
        type: AlertType.THRESHOLD,
        severity: AlertSeverity.WARNING,
        status: AlertStatus.ACTIVE,
        enabled: true,
      }));
    });

    it('should return null when alert not found', async () => {
      mockAlertModel.findById.mockResolvedValue(null);
      const result = await alertService.getAlertById('nonexistent', 'venue-123');
      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      mockAlertModel.findById.mockRejectedValue(new Error('Database error'));
      await expect(alertService.getAlertById('alert-123', 'venue-123'))
        .rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createAlert', () => {
    it('should create and return mapped alert', async () => {
      const alertData = {
        venueId: 'venue-123',
        name: 'New Alert',
        description: 'Test alert',
        type: AlertType.THRESHOLD,
        severity: AlertSeverity.WARNING,
        status: AlertStatus.ACTIVE,
        conditions: [],
        actions: [],
        enabled: true,
        triggerCount: 0,
        createdBy: 'user-123',
      };

      const dbAlert = {
        id: 'alert-new',
        tenant_id: 'venue-123',
        message: 'New Alert',
        alert_type: AlertType.THRESHOLD,
        severity: AlertSeverity.WARNING,
        status: 'active',
        metric_type: 'sales',
        threshold_value: 100,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAlertModel.createAlert.mockResolvedValue(dbAlert);

      const result = await alertService.createAlert(alertData);

      expect(result.id).toBe('alert-new');
      expect(mockLogger.info).toHaveBeenCalledWith('Alert created', expect.any(Object));
    });

    it('should throw error when creation fails', async () => {
      mockAlertModel.createAlert.mockResolvedValue(null);
      await expect(alertService.createAlert({} as any))
        .rejects.toThrow('Failed to create alert');
    });
  });

  describe('updateAlert', () => {
    it('should update and return mapped alert', async () => {
      const dbAlert = {
        id: 'alert-123',
        tenant_id: 'venue-123',
        message: 'Updated Alert',
        alert_type: AlertType.THRESHOLD,
        severity: AlertSeverity.CRITICAL,
        status: 'active',
        metric_type: 'revenue',
        threshold_value: 500,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAlertModel.updateAlert.mockResolvedValue(dbAlert);

      const result = await alertService.updateAlert('alert-123', { name: 'Updated Alert' });

      expect(result.name).toBe('Updated Alert');
      expect(mockLogger.info).toHaveBeenCalledWith('Alert updated', { alertId: 'alert-123' });
    });

    it('should throw error when alert not found', async () => {
      mockAlertModel.updateAlert.mockResolvedValue(null);
      await expect(alertService.updateAlert('nonexistent', {}))
        .rejects.toThrow('Alert not found');
    });
  });

  describe('deleteAlert', () => {
    it('should return true when alert deleted', async () => {
      mockAlertModel.delete.mockResolvedValue(true);
      const result = await alertService.deleteAlert('alert-123', 'venue-123');
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Alert deleted', { alertId: 'alert-123' });
    });

    it('should return false when alert not found', async () => {
      mockAlertModel.delete.mockResolvedValue(false);
      const result = await alertService.deleteAlert('nonexistent', 'venue-123');
      expect(result).toBe(false);
    });

    it('should throw error on database failure', async () => {
      mockAlertModel.delete.mockRejectedValue(new Error('Delete failed'));
      await expect(alertService.deleteAlert('alert-123', 'venue-123'))
        .rejects.toThrow('Delete failed');
    });
  });

  describe('toggleAlert', () => {
    it('should enable alert', async () => {
      const dbAlert = {
        id: 'alert-123',
        tenant_id: 'venue-123',
        message: 'Alert',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAlertModel.toggleAlert.mockResolvedValue(dbAlert);

      const result = await alertService.toggleAlert('alert-123', true);

      expect(result.enabled).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Alert toggled', { alertId: 'alert-123', enabled: true });
    });

    it('should disable alert', async () => {
      const dbAlert = {
        id: 'alert-123',
        tenant_id: 'venue-123',
        message: 'Alert',
        status: 'disabled',
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAlertModel.toggleAlert.mockResolvedValue(dbAlert);

      const result = await alertService.toggleAlert('alert-123', false);
      expect(result.enabled).toBe(false);
    });

    it('should throw error when alert not found', async () => {
      mockAlertModel.toggleAlert.mockResolvedValue(null);
      await expect(alertService.toggleAlert('nonexistent', true))
        .rejects.toThrow('Alert not found');
    });
  });

  describe('testAlert', () => {
    it('should send test alert notification', async () => {
      const dbAlert = {
        id: 'alert-123',
        tenant_id: 'venue-123',
        message: 'Test Alert',
        alert_type: AlertType.THRESHOLD,
        severity: AlertSeverity.WARNING,
        status: 'active',
        metric_type: 'sales',
        threshold_value: 100,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAlertModel.findById.mockResolvedValue(dbAlert);

      await alertService.testAlert('alert-123', 'venue-123');

      expect(mockLogger.info).toHaveBeenCalledWith('Test alert sent', { alertId: 'alert-123' });
    });

    it('should throw error when alert not found', async () => {
      mockAlertModel.findById.mockResolvedValue(null);
      await expect(alertService.testAlert('nonexistent', 'venue-123'))
        .rejects.toThrow('Alert not found');
    });
  });

  describe('getAlertsByVenue', () => {
    it('should return mapped alerts for venue', async () => {
      const dbAlerts = [
        { id: 'alert-1', tenant_id: 'venue-123', message: 'Alert 1', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 'alert-2', tenant_id: 'venue-123', message: 'Alert 2', status: 'active', created_at: new Date(), updated_at: new Date() },
      ];
      mockAlertModel.getAlertsByVenue.mockResolvedValue(dbAlerts);

      const result = await alertService.getAlertsByVenue('venue-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('alert-1');
      expect(result[1].id).toBe('alert-2');
    });
  });

  describe('getAlertInstances', () => {
    it('should return alert instances with limit', async () => {
      const instances = [
        { id: 'inst-1', alertId: 'alert-123', status: 'active' },
        { id: 'inst-2', alertId: 'alert-123', status: 'resolved' },
      ];
      mockAlertModel.getAlertInstances.mockResolvedValue(instances);

      const result = await alertService.getAlertInstances('alert-123', 10);

      expect(mockAlertModel.getAlertInstances).toHaveBeenCalledWith('alert-123', 10);
      expect(result).toHaveLength(2);
    });

    it('should use default limit of 50', async () => {
      mockAlertModel.getAlertInstances.mockResolvedValue([]);
      await alertService.getAlertInstances('alert-123');
      expect(mockAlertModel.getAlertInstances).toHaveBeenCalledWith('alert-123', 50);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert instance', async () => {
      const acknowledgedInstance = {
        id: 'inst-123',
        alertId: 'alert-123',
        status: 'acknowledged',
        acknowledgedBy: 'user-123',
        acknowledgedAt: new Date(),
      };
      mockAlertModel.acknowledgeAlertInstance.mockResolvedValue(acknowledgedInstance);

      const result = await alertService.acknowledgeAlert('inst-123', 'user-123', 'Investigating');

      expect(mockAlertModel.acknowledgeAlertInstance).toHaveBeenCalledWith('inst-123', 'user-123', 'Investigating');
      expect(result.status).toBe('acknowledged');
    });
  });
});
