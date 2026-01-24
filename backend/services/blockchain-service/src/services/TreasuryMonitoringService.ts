import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import config from '../config';

/**
 * TREASURY MONITORING SERVICE
 *
 * Phase 1: Custodial Wallet Foundation
 *
 * Monitors treasury wallet balances and sends alerts when:
 * - Balance falls below alert threshold (default: 0.5 SOL)
 * - Balance falls below critical threshold (default: 0.1 SOL)
 * - Balance recovers above threshold
 *
 * Thresholds (configurable via env):
 * - TREASURY_ALERT_THRESHOLD_SOL: 0.5 SOL (sends warning)
 * - TREASURY_CRITICAL_THRESHOLD_SOL: 0.1 SOL (sends critical alert)
 * - TREASURY_TARGET_BALANCE_SOL: 2.0 SOL (ideal balance)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TreasuryWallet {
  id: string;
  walletAddress: string;
  blockchainType: string;
  purpose: string;
  isActive: boolean;
  balance: number;
  lastBalanceUpdate: Date | null;
  tenantId: string;
}

export interface BalanceCheckResult {
  walletId: string;
  walletAddress: string;
  balance: number;
  alertThreshold: number;
  isBelowThreshold: boolean;
  isCritical: boolean;
  status: 'healthy' | 'warning' | 'critical';
}

export interface MonitoringStats {
  totalWallets: number;
  healthyWallets: number;
  warningWallets: number;
  criticalWallets: number;
  totalBalanceSol: number;
  lastCheckedAt: Date;
}

// =============================================================================
// CONFIG
// =============================================================================

const TREASURY_CONFIG = {
  // Default thresholds (can be overridden via env)
  alertThresholdSol: parseFloat(process.env.TREASURY_ALERT_THRESHOLD_SOL || '0.5'),
  criticalThresholdSol: parseFloat(process.env.TREASURY_CRITICAL_THRESHOLD_SOL || '0.1'),
  targetBalanceSol: parseFloat(process.env.TREASURY_TARGET_BALANCE_SOL || '2.0'),

  // Monitoring interval
  checkIntervalMs: parseInt(process.env.TREASURY_CHECK_INTERVAL_MS || '60000', 10), // 1 minute

  // Alert cooldown (don't spam alerts)
  alertCooldownMs: parseInt(process.env.TREASURY_ALERT_COOLDOWN_MS || '3600000', 10), // 1 hour
};

// =============================================================================
// SERVICE
// =============================================================================

export class TreasuryMonitoringService {
  private pool: Pool;
  private connection: Connection;
  private isRunning: boolean = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  // Alert handlers (can be set externally)
  public onWarningAlert?: (result: BalanceCheckResult) => Promise<void>;
  public onCriticalAlert?: (result: BalanceCheckResult) => Promise<void>;
  public onRecoveryAlert?: (result: BalanceCheckResult) => Promise<void>;

  constructor(pool: Pool, connection: Connection) {
    this.pool = pool;
    this.connection = connection;

    logger.info('TreasuryMonitoringService initialized', {
      alertThreshold: TREASURY_CONFIG.alertThresholdSol,
      criticalThreshold: TREASURY_CONFIG.criticalThresholdSol,
      targetBalance: TREASURY_CONFIG.targetBalanceSol,
      checkInterval: TREASURY_CONFIG.checkIntervalMs
    });
  }

  // ===========================================================================
  // MONITORING LIFECYCLE
  // ===========================================================================

  /**
   * Start continuous monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Treasury monitoring already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting treasury monitoring');

    // Run initial check
    this.checkAllTreasuries().catch(err => {
      logger.error('Initial treasury check failed', { error: err.message });
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAllTreasuries();
      } catch (err: any) {
        logger.error('Treasury check failed', { error: err.message });
      }
    }, TREASURY_CONFIG.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('Treasury monitoring stopped');
  }

  // ===========================================================================
  // BALANCE CHECKING
  // ===========================================================================

  /**
   * Check all active treasury wallets
   */
  async checkAllTreasuries(): Promise<MonitoringStats> {
    const client = await this.pool.connect();
    try {
      // Use system access for cross-tenant query
      await client.query(`SELECT set_config('app.is_system_user', 'true', true)`);

      // Get all active treasury wallets
      const result = await client.query(
        `SELECT * FROM treasury_wallets WHERE is_active = true`
      );

      const stats: MonitoringStats = {
        totalWallets: result.rows.length,
        healthyWallets: 0,
        warningWallets: 0,
        criticalWallets: 0,
        totalBalanceSol: 0,
        lastCheckedAt: new Date()
      };

      for (const row of result.rows) {
        const checkResult = await this.checkTreasuryBalance(row.wallet_address);
        stats.totalBalanceSol += checkResult.balance;

        // Update database
        await this.updateTreasuryBalance(row.id, checkResult);

        // Track stats
        switch (checkResult.status) {
          case 'healthy':
            stats.healthyWallets++;
            break;
          case 'warning':
            stats.warningWallets++;
            break;
          case 'critical':
            stats.criticalWallets++;
            break;
        }

        // Send alerts if needed
        await this.processAlerts(row.id, checkResult);
      }

      logger.info('Treasury check completed', {
        total: stats.totalWallets,
        healthy: stats.healthyWallets,
        warning: stats.warningWallets,
        critical: stats.criticalWallets,
        totalBalance: stats.totalBalanceSol.toFixed(4)
      });

      return stats;
    } finally {
      client.release();
    }
  }

  /**
   * Check a single treasury wallet balance
   */
  async checkTreasuryBalance(walletAddress: string): Promise<BalanceCheckResult> {
    const pubkey = new PublicKey(walletAddress);
    const balanceLamports = await this.connection.getBalance(pubkey);
    const balance = balanceLamports / LAMPORTS_PER_SOL;

    const isCritical = balance < TREASURY_CONFIG.criticalThresholdSol;
    const isBelowThreshold = balance < TREASURY_CONFIG.alertThresholdSol;

    let status: 'healthy' | 'warning' | 'critical';
    if (isCritical) {
      status = 'critical';
    } else if (isBelowThreshold) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    return {
      walletId: '', // Will be set by caller
      walletAddress,
      balance,
      alertThreshold: TREASURY_CONFIG.alertThresholdSol,
      isBelowThreshold,
      isCritical,
      status
    };
  }

  /**
   * Update treasury balance in database
   */
  private async updateTreasuryBalance(
    walletId: string,
    checkResult: BalanceCheckResult
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.is_system_user', 'true', true)`);

      await client.query(
        `UPDATE treasury_wallets
         SET balance = $1, last_balance_update = NOW()
         WHERE id = $2`,
        [checkResult.balance, walletId]
      );
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // ALERTING
  // ===========================================================================

  /**
   * Process alerts based on balance check result
   */
  private async processAlerts(
    walletId: string,
    checkResult: BalanceCheckResult
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.is_system_user', 'true', true)`);

      // Get the last monitoring log for this wallet
      const lastLogResult = await client.query(
        `SELECT * FROM treasury_monitoring_logs
         WHERE treasury_wallet_id = $1
         ORDER BY checked_at DESC
         LIMIT 1`,
        [walletId]
      );

      const lastLog = lastLogResult.rows[0];
      const wasHealthy = !lastLog || !lastLog.is_below_threshold;
      const isNowUnhealthy = checkResult.isBelowThreshold;

      // Determine if we should send an alert
      let alertType: string | null = null;
      let shouldSendAlert = false;

      if (isNowUnhealthy && wasHealthy) {
        // Just became unhealthy
        alertType = checkResult.isCritical ? 'critical' : 'low_balance';
        shouldSendAlert = true;
      } else if (!isNowUnhealthy && !wasHealthy) {
        // Just recovered
        alertType = 'recovered';
        shouldSendAlert = true;
      } else if (isNowUnhealthy && lastLog) {
        // Still unhealthy - check cooldown
        const lastAlertTime = lastLog.alert_sent_at ? new Date(lastLog.alert_sent_at).getTime() : 0;
        const cooldownExpired = Date.now() - lastAlertTime > TREASURY_CONFIG.alertCooldownMs;

        if (cooldownExpired) {
          alertType = checkResult.isCritical ? 'critical' : 'low_balance';
          shouldSendAlert = true;
        }
      }

      // Log the check
      await client.query(
        `INSERT INTO treasury_monitoring_logs (
          treasury_wallet_id, balance_sol, previous_balance_sol, alert_threshold_sol,
          is_below_threshold, alert_sent, alert_sent_at, alert_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          walletId,
          checkResult.balance,
          lastLog?.balance_sol || null,
          TREASURY_CONFIG.alertThresholdSol,
          checkResult.isBelowThreshold,
          shouldSendAlert,
          shouldSendAlert ? new Date() : null,
          alertType
        ]
      );

      // Send alerts via handlers
      if (shouldSendAlert) {
        checkResult.walletId = walletId;

        if (checkResult.isCritical && this.onCriticalAlert) {
          await this.onCriticalAlert(checkResult);
        } else if (checkResult.isBelowThreshold && this.onWarningAlert) {
          await this.onWarningAlert(checkResult);
        } else if (alertType === 'recovered' && this.onRecoveryAlert) {
          await this.onRecoveryAlert(checkResult);
        }

        logger.warn('Treasury alert sent', {
          walletId,
          walletAddress: checkResult.walletAddress,
          balance: checkResult.balance,
          alertType,
          threshold: TREASURY_CONFIG.alertThresholdSol
        });
      }
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // TREASURY MANAGEMENT
  // ===========================================================================

  /**
   * Get all treasury wallets with their current status
   */
  async getTreasuryStatus(): Promise<TreasuryWallet[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.is_system_user', 'true', true)`);

      const result = await client.query(
        `SELECT * FROM treasury_wallets WHERE is_active = true ORDER BY created_at`
      );

      return result.rows.map(row => ({
        id: row.id,
        walletAddress: row.wallet_address,
        blockchainType: row.blockchain_type,
        purpose: row.purpose,
        isActive: row.is_active,
        balance: parseFloat(row.balance || '0'),
        lastBalanceUpdate: row.last_balance_update,
        tenantId: row.tenant_id
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Register a new treasury wallet for monitoring
   */
  async registerTreasury(
    walletAddress: string,
    purpose: string,
    tenantId: string
  ): Promise<TreasuryWallet> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // Check initial balance
      const balance = await this.checkTreasuryBalance(walletAddress);

      const result = await client.query(
        `INSERT INTO treasury_wallets (
          wallet_address, blockchain_type, purpose, is_active, balance, last_balance_update, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        RETURNING *`,
        [walletAddress, 'SOLANA', purpose, true, balance.balance, tenantId]
      );

      logger.info('Treasury wallet registered', {
        walletAddress,
        purpose,
        tenantId,
        initialBalance: balance.balance
      });

      return {
        id: result.rows[0].id,
        walletAddress: result.rows[0].wallet_address,
        blockchainType: result.rows[0].blockchain_type,
        purpose: result.rows[0].purpose,
        isActive: result.rows[0].is_active,
        balance: parseFloat(result.rows[0].balance || '0'),
        lastBalanceUpdate: result.rows[0].last_balance_update,
        tenantId: result.rows[0].tenant_id
      };
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate a treasury wallet (stops monitoring)
   */
  async deactivateTreasury(walletId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.is_system_user', 'true', true)`);

      await client.query(
        `UPDATE treasury_wallets SET is_active = false WHERE id = $1`,
        [walletId]
      );

      logger.info('Treasury wallet deactivated', { walletId });
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Get current monitoring health
   */
  getHealth(): { isRunning: boolean; config: typeof TREASURY_CONFIG } {
    return {
      isRunning: this.isRunning,
      config: TREASURY_CONFIG
    };
  }
}
