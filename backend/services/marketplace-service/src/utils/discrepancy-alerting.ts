/**
 * Discrepancy Alerting for Marketplace Service
 * 
 * Issues Fixed:
 * - PAY-2: No discrepancy alerting → Auto-detection of payment/transfer mismatches
 * - PAY-H4: Fee calculation gaps → Monitoring of fee totals
 * 
 * This utility:
 * 1. Detects payment amount vs listing price mismatches
 * 2. Monitors fee calculation discrepancies
 * 3. Alerts on suspicious patterns
 * 4. Creates audit trail for all discrepancies
 */

import knex from '../config/database';
import { logger } from './logger';
import { getCurrentRequestId } from '../middleware/request-id';
import { registry, MetricNames } from './metrics';

const log = logger.child({ component: 'DiscrepancyAlerting' });

// Configuration
const DISCREPANCY_THRESHOLD_CENTS = parseInt(process.env.DISCREPANCY_THRESHOLD_CENTS || '1', 10);
const ALERT_WEBHOOK_URL = process.env.DISCREPANCY_ALERT_WEBHOOK_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_DISCREPANCY_WEBHOOK_URL;

// Discrepancy types
export enum DiscrepancyType {
  PRICE_MISMATCH = 'price_mismatch',
  FEE_CALCULATION = 'fee_calculation',
  DUPLICATE_CHARGE = 'duplicate_charge',
  MISSING_PAYMENT = 'missing_payment',
  ORPHAN_TRANSFER = 'orphan_transfer',
  OVERPAYMENT = 'overpayment',
  UNDERPAYMENT = 'underpayment',
  REFUND_AMOUNT = 'refund_amount'
}

// Alert severity levels
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface DiscrepancyAlert {
  type: DiscrepancyType;
  severity: AlertSeverity;
  description: string;
  expectedValue?: number;
  actualValue?: number;
  difference?: number;
  metadata?: Record<string, any>;
  transferId?: string;
  listingId?: string;
  paymentId?: string;
  userId?: string;
}

interface DiscrepancyCheckResult {
  hasDiscrepancy: boolean;
  alerts: DiscrepancyAlert[];
}

/**
 * AUDIT FIX PAY-2: Check for price/payment discrepancies
 */
export async function checkPaymentDiscrepancy(
  listingId: string,
  paymentAmount: number,
  transferId?: string
): Promise<DiscrepancyCheckResult> {
  const alerts: DiscrepancyAlert[] = [];
  const requestId = getCurrentRequestId();

  try {
    // Get listing details
    const listing = await knex('listings')
      .where('id', listingId)
      .first();

    if (!listing) {
      log.warn('Listing not found for discrepancy check', { listingId, requestId });
      return { hasDiscrepancy: false, alerts: [] };
    }

    const expectedTotal = listing.price + (listing.platform_fee || 0) + (listing.seller_fee || 0);
    const difference = Math.abs(paymentAmount - expectedTotal);

    // Check if payment matches expected total
    if (difference > DISCREPANCY_THRESHOLD_CENTS) {
      const severity = getSeverityForAmount(difference);
      const alert: DiscrepancyAlert = {
        type: paymentAmount > expectedTotal ? DiscrepancyType.OVERPAYMENT : DiscrepancyType.UNDERPAYMENT,
        severity,
        description: `Payment amount ${paymentAmount} differs from expected ${expectedTotal}`,
        expectedValue: expectedTotal,
        actualValue: paymentAmount,
        difference,
        listingId,
        transferId,
        metadata: {
          listingPrice: listing.price,
          platformFee: listing.platform_fee,
          sellerFee: listing.seller_fee
        }
      };

      alerts.push(alert);
      await recordDiscrepancy(alert);
    }

    return { hasDiscrepancy: alerts.length > 0, alerts };
  } catch (error: any) {
    log.error('Error checking payment discrepancy', {
      listingId,
      paymentAmount,
      error: error.message,
      requestId
    });
    return { hasDiscrepancy: false, alerts: [] };
  }
}

/**
 * AUDIT FIX PAY-2: Check fee calculation accuracy
 */
