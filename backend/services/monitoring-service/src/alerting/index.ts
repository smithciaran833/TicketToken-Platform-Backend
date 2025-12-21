import { AlertManager } from './alert.manager';
import { RuleEngine } from './rules/rule.engine';
import { NotificationManager } from './channels/notification.manager';
import { logger } from '../logger';

let alertManager: AlertManager | null = null;
let ruleEngine: RuleEngine | null = null;
let notificationManager: NotificationManager | null = null;

export function initializeAlerting(): void {
  try {
    logger.info('Initializing alerting system');
    
    notificationManager = new NotificationManager();
    ruleEngine = new RuleEngine();
    alertManager = new AlertManager();
    
    logger.info('Alerting system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize alerting system:', error);
    throw error;
  }
}

export async function evaluateRules(): Promise<void> {
  if (!ruleEngine) {
    throw new Error('Alerting system not initialized');
  }
  
  try {
    // Rule evaluation logic would go here
    // For now, just log
    logger.debug('Evaluating alert rules');
  } catch (error) {
    logger.error('Failed to evaluate rules:', error);
    throw error;
  }
}

export function getAlertManager(): AlertManager {
  if (!alertManager) {
    throw new Error('Alerting system not initialized');
  }
  return alertManager;
}

export function getRuleEngine(): RuleEngine {
  if (!ruleEngine) {
    throw new Error('Alerting system not initialized');
  }
  return ruleEngine;
}
