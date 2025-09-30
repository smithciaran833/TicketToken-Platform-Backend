import { AlertManager } from './alert.manager';
import { RuleEngine } from './rules/rule.engine';
import { NotificationManager } from './channels/notification.manager';
import { EscalationManager } from './escalation/escalation.manager';
import { logger } from '../utils/logger';
import { config } from '../config';

let alertManager: AlertManager;
let ruleEngine: RuleEngine;
let notificationManager: NotificationManager;
let escalationManager: EscalationManager;
let evaluationInterval: NodeJS.Timeout;

export async function initializeAlertingSystem() {
  try {
    logger.info('Initializing alerting system...');
    
    // Initialize components
    notificationManager = new NotificationManager();
    escalationManager = new EscalationManager();
    ruleEngine = new RuleEngine();
    alertManager = new AlertManager(notificationManager, escalationManager);
    
    // Load alert rules
    await ruleEngine.loadRules();
    
    // Start alert evaluation
    evaluationInterval = setInterval(async () => {
      await evaluateAlerts();
    }, config.intervals.alertEvaluation);
    
    logger.info('Alerting system initialized');
  } catch (error) {
    logger.error('Failed to initialize alerting system:', error);
    throw error;
  }
}

async function evaluateAlerts() {
  try {
    const alerts = await ruleEngine.evaluate();
    for (const alert of alerts) {
      await alertManager.processAlert(alert);
    }
  } catch (error) {
    logger.error('Error evaluating alerts:', error);
  }
}

export async function stopAlertingSystem() {
  if (evaluationInterval) {
    clearInterval(evaluationInterval);
  }
}

export { alertManager, ruleEngine, notificationManager, escalationManager };