export async function checkFeeDiscrepancy(
  listingPrice: number,
  platformFee: number,
  sellerFee: number,
  expectedPlatformFeeRate: number = 0.025, // 2.5% default
  expectedSellerFeeRate: number = 0
): Promise<DiscrepancyCheckResult> {
  const alerts: DiscrepancyAlert[] = [];
  const requestId = getCurrentRequestId();

  // Calculate expected fees
  const expectedPlatformFee = Math.round(listingPrice * expectedPlatformFeeRate);
  const expectedSellerFee = Math.round(listingPrice * expectedSellerFeeRate);

  // Check platform fee
  const platformFeeDiff = Math.abs(platformFee - expectedPlatformFee);
  if (platformFeeDiff > DISCREPANCY_THRESHOLD_CENTS) {
    const alert: DiscrepancyAlert = {
      type: DiscrepancyType.FEE_CALCULATION,
      severity: getSeverityForAmount(platformFeeDiff),
      description: `Platform fee ${platformFee} differs from expected ${expectedPlatformFee}`,
      expectedValue: expectedPlatformFee,
      actualValue: platformFee,
      difference: platformFeeDiff,
      metadata: {
        listingPrice,
        expectedRate: expectedPlatformFeeRate,
        feeType: 'platform'
      }
    };
    alerts.push(alert);
    await recordDiscrepancy(alert);
  }

  // Check seller fee
  const sellerFeeDiff = Math.abs(sellerFee - expectedSellerFee);
  if (sellerFeeDiff > DISCREPANCY_THRESHOLD_CENTS) {
    const alert: DiscrepancyAlert = {
      type: DiscrepancyType.FEE_CALCULATION,
      severity: getSeverityForAmount(sellerFeeDiff),
      description: `Seller fee ${sellerFee} differs from expected ${expectedSellerFee}`,
      expectedValue: expectedSellerFee,
      actualValue: sellerFee,
      difference: sellerFeeDiff,
      metadata: {
        listingPrice,
        expectedRate: expectedSellerFeeRate,
        feeType: 'seller'
      }
    };
    alerts.push(alert);
    await recordDiscrepancy(alert);
  }

  return { hasDiscrepancy: alerts.length > 0, alerts };
}

/**
 * AUDIT FIX PAY-2: Check for duplicate charges
 */
export async function checkDuplicateCharge(
  userId: string,
  listingId: string,
  paymentAmount: number,
  timeWindowMinutes: number = 5
): Promise<DiscrepancyCheckResult> {
  const alerts: DiscrepancyAlert[] = [];
  const requestId = getCurrentRequestId();

  try {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeWindowMinutes);

    // Look for recent transfers with same user, listing, and amount
    const recentTransfers = await knex('transfers')
      .where('buyer_id', userId)
      .where('listing_id', listingId)
      .where('total_amount', paymentAmount)
      .where('created_at', '>=', cutoffTime)
      .where('status', 'completed');

    if (recentTransfers.length > 1) {
      const alert: DiscrepancyAlert = {
        type: DiscrepancyType.DUPLICATE_CHARGE,
        severity: AlertSeverity.HIGH,
        description: `Potential duplicate charge: ${recentTransfers.length} transfers found in ${timeWindowMinutes} minutes`,
        userId,
        listingId,
        actualValue: paymentAmount,
        metadata: {
          transferCount: recentTransfers.length,
          transferIds: recentTransfers.map((t: any) => t.id),
          timeWindowMinutes
        }
      };
      alerts.push(alert);
      await recordDiscrepancy(alert);
    }

    return { hasDiscrepancy: alerts.length > 0, alerts };
  } catch (error: any) {
    log.error('Error checking duplicate charge', {
      userId,
      listingId,
      error: error.message,
      requestId
    });
    return { hasDiscrepancy: false, alerts: [] };
  }
}

/**
 * AUDIT FIX PAY-2: Run daily reconciliation check
 */
export async function runDailyReconciliation(date?: Date): Promise<{
  totalTransfers: number;
  totalDiscrepancies: number;
  alerts: DiscrepancyAlert[];
}> {
  const targetDate = date || new Date();
  targetDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(targetDate);
  endDate.setDate(endDate.getDate() + 1);

  const requestId = `reconciliation-${targetDate.toISOString().split('T')[0]}`;
  const alerts: DiscrepancyAlert[] = [];

  log.info('Starting daily reconciliation', { date: targetDate, requestId });

  try {
    // Get all completed transfers for the day
    const transfers = await knex('transfers')
      .where('status', 'completed')
      .where('created_at', '>=', targetDate)
      .where('created_at', '<', endDate);

    for (const transfer of transfers) {
      // Check each transfer for discrepancies
      const result = await checkPaymentDiscrepancy(
        transfer.listing_id,
        transfer.total_amount,
        transfer.id
      );
      
      if (result.hasDiscrepancy) {
        alerts.push(...result.alerts);
      }
    }

    // Check for orphan transfers (no corresponding payment)
    const orphanTransfers = await knex('transfers')
      .whereNull('stripe_payment_intent_id')
      .where('status', 'completed')
      .where('created_at', '>=', targetDate)
      .where('created_at', '<', endDate);

    for (const transfer of orphanTransfers) {
      const alert: DiscrepancyAlert = {
        type: DiscrepancyType.ORPHAN_TRANSFER,
        severity: AlertSeverity.CRITICAL,
        description: `Completed transfer without payment reference`,
        transferId: transfer.id,
        listingId: transfer.listing_id,
        actualValue: transfer.total_amount
      };
      alerts.push(alert);
      await recordDiscrepancy(alert);
    }

    log.info('Daily reconciliation completed', {
      totalTransfers: transfers.length,
      totalDiscrepancies: alerts.length,
      requestId
    });

    // Send summary alert if there are discrepancies
    if (alerts.length > 0) {
      await sendAlertNotification({
        type: DiscrepancyType.PRICE_MISMATCH,
        severity: alerts.some(a => a.severity === AlertSeverity.CRITICAL) 
          ? AlertSeverity.CRITICAL 
          : AlertSeverity.HIGH,
        description: `Daily reconciliation found ${alerts.length} discrepancies`,
        metadata: {
          date: targetDate.toISOString(),
          totalTransfers: transfers.length,
          alertCount: alerts.length,
          criticalCount: alerts.filter(a => a.severity === AlertSeverity.CRITICAL).length
        }
      });
    }

    return {
      totalTransfers: transfers.length,
      totalDiscrepancies: alerts.length,
      alerts
    };
  } catch (error: any) {
    log.error('Daily reconciliation failed', {
      error: error.message,
      requestId
    });
    throw error;
  }
}

