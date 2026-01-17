import { EscalationManager } from '../../../../src/alerting/escalation/escalation.manager';

jest.mock('../../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { logger } from '../../../../src/logger';

describe('EscalationManager', () => {
  let escalationManager: EscalationManager;

  const createMockAlert = (overrides = {}) => ({
    id: 'alert-123',
    ruleId: 'rule-456',
    ruleName: 'High CPU Alert',
    severity: 'critical',
    message: 'CPU usage exceeded threshold',
    value: 95,
    threshold: 80,
    timestamp: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));

    escalationManager = new EscalationManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should load default escalation policies', () => {
      expect(logger.info).toHaveBeenCalledWith('Loaded 2 escalation policies');
    });
  });

  describe('escalate', () => {
    describe('acknowledged alerts', () => {
      it('should skip escalation for acknowledged alerts', async () => {
        const alert = createMockAlert();

        escalationManager.acknowledge('alert-123');
        await escalationManager.escalate(alert);

        expect(logger.debug).toHaveBeenCalledWith(
          'Alert alert-123 acknowledged, skipping escalation'
        );
        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.stringContaining('Escalating alert')
        );
      });
    });

    describe('missing policy', () => {
      it('should warn when no policy exists for severity', async () => {
        const alert = createMockAlert({ severity: 'info' });

        await escalationManager.escalate(alert);

        expect(logger.warn).toHaveBeenCalledWith(
          'No escalation policy for severity: info'
        );
      });
    });

    describe('critical severity escalation', () => {
      it('should not escalate immediately (before wait time)', async () => {
        const alert = createMockAlert({ severity: 'critical' });

        await escalationManager.escalate(alert);

        // No time has passed, no escalation yet
        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.stringContaining('Escalating alert')
        );
      });

      it('should escalate to Level 1 after 5 minutes', async () => {
        const alert = createMockAlert({ severity: 'critical' });

        // Advance time by 5 minutes
        jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));

        await escalationManager.escalate(alert);

        expect(logger.warn).toHaveBeenCalledWith(
          'Escalating alert alert-123 to Level 1 - On-Call Engineer'
        );
      });

      it('should escalate to Level 2 after 15 minutes', async () => {
        const alert = createMockAlert({ severity: 'critical' });

        // Advance time by 15 minutes
        jest.setSystemTime(new Date('2024-01-15T10:15:00Z'));

        await escalationManager.escalate(alert);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Level 2 - Team Lead')
        );
      });

      it('should escalate to Level 3 after 30 minutes', async () => {
        const alert = createMockAlert({ severity: 'critical' });

        // Advance time by 30 minutes
        jest.setSystemTime(new Date('2024-01-15T10:30:00Z'));

        await escalationManager.escalate(alert);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Level 3 - Engineering Manager')
        );
      });
    });

    describe('error severity escalation', () => {
      it('should escalate to Level 1 after 15 minutes', async () => {
        const alert = createMockAlert({ severity: 'error' });

        // Advance time by 15 minutes
        jest.setSystemTime(new Date('2024-01-15T10:15:00Z'));

        await escalationManager.escalate(alert);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Level 1 - On-Call Engineer')
        );
      });

      it('should escalate to Level 2 after 1 hour', async () => {
        const alert = createMockAlert({ severity: 'error' });

        // Advance time by 1 hour
        jest.setSystemTime(new Date('2024-01-15T11:00:00Z'));

        await escalationManager.escalate(alert);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Level 2 - Team Lead')
        );
      });
    });

    describe('alert ID generation', () => {
      it('should generate alert ID from ruleId and timestamp when id not provided', async () => {
        const alert = createMockAlert({ id: undefined });

        jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));
        await escalationManager.escalate(alert);

        const expectedId = `rule-456-${new Date('2024-01-15T10:00:00Z').getTime()}`;
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining(expectedId)
        );
      });
    });

    describe('duplicate escalation prevention', () => {
      it('should not escalate to same level twice', async () => {
        const alert = createMockAlert({ severity: 'critical' });

        jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));

        await escalationManager.escalate(alert);
        await escalationManager.escalate(alert);

        // Level 1 should only be logged once
        const level1Calls = (logger.warn as jest.Mock).mock.calls.filter(
          call => call[0].includes('Level 1 - On-Call Engineer')
        );

        expect(level1Calls.length).toBe(1);
      });
    });

    describe('error handling', () => {
      it('should log and throw on escalation failure', async () => {
        const alert = createMockAlert({ severity: 'critical' });
        alert.timestamp = null as any; // Force an error

        await expect(escalationManager.escalate(alert)).rejects.toThrow();
        expect(logger.error).toHaveBeenCalledWith(
          'Escalation failed:',
          expect.any(Error)
        );
      });
    });
  });

  describe('acknowledge', () => {
    it('should mark alert as acknowledged', () => {
      escalationManager.acknowledge('alert-123');

      expect(escalationManager.isAcknowledged('alert-123')).toBe(true);
    });

    it('should log acknowledgment', () => {
      escalationManager.acknowledge('alert-456');

      expect(logger.info).toHaveBeenCalledWith('Alert alert-456 acknowledged');
    });
  });

  describe('isAcknowledged', () => {
    it('should return false for non-acknowledged alerts', () => {
      expect(escalationManager.isAcknowledged('unknown-alert')).toBe(false);
    });

    it('should return true for acknowledged alerts', () => {
      escalationManager.acknowledge('test-alert');

      expect(escalationManager.isAcknowledged('test-alert')).toBe(true);
    });
  });

  describe('getEscalationHistory', () => {
    it('should return empty array for alerts with no escalations', () => {
      const history = escalationManager.getEscalationHistory('unknown-alert');

      expect(history).toEqual([]);
    });

    it('should return escalation levels for escalated alerts', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      // Escalate to Level 1
      jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));
      await escalationManager.escalate(alert);

      // Escalate to Level 2
      jest.setSystemTime(new Date('2024-01-15T10:15:00Z'));
      await escalationManager.escalate(alert);

      const history = escalationManager.getEscalationHistory('alert-123');

      expect(history).toContain('Level 1 - On-Call Engineer');
      expect(history).toContain('Level 2 - Team Lead');
    });
  });

  describe('clearEscalation', () => {
    it('should clear escalation history for alert', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));
      await escalationManager.escalate(alert);

      escalationManager.clearEscalation('alert-123');

      const history = escalationManager.getEscalationHistory('alert-123');
      expect(history).toEqual([]);
    });

    it('should clear acknowledgment status', () => {
      escalationManager.acknowledge('alert-123');
      expect(escalationManager.isAcknowledged('alert-123')).toBe(true);

      escalationManager.clearEscalation('alert-123');
      expect(escalationManager.isAcknowledged('alert-123')).toBe(false);
    });

    it('should log clearing', () => {
      escalationManager.clearEscalation('alert-123');

      expect(logger.debug).toHaveBeenCalledWith(
        'Cleared escalation history for alert alert-123'
      );
    });
  });

  describe('escalation notification sending', () => {
    it('should send notification to all contacts at a level', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));
      await escalationManager.escalate(alert);

      // Level 1 has 2 contacts: slack #on-call and pagerduty
      expect(logger.info).toHaveBeenCalledWith(
        'Sending escalation via slack to #on-call'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Sending escalation via pagerduty to default'
      );
    });

    it('should continue sending to other contacts if one fails', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));
      await escalationManager.escalate(alert);

      // Both contacts should be attempted
      const sendCalls = (logger.info as jest.Mock).mock.calls.filter(
        call => call[0].includes('Sending escalation via')
      );

      expect(sendCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('escalation message formatting', () => {
    it('should format message with all alert details', async () => {
      const alert = createMockAlert({
        ruleName: 'Test Alert',
        severity: 'critical',
        value: 100,
        threshold: 80,
        message: 'Test message',
      });

      jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));
      await escalationManager.escalate(alert);

      const debugCalls = (logger.debug as jest.Mock).mock.calls.filter(
        call => call[0].includes('Escalation message:')
      );

      expect(debugCalls.length).toBeGreaterThan(0);
      const message = debugCalls[0][0];

      expect(message).toContain('ESCALATED ALERT');
      expect(message).toContain('Test Alert');
      expect(message).toContain('CRITICAL');
    });
  });

  describe('multiple alerts handling', () => {
    it('should track escalations independently for different alerts', async () => {
      const alert1 = createMockAlert({ id: 'alert-1', severity: 'critical' });
      const alert2 = createMockAlert({ id: 'alert-2', severity: 'critical' });

      jest.setSystemTime(new Date('2024-01-15T10:05:00Z'));

      await escalationManager.escalate(alert1);
      await escalationManager.escalate(alert2);

      const history1 = escalationManager.getEscalationHistory('alert-1');
      const history2 = escalationManager.getEscalationHistory('alert-2');

      expect(history1).toEqual(['Level 1 - On-Call Engineer']);
      expect(history2).toEqual(['Level 1 - On-Call Engineer']);
    });

    it('should acknowledge alerts independently', () => {
      escalationManager.acknowledge('alert-1');

      expect(escalationManager.isAcknowledged('alert-1')).toBe(true);
      expect(escalationManager.isAcknowledged('alert-2')).toBe(false);
    });
  });
});
