// Mock dependencies BEFORE imports
const mockQuery = jest.fn();
const mockDel = jest.fn();

jest.mock('../../../src/utils/database', () => ({
  pgPool: { query: mockQuery },
  redisClient: { del: mockDel },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

import { alertService } from '../../../src/services/alert.service';
import { logger } from '../../../src/utils/logger';

describe('AlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDel.mockResolvedValue(1);
  });

  describe('getActiveAlerts', () => {
    it('should return active alerts ordered by severity and date', async () => {
      const mockAlerts = [
        { id: '1', severity: 'critical', state: 'firing', title: 'CPU High' },
        { id: '2', severity: 'warning', state: 'pending', title: 'Memory Warning' },
      ];
      mockQuery.mockResolvedValue({ rows: mockAlerts });

      const result = await alertService.getActiveAlerts();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("state IN ('pending', 'firing')")
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY severity, started_at DESC')
      );
      expect(result).toEqual(mockAlerts);
    });

    it('should return empty array when no active alerts', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await alertService.getActiveAlerts();

      expect(result).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Connection refused');
      mockQuery.mockRejectedValue(dbError);

      await expect(alertService.getActiveAlerts()).rejects.toThrow('Connection refused');
      expect(logger.error).toHaveBeenCalledWith('Error getting active alerts:', dbError);
    });

    it('should handle database timeout errors', async () => {
      const timeoutError = new Error('Query timeout');
      mockQuery.mockRejectedValue(timeoutError);

      await expect(alertService.getActiveAlerts()).rejects.toThrow('Query timeout');
    });
  });

  describe('getAlert', () => {
    it('should return alert when found', async () => {
      const mockAlert = {
        id: 'alert-123',
        rule_id: 'rule-1',
        severity: 'critical',
        title: 'Service Down',
        state: 'firing',
        started_at: new Date(),
      };
      mockQuery.mockResolvedValue({ rows: [mockAlert] });

      const result = await alertService.getAlert('alert-123');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM alerts WHERE id = $1',
        ['alert-123']
      );
      expect(result).toEqual(mockAlert);
    });

    it('should return null when alert not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await alertService.getAlert('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should handle UUID format IDs', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertService.getAlert('550e8400-e29b-41d4-a716-446655440000');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['550e8400-e29b-41d4-a716-446655440000']
      );
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Database error');
      mockQuery.mockRejectedValue(dbError);

      await expect(alertService.getAlert('alert-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error getting alert:', dbError);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert with provided user', async () => {
      const acknowledgedAlert = {
        id: 'alert-1',
        acknowledged: true,
        acknowledged_by: 'user-123',
        acknowledged_at: new Date(),
      };
      mockQuery.mockResolvedValue({ rows: [acknowledgedAlert], rowCount: 1 });

      const result = await alertService.acknowledgeAlert('alert-1', {
        acknowledged_by: 'user-123',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        ['alert-1', 'user-123']
      );
      expect(result).toEqual(acknowledgedAlert);
    });

    it('should use "system" as default acknowledged_by', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'alert-1' }], rowCount: 1 });

      await alertService.acknowledgeAlert('alert-1', {});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['alert-1', 'system']
      );
    });

    it('should clear alert from Redis cache after acknowledgment', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'alert-1' }], rowCount: 1 });

      await alertService.acknowledgeAlert('alert-1', {});

      expect(mockDel).toHaveBeenCalledWith('alert:alert-1');
    });

    it('should throw error when alert not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        alertService.acknowledgeAlert('nonexistent', {})
      ).rejects.toThrow('Alert not found');
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Update failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(
        alertService.acknowledgeAlert('alert-1', {})
      ).rejects.toThrow('Update failed');
      expect(logger.error).toHaveBeenCalledWith('Error acknowledging alert:', dbError);
    });

    it('should handle Redis cache clear failure gracefully', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'alert-1' }], rowCount: 1 });
      mockDel.mockRejectedValue(new Error('Redis unavailable'));

      await expect(
        alertService.acknowledgeAlert('alert-1', {})
      ).rejects.toThrow('Redis unavailable');
    });
  });

  describe('resolveAlert', () => {
    it('should resolve alert with resolution note', async () => {
      const resolvedAlert = {
        id: 'alert-2',
        state: 'resolved',
        resolved_at: new Date(),
        resolution_note: 'Fixed by restarting service',
      };
      mockQuery.mockResolvedValue({ rows: [resolvedAlert], rowCount: 1 });

      const result = await alertService.resolveAlert('alert-2', {
        resolution_note: 'Fixed by restarting service',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("state = 'resolved'"),
        ['alert-2', 'Fixed by restarting service']
      );
      expect(result).toEqual(resolvedAlert);
    });

    it('should use null as default resolution_note', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'alert-2' }], rowCount: 1 });

      await alertService.resolveAlert('alert-2', {});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['alert-2', null]
      );
    });

    it('should clear alert from Redis cache after resolution', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'alert-2' }], rowCount: 1 });

      await alertService.resolveAlert('alert-2', {});

      expect(mockDel).toHaveBeenCalledWith('alert:alert-2');
    });

    it('should throw error when alert not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        alertService.resolveAlert('nonexistent', {})
      ).rejects.toThrow('Alert not found');
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Resolve failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(
        alertService.resolveAlert('alert-2', {})
      ).rejects.toThrow('Resolve failed');
      expect(logger.error).toHaveBeenCalledWith('Error resolving alert:', dbError);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history with default pagination', async () => {
      const mockHistory = [
        { id: '1', state: 'resolved', started_at: new Date() },
        { id: '2', state: 'resolved', started_at: new Date() },
      ];
      mockQuery.mockResolvedValue({ rows: mockHistory });

      const result = await alertService.getAlertHistory({});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [100, 0]
      );
      expect(result).toEqual(mockHistory);
    });

    it('should use custom limit and offset', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertService.getAlertHistory({ limit: 50, offset: 100 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [50, 100]
      );
    });

    it('should filter alerts from last 30 days', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertService.getAlertHistory({});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30 days'"),
        expect.any(Array)
      );
    });

    it('should order by started_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertService.getAlertHistory({});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY started_at DESC'),
        expect.any(Array)
      );
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('History query failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(alertService.getAlertHistory({})).rejects.toThrow('History query failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting alert history:', dbError);
    });

    it('should handle zero limit gracefully', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertService.getAlertHistory({ limit: 0 });

      // Should use default limit of 100 since 0 is falsy
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [100, 0]
      );
    });
  });

  describe('getAlertRules', () => {
    it('should return enabled alert rules ordered by severity and name', async () => {
      const mockRules = [
        { id: '1', rule_name: 'CPU High', severity: 'critical', enabled: true },
        { id: '2', rule_name: 'Memory Warning', severity: 'warning', enabled: true },
      ];
      mockQuery.mockResolvedValue({ rows: mockRules });

      const result = await alertService.getAlertRules();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('enabled = true')
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY severity, rule_name')
      );
      expect(result).toEqual(mockRules);
    });

    it('should return empty array when no rules exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await alertService.getAlertRules();

      expect(result).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Rules query failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(alertService.getAlertRules()).rejects.toThrow('Rules query failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting alert rules:', dbError);
    });
  });

  describe('createAlertRule', () => {
    it('should create alert rule with all fields', async () => {
      const ruleData = {
        rule_name: 'High CPU Usage',
        metric_name: 'cpu_usage',
        condition: '>',
        threshold: 90,
        severity: 'critical',
      };
      const createdRule = { id: 'mock-uuid-12345', ...ruleData, enabled: true };
      mockQuery.mockResolvedValue({ rows: [createdRule] });

      const result = await alertService.createAlertRule(ruleData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alert_rules'),
        [
          'mock-uuid-12345',
          'High CPU Usage',
          'cpu_usage',
          '>',
          90,
          'critical',
          true,
        ]
      );
      expect(result).toEqual(createdRule);
    });

    it('should generate unique UUID for each rule', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'mock-uuid-12345' }] });

      await alertService.createAlertRule({ rule_name: 'Test' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['mock-uuid-12345'])
      );
    });

    it('should always set enabled to true on creation', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'mock-uuid-12345' }] });

      await alertService.createAlertRule({ rule_name: 'Test', enabled: false });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([true])
      );
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(
        alertService.createAlertRule({ rule_name: 'Test' })
      ).rejects.toThrow('Insert failed');
      expect(logger.error).toHaveBeenCalledWith('Error creating alert rule:', dbError);
    });

    it('should handle undefined fields gracefully', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'mock-uuid-12345' }] });

      await alertService.createAlertRule({});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['mock-uuid-12345', undefined, undefined, undefined, undefined, undefined, true]
      );
    });
  });

  describe('updateAlertRule', () => {
    it('should update alert rule with all fields', async () => {
      const updateData = {
        rule_name: 'Updated Rule',
        metric_name: 'memory_usage',
        condition: '<',
        threshold: 20,
        severity: 'warning',
      };
      const updatedRule = { id: 'rule-1', ...updateData };
      mockQuery.mockResolvedValue({ rows: [updatedRule], rowCount: 1 });

      const result = await alertService.updateAlertRule('rule-1', updateData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alert_rules'),
        ['rule-1', 'Updated Rule', 'memory_usage', '<', 20, 'warning']
      );
      expect(result).toEqual(updatedRule);
    });

    it('should set updated_at to NOW()', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'rule-1' }], rowCount: 1 });

      await alertService.updateAlertRule('rule-1', {});

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should throw error when rule not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        alertService.updateAlertRule('nonexistent', {})
      ).rejects.toThrow('Alert rule not found');
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Update query failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(
        alertService.updateAlertRule('rule-1', {})
      ).rejects.toThrow('Update query failed');
      expect(logger.error).toHaveBeenCalledWith('Error updating alert rule:', dbError);
    });
  });

  describe('deleteAlertRule', () => {
    it('should delete alert rule by id', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await alertService.deleteAlertRule('rule-to-delete');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM alert_rules WHERE id = $1',
        ['rule-to-delete']
      );
    });

    it('should not throw when rule does not exist', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      await expect(
        alertService.deleteAlertRule('nonexistent')
      ).resolves.toBeUndefined();
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Delete failed');
      mockQuery.mockRejectedValue(dbError);

      await expect(
        alertService.deleteAlertRule('rule-1')
      ).rejects.toThrow('Delete failed');
      expect(logger.error).toHaveBeenCalledWith('Error deleting alert rule:', dbError);
    });
  });

  describe('exported instance', () => {
    it('should export alertService as singleton', () => {
      const { alertService: exported1 } = require('../../../src/services/alert.service');
      const { alertService: exported2 } = require('../../../src/services/alert.service');
      expect(exported1).toBe(exported2);
    });
  });
});
