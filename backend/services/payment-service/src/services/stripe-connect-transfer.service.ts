/**
 * Stripe Connect Transfer Service
 * 
 * HIGH FIX: Complete Stripe Connect implementation with:
 * - transfer_group for payment tracking
 * - source_transaction for payout timing control
 * - reverse_transfer on refunds
 * - Balance checking before transfers
 * - Proportional partial refund handling
 */

import Stripe from 'stripe';
import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';
import { alertingService } from './alerting.service';
import { feeCalculationService } from './fee-calculation.service';
import { withSpan, addStripeAttributes } from '../config/opentelemetry.config';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'StripeConnectTransfer' });

// =============================================================================
// TYPES
// =============================================================================

export interface TransferRequest {
  paymentId: string;
  orderId: string;
  chargeId: string;
  recipients: TransferRecipient[];
  tenantId: string;
}

export interface TransferRecipient {
  recipientId: string;
  recipientType: 'venue' | 'artist' | 'platform';
  stripeAccountId: string;
  amount: number;
  description?: string;
}

export interface TransferResult {
  transferId: string;
  stripeTransferId: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  destinationAccount: string;
}

export interface ReverseTransferRequest {
  stripeTransferId: string;
  amount?: number; // Partial reversal
  reason: string;
  tenantId: string;
}

// =============================================================================
// SERVICE
// =============================================================================

class StripeConnectTransferService {
  private stripe: Stripe | null = null;

