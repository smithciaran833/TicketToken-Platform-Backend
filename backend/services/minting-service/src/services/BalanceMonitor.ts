import { Connection, PublicKey } from '@solana/web3.js';
import { getConnection, getWallet } from '../config/solana';
import { checkWalletBalance, formatSOL } from '../utils/solana';
import logger from '../utils/logger';

export class BalanceMonitor {
  private connection: Connection | null = null;
  private wallet: PublicKey | null = null;
  private minBalance: number;
  private checkInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private lastAlertTime: number = 0;
  private alertCooldown: number = 3600000; // 1 hour

  constructor() {
    this.minBalance = parseFloat(process.env.MIN_SOL_BALANCE || '0.1');
    this.checkInterval = parseInt(process.env.BALANCE_CHECK_INTERVAL || '300000'); // 5 minutes default
  }

  /**
   * Start monitoring wallet balance
   */
  start(): void {
    try {
      this.connection = getConnection();
      this.wallet = getWallet().publicKey;

      logger.info('Starting balance monitor', {
        wallet: this.wallet.toString(),
        minBalance: this.minBalance,
        checkInterval: this.checkInterval
      });

      // Check immediately
      this.checkBalance();

      // Then check periodically
      this.intervalId = setInterval(() => {
        this.checkBalance();
      }, this.checkInterval);

      logger.info('Balance monitor started');
    } catch (error) {
      logger.error('Failed to start balance monitor', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Balance monitor stopped');
    }
  }

  /**
   * Check wallet balance and alert if low
   */
  private async checkBalance(): Promise<void> {
    if (!this.connection || !this.wallet) {
      logger.warn('Balance monitor not initialized');
      return;
    }

    try {
      const result = await checkWalletBalance(
        this.connection,
        this.wallet,
        this.minBalance
      );

      logger.debug('Balance check completed', {
        balance: result.balance,
        sufficient: result.sufficient,
        minRequired: this.minBalance
      });

      if (!result.sufficient) {
        this.alertLowBalance(result.balance);
      }
    } catch (error) {
      logger.error('Balance check failed', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Alert about low balance (with cooldown to prevent spam)
   */
  private alertLowBalance(currentBalance: number): void {
    const now = Date.now();

    // Only alert once per hour to avoid spam
    if (now - this.lastAlertTime < this.alertCooldown) {
      return;
    }

    this.lastAlertTime = now;

    logger.warn('⚠️ LOW WALLET BALANCE ALERT', {
      wallet: this.wallet?.toString(),
      currentBalance,
      minRequired: this.minBalance,
      deficit: this.minBalance - currentBalance,
      severity: 'HIGH',
      action: 'Fund wallet immediately to continue minting operations'
    });

    // In production, this should also:
    // 1. Send alert to monitoring service (PagerDuty, OpsGenie, etc.)
    // 2. Send email/SMS to ops team
    // 3. Create incident ticket
    // 4. Update status dashboard

    // For now, just log prominently
    console.error('═══════════════════════════════════════════');
    console.error('⚠️  CRITICAL: LOW WALLET BALANCE');
    console.error('═══════════════════════════════════════════');
    console.error(`Wallet:   ${this.wallet?.toString()}`);
    console.error(`Balance:  ${currentBalance} SOL`);
    console.error(`Required: ${this.minBalance} SOL`);
    console.error(`Deficit:  ${(this.minBalance - currentBalance).toFixed(4)} SOL`);
    console.error('');
    console.error('Action required: Fund the wallet immediately!');
    console.error('Devnet: https://faucet.solana.com');
    console.error('═══════════════════════════════════════════');
  }

  /**
   * Get current balance on demand
   */
  async getCurrentBalance(): Promise<number | null> {
    if (!this.connection || !this.wallet) {
      return null;
    }

    try {
      const result = await checkWalletBalance(
        this.connection,
        this.wallet,
        this.minBalance
      );
      return result.balance;
    } catch (error) {
      logger.error('Failed to get current balance', {
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Check if balance is sufficient right now
   */
  async isBalanceSufficient(): Promise<boolean> {
    if (!this.connection || !this.wallet) {
      return false;
    }

    try {
      const result = await checkWalletBalance(
        this.connection,
        this.wallet,
        this.minBalance
      );
      return result.sufficient;
    } catch (error) {
      logger.error('Failed to check balance sufficiency', {
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Get balance status for health checks
   */
  async getBalanceStatus(): Promise<{
    balance: number | null;
    sufficient: boolean;
    minRequired: number;
    lastCheck: Date;
  }> {
    const balance = await this.getCurrentBalance();
    const sufficient = balance !== null && balance >= this.minBalance;

    return {
      balance,
      sufficient,
      minRequired: this.minBalance,
      lastCheck: new Date()
    };
  }
}

// Singleton instance
let balanceMonitor: BalanceMonitor | null = null;

/**
 * Get or create balance monitor instance
 */
export function getBalanceMonitor(): BalanceMonitor {
  if (!balanceMonitor) {
    balanceMonitor = new BalanceMonitor();
  }
  return balanceMonitor;
}

/**
 * Start balance monitoring
 */
export function startBalanceMonitoring(): void {
  const monitor = getBalanceMonitor();
  monitor.start();
}

/**
 * Stop balance monitoring
 */
export function stopBalanceMonitoring(): void {
  if (balanceMonitor) {
    balanceMonitor.stop();
  }
}
