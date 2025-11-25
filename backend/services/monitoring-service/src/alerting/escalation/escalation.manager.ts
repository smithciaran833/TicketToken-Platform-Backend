import { logger } from '../../logger';

interface Alert {
  id?: string;
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

interface EscalationLevel {
  name: string;
  waitTime: number; // milliseconds
  contacts: Array<{
    channel: string;
    recipient: string;
  }>;
}

interface EscalationPolicy {
  id: string;
  severity: string;
  levels: EscalationLevel[];
}

export class EscalationManager {
  private policies: Map<string, EscalationPolicy> = new Map();
  private acknowledged: Set<string> = new Set();
  private escalations: Map<string, string[]> = new Map();
  
  constructor() {
    this.loadPolicies();
  }
  
  private loadPolicies(): void {
    // Default escalation policies
    const criticalPolicy: EscalationPolicy = {
      id: 'critical',
      severity: 'critical',
      levels: [
        {
          name: 'Level 1 - On-Call Engineer',
          waitTime: 5 * 60 * 1000, // 5 minutes
          contacts: [
            { channel: 'slack', recipient: '#on-call' },
            { channel: 'pagerduty', recipient: 'default' }
          ]
        },
        {
          name: 'Level 2 - Team Lead',
          waitTime: 15 * 60 * 1000, // 15 minutes
          contacts: [
            { channel: 'slack', recipient: '#team-leads' },
            { channel: 'email', recipient: 'leads@tickettoken.com' }
          ]
        },
        {
          name: 'Level 3 - Engineering Manager',
          waitTime: 30 * 60 * 1000, // 30 minutes
          contacts: [
            { channel: 'slack', recipient: '#exec-team' },
            { channel: 'email', recipient: 'manager@tickettoken.com' }
          ]
        }
      ]
    };
    
    const errorPolicy: EscalationPolicy = {
      id: 'error',
      severity: 'error',
      levels: [
        {
          name: 'Level 1 - On-Call Engineer',
          waitTime: 15 * 60 * 1000, // 15 minutes
          contacts: [
            { channel: 'slack', recipient: '#on-call' }
          ]
        },
        {
          name: 'Level 2 - Team Lead',
          waitTime: 60 * 60 * 1000, // 1 hour
          contacts: [
            { channel: 'email', recipient: 'leads@tickettoken.com' }
          ]
        }
      ]
    };
    
    this.policies.set('critical', criticalPolicy);
    this.policies.set('error', errorPolicy);
    
    logger.info(`Loaded ${this.policies.size} escalation policies`);
  }
  
  async escalate(alert: Alert): Promise<void> {
    try {
      const alertId = alert.id || `${alert.ruleId}-${alert.timestamp.getTime()}`;
      
      // Check if alert has been acknowledged
      if (this.isAcknowledged(alertId)) {
        logger.debug(`Alert ${alertId} acknowledged, skipping escalation`);
        return;
      }
      
      // Get escalation policy
      const policy = this.policies.get(alert.severity);
      if (!policy) {
        logger.warn(`No escalation policy for severity: ${alert.severity}`);
        return;
      }
      
      // Calculate time since alert fired
      const timeSinceAlert = Date.now() - alert.timestamp.getTime();
      
      // Determine which levels to escalate to
      for (const level of policy.levels) {
        if (timeSinceAlert >= level.waitTime) {
          // Check if already escalated to this level
          if (!this.hasEscalatedToLevel(alertId, level.name)) {
            await this.escalateToLevel(alert, level);
          }
        }
      }
    } catch (error) {
      logger.error('Escalation failed:', error);
      throw error;
    }
  }
  
  private async escalateToLevel(alert: Alert, level: EscalationLevel): Promise<void> {
    const alertId = alert.id || `${alert.ruleId}-${alert.timestamp.getTime()}`;
    
    logger.warn(`Escalating alert ${alertId} to ${level.name}`);
    
    // Send notifications to all contacts in this level
    for (const contact of level.contacts) {
      try {
        await this.sendEscalationNotification(alert, level, contact);
      } catch (error) {
        logger.error(`Failed to send escalation to ${contact.recipient}:`, error);
      }
    }
    
    // Record escalation
    this.recordEscalation(alertId, level.name);
  }
  
  private async sendEscalationNotification(
    alert: Alert,
    level: EscalationLevel,
    contact: { channel: string; recipient: string }
  ): Promise<void> {
    const message = this.formatEscalationMessage(alert, level);
    
    // In production, this would use NotificationManager
    logger.info(`Sending escalation via ${contact.channel} to ${contact.recipient}`);
    logger.debug(`Escalation message: ${message}`);
  }
  
  private formatEscalationMessage(alert: Alert, level: EscalationLevel): string {
    return `
🚨 ESCALATED ALERT - ${level.name}

Alert: ${alert.ruleName}
Severity: ${alert.severity.toUpperCase()}
Current Value: ${alert.value}
Threshold: ${alert.threshold}
Message: ${alert.message}
Time First Triggered: ${alert.timestamp.toISOString()}

⚠️ This alert has not been acknowledged and is being escalated.
Please investigate immediately.
    `.trim();
  }
  
  acknowledge(alertId: string): void {
    this.acknowledged.add(alertId);
    logger.info(`Alert ${alertId} acknowledged`);
  }
  
  isAcknowledged(alertId: string): boolean {
    return this.acknowledged.has(alertId);
  }
  
  private hasEscalatedToLevel(alertId: string, levelName: string): boolean {
    const levels = this.escalations.get(alertId) || [];
    return levels.includes(levelName);
  }
  
  private recordEscalation(alertId: string, levelName: string): void {
    const levels = this.escalations.get(alertId) || [];
    levels.push(levelName);
    this.escalations.set(alertId, levels);
    
    logger.info(`Recorded escalation for alert ${alertId} to ${levelName}`);
  }
  
  getEscalationHistory(alertId: string): string[] {
    return this.escalations.get(alertId) || [];
  }
  
  clearEscalation(alertId: string): void {
    this.escalations.delete(alertId);
    this.acknowledged.delete(alertId);
    logger.debug(`Cleared escalation history for alert ${alertId}`);
  }
}
