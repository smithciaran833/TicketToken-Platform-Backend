import { EscalationManager } from '../../../src/alerting/escalation/escalation.manager';

describe('EscalationManager', () => {
  let manager: EscalationManager;
  let mockAlert: any;

  beforeEach(() => {
    manager = new EscalationManager();
    mockAlert = {
      id: 'alert-123',
      ruleId: 'high_error_rate',
      ruleName: 'High Error Rate',
      severity: 'critical',
      message: 'Error rate exceeded threshold',
      value: 15,
      threshold: 10,
      timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    };
  });

  describe('escalate', () => {
    it('should not escalate if alert is acknowledged', async () => {
      manager.acknowledge('alert-123');
      
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history.length).toBe(0);
    });

    it('should escalate to level 1 after wait time for critical alerts', async () => {
      // Alert from 10 minutes ago, critical level 1 is 5 minutes
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history).toContain('Level 1 - On-Call Engineer');
    });

    it('should not escalate if wait time not reached', async () => {
      mockAlert.timestamp = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history.length).toBe(0);
    });

    it('should escalate to multiple levels if time thresholds passed', async () => {
      mockAlert.timestamp = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history).toContain('Level 1 - On-Call Engineer');
      expect(history).toContain('Level 2 - Team Lead');
    });

    it('should not escalate again to same level', async () => {
      mockAlert.timestamp = new Date(Date.now() - 10 * 60 * 1000);
      
      await manager.escalate(mockAlert);
      const firstHistory = manager.getEscalationHistory('alert-123');
      
      await manager.escalate(mockAlert);
      const secondHistory = manager.getEscalationHistory('alert-123');
      
      expect(firstHistory.length).toBe(secondHistory.length);
    });

    it('should handle alerts without escalation policy', async () => {
      mockAlert.severity = 'info';
      
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history.length).toBe(0);
    });
  });

  describe('acknowledge', () => {
    it('should mark alert as acknowledged', () => {
      manager.acknowledge('alert-123');
      
      expect(manager.isAcknowledged('alert-123')).toBe(true);
    });

    it('should prevent future escalations', async () => {
      manager.acknowledge('alert-123');
      
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history.length).toBe(0);
    });
  });

  describe('clearEscalation', () => {
    it('should clear escalation history and acknowledgement', async () => {
      await manager.escalate(mockAlert);
      manager.acknowledge('alert-123');
      
      manager.clearEscalation('alert-123');
      
      expect(manager.getEscalationHistory('alert-123').length).toBe(0);
      expect(manager.isAcknowledged('alert-123')).toBe(false);
    });
  });

  describe('error policy escalation', () => {
    beforeEach(() => {
      mockAlert.severity = 'error';
      mockAlert.timestamp = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
    });

    it('should escalate error alerts with different timing', async () => {
      await manager.escalate(mockAlert);
      
      const history = manager.getEscalationHistory('alert-123');
      expect(history).toContain('Level 1 - On-Call Engineer');
      expect(history).not.toContain('Level 2 - Team Lead'); // Not enough time
    });
  });
});
