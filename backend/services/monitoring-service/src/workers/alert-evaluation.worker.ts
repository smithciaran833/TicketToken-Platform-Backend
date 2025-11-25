import { logger } from '../logger';
import { RuleEngine } from '../alerting/rules/rule.engine';
import { AlertManager } from '../alerting/alert.manager';
import { metricsCollector } from '../metrics.collector';

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
      // Load alert rules
      await this.ruleEngine.loadRules();
      
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
      const rules = this.ruleEngine.getRules();
      
      logger.debug(`Evaluating ${rules.length} alert rules...`);
      
      for (const rule of rules) {
        try {
          // Evaluate rule condition
          const triggered = await this.evaluateRule(rule);
          
          if (triggered) {
            // Check cooldown period
            if (this.isInCooldown(rule.id, rule.cooldown)) {
              logger.debug(`Rule ${rule.id} triggered but in cooldown period`);
              continue;
            }
            
            // Create alert
            const alert: Alert = {
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              message: rule.message,
              value: triggered.value,
              threshold: rule.threshold,
              timestamp: new Date()
            };
            
            logger.warn(`Alert triggered: ${rule.name}`, { alert });
            
            // Send alert
            await this.alertManager.sendNotification(alert);
            
            // Record cooldown
            this.recordCooldown(rule.id, rule.cooldown);
            
            // Update metrics
            metricsCollector.alertsFired.inc({
              rule: rule.name,
              severity: rule.severity
            });
          }
        } catch (error) {
          logger.error(`Failed to evaluate rule ${rule.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Alert evaluation failed:', error);
      throw error;
    }
  }
  
  private async evaluateRule(rule: any): Promise<{ value: number } | null> {
    // This is a simplified implementation
    // In reality, you'd query actual metrics from InfluxDB or Prometheus
    
    // For now, we'll use the metrics collector's current values
    try {
      let value: number;
      
      // Get metric value based on rule configuration
      switch (rule.metric) {
        case 'payment_failure_rate':
          // Calculate from counters
          const successMetric = await metricsCollector.paymentSuccess.get();
          const failureMetric = await metricsCollector.paymentFailure.get();
          
          const totalSuccess = successMetric.values.reduce((sum, v) => sum + v.value, 0);
          const totalFailures = failureMetric.values.reduce((sum, v) => sum + v.value, 0);
          const totalPayments = totalSuccess + totalFailures;
          
          value = totalPayments > 0 ? totalFailures / totalPayments : 0;
          break;
          
        case 'refund_rate':
          // Similar calculation for refunds
          const ticketsSoldMetric = await metricsCollector.ticketsSold.get();
          const refundsMetric = await metricsCollector.refundsProcessed.get();
          
          const totalSold = ticketsSoldMetric.values.reduce((sum, v) => sum + v.value, 0);
          const totalRefunds = refundsMetric.values.reduce((sum, v) => sum + v.value, 0);
          
          value = totalSold > 0 ? totalRefunds / totalSold : 0;
          break;
          
        case 'active_users':
          const activeUsersMetric = await metricsCollector.activeUsers.get();
          value = activeUsersMetric.values.reduce((sum, v) => sum + v.value, 0);
          break;
          
        case 'queue_size':
          const queueSizeMetric = await metricsCollector.queueSize.get();
          value = Math.max(...queueSizeMetric.values.map(v => v.value));
          break;
          
        default:
          logger.warn(`Unknown metric: ${rule.metric}`);
          return null;
      }
      
      // Evaluate condition
      const triggered = this.checkCondition(value, rule.operator, rule.threshold);
      
      return triggered ? { value } : null;
    } catch (error) {
      logger.error(`Error evaluating rule ${rule.id}:`, error);
      return null;
    }
  }
  
  private checkCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      case '==':
        return value === threshold;
      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
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
