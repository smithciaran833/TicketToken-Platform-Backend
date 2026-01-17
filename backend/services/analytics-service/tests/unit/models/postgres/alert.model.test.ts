/**
 * Alert Model Unit Tests
 */

const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockDelete = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn();
const mockOffset = jest.fn();
const mockRaw = jest.fn();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  insert: mockInsert,
  update: mockUpdate,
  returning: mockReturning,
  delete: mockDelete,
  orderBy: mockOrderBy,
  limit: mockLimit,
  offset: mockOffset,
}));
mockDb.raw = mockRaw;

jest.mock('../../../../src/config/database', () => ({
  getDb: () => mockDb,
}));

import { AlertModel, Alert } from '../../../../src/models/postgres/alert.model';

describe('AlertModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockUpdate.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
  });

  describe('create', () => {
    it('should create alert and return it', async () => {
      const alertData = {
        tenant_id: 'tenant-1',
        alert_type: 'threshold',
        severity: 'high',
        metric_type: 'revenue',
        entity_type: 'venue',
        threshold_config: { threshold: 1000 },
        status: 'active',
        message: 'Revenue exceeded threshold',
        metadata: {},
        triggered_at: new Date(),
      };
      const created = { id: 'alert-1', ...alertData };
      mockReturning.mockResolvedValue([created]);

      const result = await AlertModel.create(alertData as any);

      expect(result).toEqual(created);
      expect(mockDb).toHaveBeenCalledWith('analytics_alerts');
      expect(mockInsert).toHaveBeenCalledWith(alertData);
    });
  });

  describe('createAlert (legacy)', () => {
    it('should create alert with legacy field names', async () => {
      const legacyData = {
        venueId: 'venue-1',
        type: 'threshold',
        severity: 'medium',
        metricType: 'sales',
        message: 'Sales alert',
      };
      mockReturning.mockResolvedValue([{ id: 'alert-1' }]);

      await AlertModel.createAlert(legacyData);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'venue-1',
          alert_type: 'threshold',
          severity: 'medium',
          metric_type: 'sales',
        })
      );
    });
  });

  describe('updateAlert (legacy)', () => {
    it('should update alert fields', async () => {
      const updates = { type: 'anomaly', severity: 'high', message: 'Updated' };
      mockReturning.mockResolvedValue([{ id: 'alert-1' }]);

      await AlertModel.updateAlert('alert-1', updates);

      expect(mockWhere).toHaveBeenCalledWith({ id: 'alert-1' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'anomaly',
          severity: 'high',
        })
      );
    });

    it('should return null if not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await AlertModel.updateAlert('non-existent', {});

      expect(result).toBeNull();
    });
  });

  describe('toggleAlert (legacy)', () => {
    it('should enable alert', async () => {
      mockReturning.mockResolvedValue([{ id: 'alert-1', status: 'active' }]);

      const result = await AlertModel.toggleAlert('alert-1', true);

      expect(mockUpdate).toHaveBeenCalledWith({ status: 'active' });
      expect(result?.status).toBe('active');
    });

    it('should disable alert', async () => {
      mockReturning.mockResolvedValue([{ id: 'alert-1', status: 'inactive' }]);

      const result = await AlertModel.toggleAlert('alert-1', false);

      expect(mockUpdate).toHaveBeenCalledWith({ status: 'inactive' });
      expect(result?.status).toBe('inactive');
    });
  });

  describe('getAlertsByVenue (legacy)', () => {
    it('should get all alerts for venue', async () => {
      const alerts = [{ id: 'alert-1' }, { id: 'alert-2' }];
      mockOrderBy.mockResolvedValue(alerts);

      const result = await AlertModel.getAlertsByVenue('venue-1');

      expect(result).toEqual(alerts);
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'venue-1' });
    });

    it('should filter active only', async () => {
      mockOrderBy.mockResolvedValue([]);

      await AlertModel.getAlertsByVenue('venue-1', true);

      expect(mockWhere).toHaveBeenCalledWith('status', 'active');
    });
  });

  describe('findById', () => {
    it('should find alert by id and tenant', async () => {
      const alert = { id: 'alert-1', tenant_id: 'tenant-1' };
      mockFirst.mockResolvedValue(alert);

      const result = await AlertModel.findById('alert-1', 'tenant-1');

      expect(result).toEqual(alert);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'alert-1', tenant_id: 'tenant-1' });
    });

    it('should return null if not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await AlertModel.findById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('findByStatus', () => {
    it('should find alerts by status', async () => {
      const alerts = [{ id: 'alert-1', status: 'active' }];
      // Chain: where().orderBy().limit().offset() - offset is terminal when both limit/offset provided
      // But when neither provided, orderBy is terminal
      mockOrderBy.mockResolvedValue(alerts);

      const result = await AlertModel.findByStatus('active', 'tenant-1');

      expect(result).toEqual(alerts);
      expect(mockWhere).toHaveBeenCalledWith({ status: 'active', tenant_id: 'tenant-1' });
      expect(mockOrderBy).toHaveBeenCalledWith('triggered_at', 'desc');
    });

    it('should apply limit and offset', async () => {
      mockOffset.mockResolvedValue([]);

      await AlertModel.findByStatus('active', 'tenant-1', { limit: 10, offset: 20 });

      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(mockOffset).toHaveBeenCalledWith(20);
    });
  });

  describe('findByEntity', () => {
    it('should find alerts by entity', async () => {
      const alerts = [{ id: 'alert-1' }];
      // Chain: where().orderBy().limit() when limit provided, else orderBy is terminal
      mockOrderBy.mockResolvedValue(alerts);

      const result = await AlertModel.findByEntity('event', 'event-1', 'tenant-1');

      expect(result).toEqual(alerts);
      expect(mockWhere).toHaveBeenCalledWith({
        entity_type: 'event',
        entity_id: 'event-1',
        tenant_id: 'tenant-1',
      });
    });

    it('should filter by status', async () => {
      mockLimit.mockResolvedValue([]);

      await AlertModel.findByEntity('event', 'event-1', 'tenant-1', { status: 'resolved', limit: 10 });

      expect(mockWhere).toHaveBeenCalledWith('status', 'resolved');
      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe('resolve', () => {
    it('should resolve alert', async () => {
      const resolved = { id: 'alert-1', status: 'resolved', resolved_by: 'user-1' };
      mockReturning.mockResolvedValue([resolved]);

      const result = await AlertModel.resolve('alert-1', 'tenant-1', 'user-1');

      expect(result).toEqual(resolved);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'resolved',
        resolved_at: expect.any(Date),
        resolved_by: 'user-1',
      });
    });
  });

  describe('delete', () => {
    it('should delete alert', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await AlertModel.delete('alert-1', 'tenant-1');

      expect(result).toBe(true);
    });

    it('should return false if not found', async () => {
      mockDelete.mockResolvedValue(0);

      const result = await AlertModel.delete('non-existent', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('incrementTriggerCount (legacy)', () => {
    it('should update the updated_at timestamp', async () => {
      mockReturning.mockResolvedValue([]);

      await AlertModel.incrementTriggerCount('alert-1');

      expect(mockWhere).toHaveBeenCalledWith({ id: 'alert-1' });
      expect(mockUpdate).toHaveBeenCalledWith({ updated_at: expect.any(Date) });
    });
  });

  describe('resolveAlertInstance (legacy)', () => {
    it('should resolve alert instance', async () => {
      mockReturning.mockResolvedValue([]);

      await AlertModel.resolveAlertInstance('instance-1');

      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'resolved',
        resolved_at: expect.any(Date),
      });
    });
  });
});