/**
 * Determine severity based on discrepancy amount
 */
function getSeverityForAmount(amountCents: number): AlertSeverity {
  if (amountCents >= 10000) return AlertSeverity.CRITICAL; // $100+
  if (amountCents >= 1000) return AlertSeverity.HIGH;      // $10+
  if (amountCents >= 100) return AlertSeverity.MEDIUM;     // $1+
  return AlertSeverity.LOW;
}

/**
 * Record discrepancy to database
 */
async function recordDiscrepancy(alert: DiscrepancyAlert): Promise<void> {
  const requestId = getCurrentRequestId();
  
  try {
    await knex('discrepancy_log').insert({
      id: require('crypto').randomUUID(),
      type: alert.type,
      severity: alert.severity,
      description: alert.description,
      expected_value: alert.expectedValue,
      actual_value: alert.actualValue,
      difference: alert.difference,
      transfer_id: alert.transferId,
      listing_id: alert.listingId,
      payment_id: alert.paymentId,
      user_id: alert.userId,
      metadata: JSON.stringify(alert.metadata || {}),
      request_id: requestId,
      created_at: new Date()
    });

    // Update metrics
    registry.incrementCounter('marketplace_discrepancies_total', {
      type: alert.type,
      severity: alert.severity
    });

    log.warn('Discrepancy recorded', {
      type: alert.type,
      severity: alert.severity,
      difference: alert.difference,
      requestId
    });
  } catch (error: any) {
    log.error('Failed to record discrepancy', {
      error: error.message,
      alert
    });
  }
}

/**
 * Send alert notification via webhook
 */
async function sendAlertNotification(alert: DiscrepancyAlert): Promise<void> {
  // Send to configured webhook
  if (ALERT_WEBHOOK_URL) {
    try {
      await fetch(ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...alert,
          timestamp: new Date().toISOString(),
          service: 'marketplace-service'
        })
      });
    } catch (error: any) {
      log.error('Failed to send alert webhook', { error: error.message });
    }
  }

  // Send to Slack if configured
  if (SLACK_WEBHOOK_URL) {
    try {
      const color = {
        [AlertSeverity.CRITICAL]: '#FF0000',
        [AlertSeverity.HIGH]: '#FF6600',
        [AlertSeverity.MEDIUM]: '#FFCC00',
        [AlertSeverity.LOW]: '#00CC00'
      }[alert.severity];

      await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [{
            color,
            title: `🚨 ${alert.severity.toUpperCase()} Discrepancy Alert`,
            text: alert.description,
            fields: [
              { title: 'Type', value: alert.type, short: true },
              { title: 'Severity', value: alert.severity, short: true },
              ...(alert.expectedValue !== undefined ? [{ title: 'Expected', value: `$${(alert.expectedValue / 100).toFixed(2)}`, short: true }] : []),
              ...(alert.actualValue !== undefined ? [{ title: 'Actual', value: `$${(alert.actualValue / 100).toFixed(2)}`, short: true }] : []),
              ...(alert.difference !== undefined ? [{ title: 'Difference', value: `$${(alert.difference / 100).toFixed(2)}`, short: true }] : [])
            ],
            footer: 'Marketplace Service',
            ts: Math.floor(Date.now() / 1000)
          }]
        })
      });
    } catch (error: any) {
      log.error('Failed to send Slack alert', { error: error.message });
    }
  }
}

// Export for use in services and jobs
export const discrepancyAlerting = {
  checkPaymentDiscrepancy,
  checkFeeDiscrepancy,
  checkDuplicateCharge,
  runDailyReconciliation
};
