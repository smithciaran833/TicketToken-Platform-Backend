/**
 * Treasury Monitoring and Alerting
 * 
 * AUDIT FIX #84: Add treasury monitoring/alerting hooks
 * 
 * Features:
 * - Track treasury balance over time
 * - Record outgoing transactions
 * - Alert on anomalies (low balance, rapid drain, large tx)
 * - Prometheus metrics integration
 * - Optional webhook callback for external alerting
 */

import { logger } from './logger';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };

// =============================================================================
// CONFIGURATION
// =============================================================================

// Alert thresholds (in SOL)
const ALERT_THRESHOLDS = {
  // Balance alerts
  BALANCE_WARNING_SOL: parseFloat(process.env.TREASURY_BALANCE_WARNING || '1'),
  BALANCE_CRITICAL_SOL: parseFloat(process.env.TREASURY_BALANCE_CRITICAL || '0.1'),
  
  // Transaction alerts
  LARGE_TX_WARNING_SOL: parseFloat(process.env.TREASURY_LARGE_TX_WARNING || '0.5'),
  
  // Rapid drain alert (SOL drained in time window)
  RAPID_DRAIN_SOL: parseFloat(process.env.TREASURY_RAPID_DRAIN_SOL || '2'),
  RAPID_DRAIN_WINDOW_MS: parseInt(process.env.TREASURY_RAPID_DRAIN_WINDOW_MS || '3600000', 10) // 1 hour
};

// Retention period for transaction history
const TX_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Webhook URL for external alerting
const ALERT_WEBHOOK_URL = process.env.TREASURY_ALERT_WEBHOOK_URL;

// =============================================================================
// TYPES
// =============================================================================

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export enum AlertType {
  BALANCE_LOW = 'BALANCE_LOW',
  BALANCE_CRITICAL = 'BALANCE_CRITICAL',
  LARGE_TRANSACTION = 'LARGE_TRANSACTION',
  RAPID_DRAIN = 'RAPID_DRAIN',
  NEW_RECIPIENT = 'NEW_RECIPIENT',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  WHITELIST_REJECTED = 'WHITELIST_REJECTED'
}

export interface TreasuryAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  data?: Record<string, any>;
  acknowledged: boolean;
}

export interface TreasuryTransaction {
  signature: string;
  amount: number; // in SOL
  destination: string;
  timestamp: number;
  type: 'mint' | 'transfer' | 'fee' | 'other';
  status: 'pending' | 'confirmed' | 'failed';
}

export interface TreasuryState {
  balance: number; // in SOL
  lastUpdated: number;
  address: string;
}

// =============================================================================
// STATE
// =============================================================================

// In-memory state (would use Redis in production)
let treasuryState: TreasuryState = {
  balance: 0,
  lastUpdated: 0,
  address: ''
};

const transactionHistory: TreasuryTransaction[] = [];
const alerts: TreasuryAlert[] = [];
const knownRecipients = new Set<string>();

// Redis client (optional)
let redisClient: any = null;
const REDIS_PREFIX = 'treasury:';

// =============================================================================
// METRICS
// =============================================================================

interface TreasuryMetrics {
  balanceSol: number;
  transactionsTotal: number;
  transactionsLast24h: number;
  alertsTotal: number;
  alertsUnacknowledged: number;
}

const metrics: TreasuryMetrics = {
  balanceSol: 0,
  transactionsTotal: 0,
  transactionsLast24h: 0,
  alertsTotal: 0,
  alertsUnacknowledged: 0
};

