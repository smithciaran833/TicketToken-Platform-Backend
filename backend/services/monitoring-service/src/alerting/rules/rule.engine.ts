import { logger } from '../../logger';

interface Rule {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: string[];
  enabled: boolean;
}

export class RuleEngine {
  private rules: Map<string, Rule> = new Map();

  constructor() {
    this.loadDefaultRules();
  }

  private loadDefaultRules(): void {
    // Default rules would be defined here
    logger.info('Loaded default alert rules');
  }

  getRule(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  addRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getAllRules(): Rule[] {
    return Array.from(this.rules.values());
  }
}
