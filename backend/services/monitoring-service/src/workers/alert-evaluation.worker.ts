import { logger } from '../logger';
import { RuleEngine } from '../alerting/rules/rule.engine';
import { AlertManager } from '../alerting/alert.manager';

interface Alert {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export class AlertEvaluationWorker {
  private interval: NodeJS.Timeout | null = null;
  private ruleEngine: RuleEngine;
  private alertManager: AlertManager;
  private cooldowns: Map<string, number> = new Map();

  constructor() {
    this.ruleEngine = new RuleEngine();
    this.alertManager = new AlertManager();
  }

  async start(): Promise<void> {
    logger.info('Starting Alert Evaluation Worker...');

    try {
      // Evaluate immediately
      await this.evaluate();

      // Then evaluate every 60 seconds
      this.interval = setInterval(async () => {
        try {
          await this.evaluate();
        } catch (error) {
          logger.error('Alert evaluation cycle failed:', error);
        }
      }, 60000);

      logger.info('Alert Evaluation Worker started successfully');
    } catch (error) {
      logger.error('Failed to start Alert Evaluation Worker:', error);
      throw error;
    }
  }

  private async evaluate(): Promise<void> {
    try {
      // Get all active rules
      const rules = this.ruleEngine.getAllRules();

      logger.debug(`Evaluating ${rules.length} alert rules...`);

      for (const rule of rules) {
        try {
          // Rule evaluation would happen here
          // For now, just log
          logger.debug(`Evaluating rule: ${rule.name}`);
        } catch (error) {
          logger.error(`Failed to evaluate rule ${rule.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Alert evaluation failed:', error);
      throw error;
    }
  }

  private isInCooldown(ruleId: string, cooldownMinutes: number): boolean {
    const lastFired = this.cooldowns.get(ruleId);
    if (!lastFired) return false;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = Date.now();

    return (now - lastFired) < cooldownMs;
  }

  private recordCooldown(ruleId: string, cooldownMinutes: number): void {
    this.cooldowns.set(ruleId, Date.now());

    // Clean up old cooldowns after they expire
    setTimeout(() => {
      this.cooldowns.delete(ruleId);
    }, cooldownMinutes * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('Alert Evaluation Worker stopped');
  }
}