export function getTreasuryMetrics(): TreasuryMetrics {
  // Update 24h transaction count
  const dayAgo = Date.now() - TX_HISTORY_RETENTION_MS;
  metrics.transactionsLast24h = transactionHistory.filter(tx => tx.timestamp > dayAgo).length;
  metrics.alertsUnacknowledged = alerts.filter(a => !a.acknowledged).length;
  
  return { ...metrics };
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize treasury monitor with Redis
 */
export function initializeTreasuryMonitor(redis?: any): void {
  redisClient = redis;
  logger.info('Treasury monitor initialized', {
    alertThresholds: ALERT_THRESHOLDS,
    webhookConfigured: !!ALERT_WEBHOOK_URL
  });
}

/**
 * Set treasury address to monitor
 */
export function setTreasuryAddress(address: string): void {
  treasuryState.address = address;
  logger.info('Treasury address set for monitoring', {
    address: address.slice(0, 8) + '...'
  });
}

// =============================================================================
// BALANCE TRACKING
// =============================================================================

/**
 * Update treasury balance and check for alerts
 */
export async function updateTreasuryBalance(balanceLamports: number): Promise<void> {
  const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
  const previousBalance = treasuryState.balance;
  
  treasuryState.balance = balanceSol;
  treasuryState.lastUpdated = Date.now();
  metrics.balanceSol = balanceSol;
  
  // Store in Redis if available
  if (redisClient) {
    try {
      await redisClient.hset(`${REDIS_PREFIX}state`, {
        balance: balanceSol.toString(),
        lastUpdated: Date.now().toString(),
        address: treasuryState.address
      });
    } catch (error) {
      logger.warn('Failed to store treasury state in Redis', {
        error: (error as Error).message
      });
    }
  }
  
  // Check balance alerts
  if (balanceSol < ALERT_THRESHOLDS.BALANCE_CRITICAL_SOL) {
    await createAlert(
      AlertType.BALANCE_CRITICAL,
      AlertSeverity.CRITICAL,
      `Treasury balance critically low: ${balanceSol.toFixed(4)} SOL`,
      { balance: balanceSol, threshold: ALERT_THRESHOLDS.BALANCE_CRITICAL_SOL }
    );
  } else if (balanceSol < ALERT_THRESHOLDS.BALANCE_WARNING_SOL) {
    await createAlert(
      AlertType.BALANCE_LOW,
      AlertSeverity.WARNING,
      `Treasury balance low: ${balanceSol.toFixed(4)} SOL`,
      { balance: balanceSol, threshold: ALERT_THRESHOLDS.BALANCE_WARNING_SOL }
    );
  }
  
  // Check rapid drain
  await checkRapidDrain(previousBalance, balanceSol);
  
  logger.debug('Treasury balance updated', {
    balance: balanceSol.toFixed(4),
    previousBalance: previousBalance.toFixed(4)
  });
}

// =============================================================================
// TRANSACTION TRACKING
// =============================================================================

/**
 * Record an outgoing treasury transaction
 */
export async function recordTransaction(tx: Omit<TreasuryTransaction, 'timestamp'>): Promise<void> {
  const transaction: TreasuryTransaction = {
    ...tx,
    timestamp: Date.now()
  };
  
  // Add to history
  transactionHistory.push(transaction);
  metrics.transactionsTotal++;
  
  // Clean up old transactions
  cleanupOldTransactions();
  
  // Store in Redis if available
  if (redisClient) {
    try {
      await redisClient.lpush(
        `${REDIS_PREFIX}transactions`,
        JSON.stringify(transaction)
      );
      await redisClient.ltrim(`${REDIS_PREFIX}transactions`, 0, 999); // Keep last 1000
    } catch (error) {
      logger.warn('Failed to store transaction in Redis', {
        error: (error as Error).message
      });
    }
  }
  
  // Check for large transaction
  if (tx.amount > ALERT_THRESHOLDS.LARGE_TX_WARNING_SOL) {
    await createAlert(
      AlertType.LARGE_TRANSACTION,
      AlertSeverity.WARNING,
      `Large treasury transaction: ${tx.amount.toFixed(4)} SOL to ${tx.destination.slice(0, 8)}...`,
      { amount: tx.amount, destination: tx.destination, signature: tx.signature }
    );
  }
  
  // Check for new recipient
  if (!knownRecipients.has(tx.destination)) {
    knownRecipients.add(tx.destination);
    await createAlert(
      AlertType.NEW_RECIPIENT,
      AlertSeverity.INFO,
      `Treasury transaction to new recipient: ${tx.destination.slice(0, 8)}...`,
      { destination: tx.destination, amount: tx.amount }
    );
  }
  
  logger.info('Treasury transaction recorded', {
    signature: tx.signature.slice(0, 16) + '...',
    amount: tx.amount.toFixed(4),
    destination: tx.destination.slice(0, 8) + '...',
    type: tx.type
  });
}

/**
 * Check for rapid drain condition
 */
async function checkRapidDrain(previousBalance: number, currentBalance: number): Promise<void> {
  const windowStart = Date.now() - ALERT_THRESHOLDS.RAPID_DRAIN_WINDOW_MS;
  const recentTransactions = transactionHistory.filter(tx => tx.timestamp > windowStart);
  
  const totalDrained = recentTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  if (totalDrained > ALERT_THRESHOLDS.RAPID_DRAIN_SOL) {
    await createAlert(
      AlertType.RAPID_DRAIN,
      AlertSeverity.CRITICAL,
      `Rapid treasury drain detected: ${totalDrained.toFixed(4)} SOL in last hour`,
      {
        totalDrained,
        transactionCount: recentTransactions.length,
        windowMs: ALERT_THRESHOLDS.RAPID_DRAIN_WINDOW_MS
      }
    );
  }
}

/**
 * Clean up old transactions
 */
function cleanupOldTransactions(): void {
  const cutoff = Date.now() - TX_HISTORY_RETENTION_MS;
  
  while (transactionHistory.length > 0 && transactionHistory[0].timestamp < cutoff) {
    transactionHistory.shift();
  }
}

// =============================================================================
// ALERTS
// =============================================================================

/**
 * Create and dispatch an alert
 */
async function createAlert(
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  data?: Record<string, any>
): Promise<TreasuryAlert> {
  // Check for duplicate recent alerts
  const recentDuplicates = alerts.filter(
    a => a.type === type && Date.now() - a.timestamp < 5 * 60 * 1000 // 5 minutes
  );
  
  if (recentDuplicates.length > 0) {
    logger.debug('Suppressing duplicate alert', { type, severity });
    return recentDuplicates[0];
  }
  
  const alert: TreasuryAlert = {
    id: `${type}-${Date.now()}`,
    type,
    severity,
    message,
    timestamp: Date.now(),
    data,
    acknowledged: false
  };
  
  alerts.push(alert);
  metrics.alertsTotal++;
  
  // Keep only last 100 alerts
  while (alerts.length > 100) {
    alerts.shift();
  }
  
  // Log at appropriate level
  switch (severity) {
    case AlertSeverity.CRITICAL:
      logger.error(`TREASURY ALERT [CRITICAL]: ${message}`, { alert });
      break;
    case AlertSeverity.WARNING:
      logger.warn(`TREASURY ALERT [WARNING]: ${message}`, { alert });
      break;
    default:
      logger.info(`TREASURY ALERT [INFO]: ${message}`, { alert });
  }
  
  // Send webhook if configured
  if (ALERT_WEBHOOK_URL) {
    await sendWebhookAlert(alert);
  }
  
  // Store in Redis if available
  if (redisClient) {
    try {
      await redisClient.lpush(`${REDIS_PREFIX}alerts`, JSON.stringify(alert));
      await redisClient.ltrim(`${REDIS_PREFIX}alerts`, 0, 99);
    } catch (error) {
      logger.warn('Failed to store alert in Redis', {
        error: (error as Error).message
      });
    }
  }
  
  return alert;
}

/**
 * Send alert via webhook
 */
async function sendWebhookAlert(alert: TreasuryAlert): Promise<void> {
  if (!ALERT_WEBHOOK_URL) return;
  
  try {
    const response = await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'blockchain-service',
        component: 'treasury-monitor',
        alert
      })
    });
    
    if (!response.ok) {
      logger.warn('Webhook alert failed', {
        status: response.status,
        alertType: alert.type
      });
    }
  } catch (error) {
    logger.warn('Failed to send webhook alert', {
      error: (error as Error).message,
      alertType: alert.type
    });
  }
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get current treasury alerts
 */
export function getTreasuryAlerts(options?: {
  severity?: AlertSeverity;
  unacknowledgedOnly?: boolean;
  limit?: number;
}): TreasuryAlert[] {
  let result = [...alerts];
  
  if (options?.severity) {
    result = result.filter(a => a.severity === options.severity);
  }
  
  if (options?.unacknowledgedOnly) {
    result = result.filter(a => !a.acknowledged);
  }
  
  result.sort((a, b) => b.timestamp - a.timestamp);
  
  if (options?.limit) {
    result = result.slice(0, options.limit);
  }
  
  return result;
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = alerts.find(a => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
    logger.info('Alert acknowledged', { alertId });
    return true;
  }
  return false;
}

/**
 * Get treasury state
 */
export function getTreasuryState(): TreasuryState {
  return { ...treasuryState };
}

/**
 * Get transaction history
 */
export function getTransactionHistory(limit: number = 100): TreasuryTransaction[] {
  return transactionHistory
    .slice(-limit)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Create alert manually (for external use)
 */
export async function createManualAlert(
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  data?: Record<string, any>
): Promise<TreasuryAlert> {
  return createAlert(type, severity, message, data);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ALERT_THRESHOLDS };
