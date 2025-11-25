import { logger } from '../../logger';
import { defaultRules } from '../default-rules';

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  channels: string[];
  cooldown: number;
  message: string;
  enabled: boolean;
}

export class RuleEngine {
  private rules: Map<string, AlertRule> = new Map();
  
  async loadRules(): Promise<void> {
    try {
      logger.info('Loading alert rules...');
      
      // Load default rules from default-rules.ts
      for (const rule of defaultRules.rules) {
        this.rules.set(rule.id, rule);
      }
      
      logger.info(`Loaded ${this.rules.size} alert rules`);
    } catch (error) {
      logger.error('Failed to load alert rules:', error);
      throw error;
    }
  }
  
  getRules(): AlertRule[] {
    return Array.from(this.rules.values()).filter(rule => rule.enabled);
  }
  
  getRule(id: string): AlertRule | undefined {
    return this.rules.get(id);
  }
  
  addRule(rule: AlertRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, rule);
    logger.info(`Added alert rule: ${rule.name}`);
  }
  
  updateRule(id: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }
    
    const updatedRule = { ...rule, ...updates };
    this.validateRule(updatedRule);
    this.rules.set(id, updatedRule);
    logger.info(`Updated alert rule: ${id}`);
  }
  
  deleteRule(id: string): void {
    this.rules.delete(id);
    logger.info(`Deleted alert rule: ${id}`);
  }
  
  private validateRule(rule: AlertRule): void {
    if (!rule.id) throw new Error('Rule ID is required');
    if (!rule.name) throw new Error('Rule name is required');
    if (!rule.metric) throw new Error('Rule metric is required');
    if (!rule.operator) throw new Error('Rule operator is required');
    if (rule.threshold === undefined) throw new Error('Rule threshold is required');
    if (!rule.severity) throw new Error('Rule severity is required');
    if (!Array.isArray(rule.channels) || rule.channels.length === 0) {
      throw new Error('Rule must have at least one notification channel');
    }
    
    // Validate operator
    const validOperators = ['>', '<', '>=', '<=', '==', '!='];
    if (!validOperators.includes(rule.operator)) {
      throw new Error(`Invalid operator: ${rule.operator}`);
    }
    
    // Validate severity
    const validSeverities = ['info', 'warning', 'error', 'critical'];
    if (!validSeverities.includes(rule.severity)) {
      throw new Error(`Invalid severity: ${rule.severity}`);
    }
  }
}