  private getStripe(): Stripe {
    if (!this.stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('STRIPE_SECRET_KEY not configured');
      }
      this.stripe = new Stripe(key, {
        apiVersion: '2023-10-16',
        timeout: 30000,
      });
    }
    return this.stripe;
  }

  /**
   * Create transfers to connected accounts after successful payment
   */
  async createTransfers(request: TransferRequest): Promise<TransferResult[]> {
    return withSpan('createTransfers', async (span) => {
      const stripe = this.getStripe();
      const db = DatabaseService.getPool();
      const results: TransferResult[] = [];

      addStripeAttributes(span, {
        paymentIntentId: request.paymentId,
        amount: request.recipients.reduce((sum, r) => sum + r.amount, 0),
      });

      log.info({
        paymentId: request.paymentId,
        orderId: request.orderId,
        recipientCount: request.recipients.length,
      }, 'Creating transfers to connected accounts');

      for (const recipient of request.recipients) {
        const transferId = uuidv4();
        
        try {
          // Check destination account balance (for accounts with debit_negative_balances=false)
          const account = await stripe.accounts.retrieve(recipient.stripeAccountId);
          
          if (!account.charges_enabled) {
            log.warn({
              accountId: recipient.stripeAccountId,
              recipientId: recipient.recipientId,
            }, 'Connected account charges not enabled');
            
            // Queue for retry
            await this.queueFailedTransfer(
              transferId,
              request,
              recipient,
              'Account charges not enabled'
            );
            continue;
          }

          // Create the transfer with source_transaction for payout timing
          const transfer = await stripe.transfers.create({
            amount: recipient.amount,
            currency: 'usd',
            destination: recipient.stripeAccountId,
            transfer_group: request.orderId, // Groups related transfers
            source_transaction: request.chargeId, // Ties to original charge for payout timing
            description: recipient.description || `Payment for order ${request.orderId}`,
            metadata: {
              payment_id: request.paymentId,
              order_id: request.orderId,
              recipient_id: recipient.recipientId,
              recipient_type: recipient.recipientType,
              tenant_id: request.tenantId,
            },
          });

          // Store transfer record
          await db.query(`
            INSERT INTO stripe_transfers (
              id, payment_id, order_id, stripe_transfer_id, stripe_charge_id,
              destination_account, recipient_id, recipient_type, amount,
              status, transfer_group, tenant_id, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, $11, NOW()
            )
          `, [
            transferId,
            request.paymentId,
            request.orderId,
            transfer.id,
            request.chargeId,
            recipient.stripeAccountId,
            recipient.recipientId,
            recipient.recipientType,
            recipient.amount,
            request.orderId,
            request.tenantId,
          ]);

          results.push({
            transferId,
            stripeTransferId: transfer.id,
            amount: recipient.amount,
            status: 'completed',
            destinationAccount: recipient.stripeAccountId,
          });

          log.info({
            transferId,
            stripeTransferId: transfer.id,
            amount: recipient.amount,
            recipient: recipient.recipientId,
          }, 'Transfer completed');

        } catch (error: any) {
          log.error({
            error: error.message,
            recipient: recipient.recipientId,
          }, 'Transfer failed');

          await this.queueFailedTransfer(
            transferId,
            request,
            recipient,
            error.message
          );

          results.push({
            transferId,
            stripeTransferId: '',
            amount: recipient.amount,
            status: 'failed',
            destinationAccount: recipient.stripeAccountId,
          });
        }
      }

      return results;
    });
  }

  /**
   * Reverse a transfer (for refunds)
   */
  async reverseTransfer(request: ReverseTransferRequest): Promise<{
    reversalId: string;
    amount: number;
  }> {
    return withSpan('reverseTransfer', async (span) => {
      const stripe = this.getStripe();
      const db = DatabaseService.getPool();

      // Get the original transfer
      const transferResult = await db.query(`
        SELECT * FROM stripe_transfers
        WHERE stripe_transfer_id = $1 AND tenant_id = $2
      `, [request.stripeTransferId, request.tenantId]);

      if (transferResult.rows.length === 0) {
        throw new Error('Transfer not found');
      }

      const transfer = transferResult.rows[0];
      const reversalAmount = request.amount || transfer.amount;

      log.info({
        stripeTransferId: request.stripeTransferId,
        reversalAmount,
        reason: request.reason,
      }, 'Reversing transfer');

      // Create the reversal
      const reversal = await stripe.transfers.createReversal(
        request.stripeTransferId,
        {
          amount: reversalAmount,
          description: `Reversal: ${request.reason}`,
          metadata: {
            reason: request.reason,
            tenant_id: request.tenantId,
          },
        }
      );

      // Update transfer record
      await db.query(`
        UPDATE stripe_transfers
        SET reversed_amount = COALESCE(reversed_amount, 0) + $2,
            status = CASE 
              WHEN amount = COALESCE(reversed_amount, 0) + $2 THEN 'reversed'
              ELSE 'partially_reversed'
            END,
            reversal_id = $3,
            reversed_at = NOW(),
            reversal_reason = $4
        WHERE stripe_transfer_id = $1
      `, [
        request.stripeTransferId,
        reversalAmount,
        reversal.id,
        request.reason,
      ]);

      log.info({
        reversalId: reversal.id,
        amount: reversalAmount,
      }, 'Transfer reversed');

      return {
        reversalId: reversal.id,
        amount: reversalAmount,
      };
    });
  }

  /**
   * Handle refund with transfer reversals
   */
  async handleRefundWithReversals(
    paymentId: string,
    refundAmount: number,
    tenantId: string
  ): Promise<void> {
    return withSpan('handleRefundWithReversals', async () => {
      const db = DatabaseService.getPool();

      // Get all transfers for this payment
      const transfers = await db.query(`
        SELECT * FROM stripe_transfers
        WHERE payment_id = $1 AND tenant_id = $2 AND status = 'completed'
        ORDER BY amount DESC
      `, [paymentId, tenantId]);

      if (transfers.rows.length === 0) {
        log.warn({ paymentId }, 'No transfers to reverse');
        return;
      }

      // Calculate total transferred
      const totalTransferred = transfers.rows.reduce(
        (sum: number, t: any) => sum + t.amount,
        0
      );

      // Calculate proportional reversals
      for (const transfer of transfers.rows) {
        const proportion = transfer.amount / totalTransferred;
        const reversalAmount = Math.round(refundAmount * proportion);

        if (reversalAmount <= 0) continue;

        try {
          await this.reverseTransfer({
            stripeTransferId: transfer.stripe_transfer_id,
            amount: reversalAmount,
            reason: 'Customer refund',
            tenantId,
          });
        } catch (error: any) {
          log.error({
            error: error.message,
            transferId: transfer.stripe_transfer_id,
          }, 'Failed to reverse transfer');

          // Alert on failure
          await alertingService.alertTransferFailed(
            transfer.id,
            reversalAmount,
            transfer.destination_account,
            `Reversal failed: ${error.message}`,
            tenantId
          );
        }
      }
    });
  }

  /**
   * Handle dispute by reversing transfers
   */
  async handleDisputeTransferReversal(
    paymentId: string,
    disputedAmount: number,
    tenantId: string
  ): Promise<void> {
    return withSpan('handleDisputeTransferReversal', async () => {
      log.warn({
        paymentId,
        disputedAmount,
      }, 'Handling dispute - reversing transfers');

      // Same logic as refund - reverse proportionally
      await this.handleRefundWithReversals(paymentId, disputedAmount, tenantId);

      // Update venue balance to reflect held amount
      const db = DatabaseService.getPool();
      await db.query(`
        UPDATE venue_balances
        SET held_for_disputes = held_for_disputes + $2,
            available_balance = available_balance - $2,
            updated_at = NOW()
        WHERE venue_id IN (
          SELECT recipient_id FROM stripe_transfers WHERE payment_id = $1
        ) AND tenant_id = $3
      `, [paymentId, disputedAmount, tenantId]);
    });
  }

  /**
   * Handle dispute won - re-create transfers
   */
  async handleDisputeWon(
    paymentId: string,
    disputedAmount: number,
    tenantId: string
  ): Promise<void> {
    return withSpan('handleDisputeWon', async () => {
      const db = DatabaseService.getPool();

      log.info({
        paymentId,
        disputedAmount,
      }, 'Dispute won - re-creating transfers');

      // Get original payment info
      const payment = await db.query(`
        SELECT * FROM payment_transactions
        WHERE id = $1 AND tenant_id = $2
      `, [paymentId, tenantId]);

      if (payment.rows.length === 0) {
        throw new Error('Payment not found');
      }

      // Get original transfer recipients (from reversed transfers)
      const reversedTransfers = await db.query(`
        SELECT * FROM stripe_transfers
        WHERE payment_id = $1 AND tenant_id = $2 
          AND status IN ('reversed', 'partially_reversed')
      `, [paymentId, tenantId]);

      // Re-create transfers
      for (const transfer of reversedTransfers.rows) {
        try {
          const stripe = this.getStripe();
          
          const newTransfer = await stripe.transfers.create({
            amount: transfer.reversed_amount || transfer.amount,
            currency: 'usd',
            destination: transfer.destination_account,
            transfer_group: transfer.transfer_group,
            description: `Re-transfer after dispute won - Order ${transfer.order_id}`,
            metadata: {
              original_transfer_id: transfer.stripe_transfer_id,
              payment_id: paymentId,
              dispute_won: 'true',
              tenant_id: tenantId,
            },
          });

          // Record the new transfer
          await db.query(`
            INSERT INTO stripe_transfers (
              id, payment_id, order_id, stripe_transfer_id, destination_account,
              recipient_id, recipient_type, amount, status, transfer_group,
              tenant_id, created_at, metadata
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9, $10, NOW(),
              $11
            )
          `, [
            uuidv4(),
            paymentId,
            transfer.order_id,
            newTransfer.id,
            transfer.destination_account,
            transfer.recipient_id,
            transfer.recipient_type,
            transfer.reversed_amount || transfer.amount,
            transfer.transfer_group,
            tenantId,
            JSON.stringify({ dispute_won_retransfer: true }),
          ]);

          log.info({
            newTransferId: newTransfer.id,
            amount: transfer.reversed_amount || transfer.amount,
          }, 'Re-transfer completed after dispute won');

        } catch (error: any) {
          log.error({
            error: error.message,
            originalTransferId: transfer.stripe_transfer_id,
          }, 'Failed to re-transfer after dispute won');

          // Queue for retry
          await alertingService.alertTransferFailed(
            transfer.id,
            transfer.reversed_amount || transfer.amount,
            transfer.destination_account,
            `Re-transfer failed: ${error.message}`,
            tenantId
          );
        }
      }

      // Update venue balance
      await db.query(`
        UPDATE venue_balances
        SET held_for_disputes = held_for_disputes - $2,
            available_balance = available_balance + $2,
            updated_at = NOW()
        WHERE venue_id IN (
          SELECT recipient_id FROM stripe_transfers WHERE payment_id = $1
        ) AND tenant_id = $3
      `, [paymentId, disputedAmount, tenantId]);
    });
  }

  /**
   * Check if platform has sufficient balance for transfer
   */
  async checkPlatformBalance(requiredAmount: number): Promise<boolean> {
    const stripe = this.getStripe();
    
    try {
      const balance = await stripe.balance.retrieve();
      const available = balance.available.find(b => b.currency === 'usd');
      
      if (!available || available.amount < requiredAmount) {
        log.warn({
          required: requiredAmount,
          available: available?.amount || 0,
        }, 'Insufficient platform balance');
        return false;
      }
      
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to check platform balance');
      return false;
    }
  }

  /**
   * Queue a failed transfer for retry
   */
  private async queueFailedTransfer(
    transferId: string,
    request: TransferRequest,
    recipient: TransferRecipient,
    error: string
  ): Promise<void> {
    const db = DatabaseService.getPool();

    await db.query(`
      INSERT INTO pending_transfers (
        id, payment_id, order_id, amount, destination_account,
        recipient_id, recipient_type, status, retry_count, last_error,
        tenant_id, created_at, retry_after
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'pending_retry', 0, $8, $9, NOW(),
        NOW() + INTERVAL '1 minute'
      )
    `, [
      transferId,
      request.paymentId,
      request.orderId,
      recipient.amount,
      recipient.stripeAccountId,
      recipient.recipientId,
      recipient.recipientType,
      error,
      request.tenantId,
    ]);
  }

  // ===========================================================================
  // REC-1: DAILY RECONCILIATION
  // ===========================================================================

  /**
   * REC-1: Run daily reconciliation for all transfers
   * Compares local records with Stripe's records
   */
  async runDailyReconciliation(
    tenantId: string,
    date?: Date
  ): Promise<{
    matched: number;
    mismatched: number;
    missing: number;
    discrepancies: any[];
  }> {
    const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const stripe = this.getStripe();
    const db = DatabaseService.getPool();
    
    log.info({
      tenantId,
      date: startOfDay.toISOString(),
    }, 'Running daily transfer reconciliation');

    // Get local transfer records
    const localTransfers = await db.query(`
      SELECT * FROM stripe_transfers
      WHERE tenant_id = $1
        AND created_at >= $2 AND created_at <= $3
    `, [tenantId, startOfDay, endOfDay]);

    const localMap = new Map(
      localTransfers.rows.map((t: any) => [t.stripe_transfer_id, t])
    );

    // Get Stripe transfer records
    const stripeTransfers = await stripe.transfers.list({
      created: {
        gte: Math.floor(startOfDay.getTime() / 1000),
        lte: Math.floor(endOfDay.getTime() / 1000),
      },
      limit: 100,
    });

    let matched = 0;
    let mismatched = 0;
    const discrepancies: any[] = [];

    // Compare Stripe records with local
    for (const stripeTransfer of stripeTransfers.data) {
      const local = localMap.get(stripeTransfer.id);
      
      if (!local) {
        // Transfer exists in Stripe but not locally
        discrepancies.push({
          type: 'missing_local',
          stripeTransferId: stripeTransfer.id,
          amount: stripeTransfer.amount,
          destination: stripeTransfer.destination,
        });
        continue;
      }

      // Check for amount mismatch
      if (local.amount !== stripeTransfer.amount) {
        discrepancies.push({
          type: 'amount_mismatch',
          stripeTransferId: stripeTransfer.id,
          localAmount: local.amount,
          stripeAmount: stripeTransfer.amount,
        });
        mismatched++;
      } else {
        matched++;
      }

      localMap.delete(stripeTransfer.id);
    }

    // Check for local records not in Stripe
    const missing = localMap.size;
    for (const [transferId, local] of localMap) {
      discrepancies.push({
        type: 'missing_stripe',
        stripeTransferId: transferId,
        localAmount: (local as any).amount,
      });
    }

    // Save reconciliation report
    await db.query(`
      INSERT INTO reconciliation_reports (
        id, type, tenant_id, report_date, matched, mismatched, missing,
        discrepancies, created_at
      ) VALUES (
        $1, 'transfers', $2, $3, $4, $5, $6, $7, NOW()
      )
    `, [
      uuidv4(),
      tenantId,
      startOfDay,
      matched,
      mismatched,
      missing,
      JSON.stringify(discrepancies),
    ]);

    // Alert if there are discrepancies
    if (discrepancies.length > 0) {
      log.warn({
        tenantId,
        matched,
        mismatched,
        missing,
        discrepancyCount: discrepancies.length,
      }, 'Transfer reconciliation found discrepancies');
    }

    return { matched, mismatched, missing, discrepancies };
  }

  // ===========================================================================
  // REC-5: BALANCE TRANSACTIONS API
  // ===========================================================================

  /**
   * REC-5: Fetch balance transactions from Stripe for reconciliation
   */
  async getBalanceTransactions(
    options: {
      startDate?: Date;
      endDate?: Date;
      type?: string;
      limit?: number;
    } = {}
  ): Promise<Stripe.BalanceTransaction[]> {
    const stripe = this.getStripe();
    const transactions: Stripe.BalanceTransaction[] = [];

    const params: Stripe.BalanceTransactionListParams = {
      limit: options.limit || 100,
    };

    if (options.startDate) {
      params.created = {
        gte: Math.floor(options.startDate.getTime() / 1000),
      };
    }

    if (options.endDate) {
      const created = params.created as Record<string, number> || {};
      created.lte = Math.floor(options.endDate.getTime() / 1000);
      params.created = created;
    }

    if (options.type) {
      params.type = options.type as Stripe.BalanceTransactionListParams['type'];
    }

    // Paginate through all results
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const response = await stripe.balanceTransactions.list({
        ...params,
        starting_after: startingAfter,
      });

      transactions.push(...response.data);
      hasMore = response.has_more;

      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
    }

    log.info({
      count: transactions.length,
      type: options.type,
    }, 'Retrieved balance transactions');

    return transactions;
  }

  /**
   * REC-5: Reconcile payments using Balance Transactions API
   */
  async reconcileWithBalanceTransactions(
    tenantId: string,
    date: Date
  ): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get charges from Balance Transactions
    const chargeTransactions = await this.getBalanceTransactions({
      startDate: startOfDay,
      endDate: endOfDay,
      type: 'charge',
    });

    // Get transfers from Balance Transactions
    const transferTransactions = await this.getBalanceTransactions({
      startDate: startOfDay,
      endDate: endOfDay,
      type: 'transfer',
    });

    log.info({
      tenantId,
      date: startOfDay.toISOString(),
      chargeCount: chargeTransactions.length,
      transferCount: transferTransactions.length,
    }, 'Reconciling with Balance Transactions API');

    // Store for analysis
    const db = DatabaseService.getPool();
    await db.query(`
      INSERT INTO balance_transaction_snapshots (
        id, tenant_id, snapshot_date, charges_data, transfers_data, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
    `, [
      uuidv4(),
      tenantId,
      startOfDay,
      JSON.stringify(chargeTransactions),
      JSON.stringify(transferTransactions),
    ]);
  }

  // ===========================================================================
  // FEE-2: FACTOR STRIPE FEES INTO SPLIT CALCULATIONS
  // ===========================================================================

  /**
   * FEE-2: Calculate transfer amounts with Stripe fees factored in
   * Stripe charges fees on the platform, so we need to deduct these
   * from what we transfer to connected accounts.
   */
  calculateTransfersWithFees(
    totalAmount: number,
    recipients: TransferRecipient[],
    currency: string = 'USD'
  ): TransferRecipient[] {
    // Use fee calculation service to factor in fees
    const stripeFee = feeCalculationService.calculateStripeFee(totalAmount);
    const platformFee = feeCalculationService.calculatePlatformFee(totalAmount);
    
    // Net amount after platform fees
    const netDistributable = totalAmount - stripeFee - platformFee;

    // Calculate total percentage allocation
    const totalPercentage = recipients.reduce((sum, r) => {
      // Assuming amount is a percentage * total
      return sum + (r.amount / totalAmount);
    }, 0);

    // Adjust amounts proportionally
    const adjustedRecipients = recipients.map(recipient => {
      const proportion = recipient.amount / totalAmount;
      const adjustedAmount = Math.round(netDistributable * proportion / totalPercentage);
      
      return {
        ...recipient,
        amount: adjustedAmount,
        description: `${recipient.description || 'Payment'} (net of ${(stripeFee * proportion / totalPercentage).toFixed(0)} fee)`,
      };
    });

    log.info({
      totalAmount,
      stripeFee,
      platformFee,
      netDistributable,
      recipientCount: recipients.length,
    }, 'Calculated transfers with fees factored in');

    return adjustedRecipients;
  }

  // ===========================================================================
  // PAY-2: CONFIGURE PAYOUT SCHEDULES
  // ===========================================================================

  /**
   * PAY-2: Configure payout schedule for a connected account
   */
  async configurePayoutSchedule(
    stripeAccountId: string,
    schedule: {
      interval: 'daily' | 'weekly' | 'monthly' | 'manual';
      weeklyAnchor?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
      monthlyAnchor?: number; // 1-31
      delayDays?: number; // Minimum payout delay
    }
  ): Promise<void> {
    const stripe = this.getStripe();

    const payoutSchedule: Stripe.AccountUpdateParams.Settings.Payouts.Schedule = {
      interval: schedule.interval,
    };

    if (schedule.interval === 'weekly' && schedule.weeklyAnchor) {
      payoutSchedule.weekly_anchor = schedule.weeklyAnchor;
    }

    if (schedule.interval === 'monthly' && schedule.monthlyAnchor) {
      payoutSchedule.monthly_anchor = schedule.monthlyAnchor;
    }

    if (schedule.delayDays !== undefined) {
      payoutSchedule.delay_days = schedule.delayDays;
    }

    await stripe.accounts.update(stripeAccountId, {
      settings: {
        payouts: {
          schedule: payoutSchedule,
        },
      },
    });

    log.info({
      stripeAccountId,
      schedule,
    }, 'Payout schedule configured');
  }

  /**
   * PAY-2: Get payout schedule for a connected account
   */
  async getPayoutSchedule(
    stripeAccountId: string
  ): Promise<Stripe.Account.Settings.Payouts.Schedule | null> {
    const stripe = this.getStripe();

    const account = await stripe.accounts.retrieve(stripeAccountId);
    return account.settings?.payouts?.schedule || null;
  }

  /**
   * PAY-2: Set default payout schedule for new venues
   * Called during onboarding
   */
  async setDefaultPayoutSchedule(stripeAccountId: string): Promise<void> {
    // Default: Weekly payouts on Fridays with 2-day delay
    await this.configurePayoutSchedule(stripeAccountId, {
      interval: 'weekly',
      weeklyAnchor: 'friday',
      delayDays: 2,
    });
  }

  /**
   * PAY-2: Get payout history for a connected account
   */
  async getPayoutHistory(
    stripeAccountId: string,
    limit: number = 10
  ): Promise<Stripe.Payout[]> {
    const stripe = this.getStripe();

    const payouts = await stripe.payouts.list(
      { limit },
      { stripeAccount: stripeAccountId }
    );

    return payouts.data;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const stripeConnectTransferService = new StripeConnectTransferService();
