/**
 * Stripe Connect Webhook Handlers
 * 
 * HIGH FIX: Implements missing webhook handlers for:
 * - transfer.reversed - Handle transfer reversals
 * - payout.failed - Handle failed payouts
 * - charge.dispute.* - Handle disputes
 */

import Stripe from 'stripe';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import {
  getTransactionManager,
  IsolationLevel,
  selectPaymentForUpdate
} from '../utils/database-transaction.util';
import { recordWebhook } from '../routes/metrics.routes';

const log = logger.child({ component: 'StripeConnectHandlers' });

/**
 * SECURITY: Explicit field lists for webhook handler queries.
 */
const STRIPE_TRANSFER_FIELDS = 'id, tenant_id, payment_id, venue_id, amount, status, stripe_transfer_id, reversed_at, reversal_reason, created_at, updated_at';
const CONNECTED_ACCOUNT_FIELDS = 'id, tenant_id, venue_id, stripe_account_id, account_status, charges_enabled, payouts_enabled, created_at, updated_at';

// =============================================================================
// TRANSFER HANDLERS
// =============================================================================

/**
 * Handle transfer.reversed webhook
 * Called when a transfer is reversed (e.g., due to refund or dispute)
 */
export async function handleTransferReversed(event: Stripe.Event): Promise<void> {
  const transfer = event.data.object as Stripe.Transfer;
  
  log.info({
    eventId: event.id,
    transferId: transfer.id,
    amount: transfer.amount,
    destination: transfer.destination,
  }, 'Processing transfer.reversed webhook');

  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Find the transfer record
    // SECURITY: Use explicit field list instead of SELECT *
    const transferResult = await client.query(
      `SELECT ${STRIPE_TRANSFER_FIELDS} FROM stripe_transfers WHERE stripe_transfer_id = $1 FOR UPDATE`,
      [transfer.id]
    );

    if (transferResult.rows.length === 0) {
      log.warn({ transferId: transfer.id }, 'Transfer not found in database');
      await client.query('COMMIT');
      return;
    }

    const transferRecord = transferResult.rows[0];

    // Update transfer status
    await client.query(
      `UPDATE stripe_transfers 
       SET status = 'reversed', 
           reversed_at = NOW(),
           reversal_reason = $1,
           updated_at = NOW()
       WHERE stripe_transfer_id = $2`,
      [transfer.metadata?.reversal_reason || 'reversed', transfer.id]
    );

    // Update venue balance if applicable
    if (transferRecord.venue_id) {
      await client.query(
        `UPDATE venue_balances 
         SET available_balance = available_balance - $1,
             reversed_amount = COALESCE(reversed_amount, 0) + $1,
             updated_at = NOW()
         WHERE venue_id = $2 AND tenant_id = $3`,
        [transfer.amount, transferRecord.venue_id, transferRecord.tenant_id]
      );
    }

    // Create audit record
    await client.query(
      `INSERT INTO payment_audit_log (id, event_type, stripe_event_id, transfer_id, amount, metadata, created_at)
       VALUES (gen_random_uuid(), 'transfer.reversed', $1, $2, $3, $4, NOW())`,
      [event.id, transfer.id, transfer.amount, JSON.stringify({
        destination: transfer.destination,
        reversal_reason: transfer.metadata?.reversal_reason,
      })]
    );

    await client.query('COMMIT');
    
    log.info({ transferId: transfer.id }, 'Transfer reversal processed successfully');
    recordWebhook('transfer.reversed', true);
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ error, transferId: transfer.id }, 'Failed to process transfer reversal');
    recordWebhook('transfer.reversed', false);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle transfer.failed webhook
 * Called when a transfer fails
 */
export async function handleTransferFailed(event: Stripe.Event): Promise<void> {
  const transfer = event.data.object as Stripe.Transfer;
  
  log.info({
    eventId: event.id,
    transferId: transfer.id,
    amount: transfer.amount,
  }, 'Processing transfer.failed webhook');

  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Update transfer status
    await client.query(
      `UPDATE stripe_transfers 
       SET status = 'failed', 
           failed_at = NOW(),
           failure_reason = $1,
           updated_at = NOW()
       WHERE stripe_transfer_id = $2`,
      [(transfer as any).failure_message || 'unknown', transfer.id]
    );

    // Queue for retry if applicable
    await client.query(
      `INSERT INTO pending_transfers (id, stripe_transfer_id, amount, destination_account, status, retry_count, retry_after, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending_retry', 0, NOW() + INTERVAL '1 hour', NOW())
       ON CONFLICT (stripe_transfer_id) 
       DO UPDATE SET status = 'pending_retry', retry_count = pending_transfers.retry_count + 1, retry_after = NOW() + INTERVAL '1 hour'`,
      [transfer.id, transfer.amount, transfer.destination]
    );

    await client.query('COMMIT');
    
    log.info({ transferId: transfer.id }, 'Transfer failure recorded');
    recordWebhook('transfer.failed', true);
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ error, transferId: transfer.id }, 'Failed to process transfer failure');
    recordWebhook('transfer.failed', false);
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// PAYOUT HANDLERS
// =============================================================================

/**
 * Handle payout.failed webhook
 * Called when a payout to a connected account fails
 */
export async function handlePayoutFailed(event: Stripe.Event): Promise<void> {
  const payout = event.data.object as Stripe.Payout;
  const connectedAccountId = event.account;
  
  log.info({
    eventId: event.id,
    payoutId: payout.id,
    amount: payout.amount,
    connectedAccount: connectedAccountId,
    failureCode: payout.failure_code,
  }, 'Processing payout.failed webhook');

  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Find connected account
    // SECURITY: Use explicit field list instead of SELECT *
    const accountResult = await client.query(
      `SELECT ${CONNECTED_ACCOUNT_FIELDS} FROM connected_accounts WHERE stripe_account_id = $1`,
      [connectedAccountId]
    );

    const account = accountResult.rows[0];

    // Record payout failure
    await client.query(
      `INSERT INTO payout_events (id, stripe_account_id, payout_id, event_type, amount, failure_code, failure_message, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'failed', $3, $4, $5, NOW())`,
      [connectedAccountId, payout.id, payout.amount, payout.failure_code, payout.failure_message]
    );

    // Update connected account status if repeated failures
    const failureCount = await client.query(
      `SELECT COUNT(*) as count FROM payout_events 
       WHERE stripe_account_id = $1 AND event_type = 'failed' AND created_at > NOW() - INTERVAL '30 days'`,
      [connectedAccountId]
    );

    if (parseInt(failureCount.rows[0].count) >= 3) {
      await client.query(
        `UPDATE connected_accounts 
         SET payout_status = 'suspended', 
             payout_suspended_reason = 'repeated_failures',
             updated_at = NOW()
         WHERE stripe_account_id = $1`,
        [connectedAccountId]
      );
      
      log.warn({ connectedAccount: connectedAccountId }, 'Suspended payouts due to repeated failures');
    }

    await client.query('COMMIT');
    
    log.info({ payoutId: payout.id }, 'Payout failure processed');
    recordWebhook('payout.failed', true);
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ error, payoutId: payout.id }, 'Failed to process payout failure');
    recordWebhook('payout.failed', false);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle payout.paid webhook
 * Called when a payout is successfully paid
 */
export async function handlePayoutPaid(event: Stripe.Event): Promise<void> {
  const payout = event.data.object as Stripe.Payout;
  const connectedAccountId = event.account;
  
  log.info({
    eventId: event.id,
    payoutId: payout.id,
    amount: payout.amount,
    connectedAccount: connectedAccountId,
  }, 'Processing payout.paid webhook');

  const db = DatabaseService.getPool();
  
  try {
    // Record successful payout
    await db.query(
      `INSERT INTO payout_events (id, stripe_account_id, payout_id, event_type, amount, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'paid', $3, NOW())`,
      [connectedAccountId, payout.id, payout.amount]
    );
    
    log.info({ payoutId: payout.id }, 'Payout success recorded');
    recordWebhook('payout.paid', true);
  } catch (error) {
    log.error({ error, payoutId: payout.id }, 'Failed to record payout success');
    recordWebhook('payout.paid', false);
    throw error;
  }
}

// =============================================================================
// DISPUTE HANDLERS
// =============================================================================

/**
 * Handle charge.dispute.created webhook
 * Called when a customer opens a dispute
 */
export async function handleDisputeCreated(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  
  log.warn({
    eventId: event.id,
    disputeId: dispute.id,
    chargeId: dispute.charge,
    amount: dispute.amount,
    reason: dispute.reason,
  }, 'Processing charge.dispute.created webhook');

  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Find the related payment
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    
    const paymentResult = await client.query(
      `SELECT pt.*, st.id as transfer_id, st.stripe_transfer_id, st.amount as transfer_amount
       FROM payment_transactions pt
       LEFT JOIN stripe_transfers st ON pt.id = st.payment_id
       WHERE pt.stripe_charge_id = $1
       FOR UPDATE OF pt`,
      [chargeId]
    );

    if (paymentResult.rows.length === 0) {
      log.warn({ chargeId }, 'Payment not found for dispute');
      await client.query('COMMIT');
      return;
    }

    const payment = paymentResult.rows[0];

    // Create dispute record
    await client.query(
      `INSERT INTO payment_disputes (id, payment_id, stripe_dispute_id, stripe_charge_id, amount, reason, status, evidence_due_by, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'needs_response', $6, $7, NOW())`,
      [
        payment.id,
        dispute.id,
        chargeId,
        dispute.amount,
        dispute.reason,
        dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : null,
        payment.tenant_id
      ]
    );

    // Update payment status
    await client.query(
      `UPDATE payment_transactions SET status = 'disputed', updated_at = NOW() WHERE id = $1`,
      [payment.id]
    );

    // Reverse any transfers for this payment
    if (payment.transfer_id) {
      await client.query(
        `UPDATE stripe_transfers 
         SET status = 'held_for_dispute', 
             dispute_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [dispute.id, payment.transfer_id]
      );

      // Hold funds from venue balance
      await client.query(
        `UPDATE venue_balances 
         SET available_balance = available_balance - $1,
             held_for_disputes = COALESCE(held_for_disputes, 0) + $1,
             updated_at = NOW()
         WHERE venue_id = (SELECT venue_id FROM stripe_transfers WHERE id = $2)
           AND tenant_id = $3`,
        [payment.transfer_amount, payment.transfer_id, payment.tenant_id]
      );
    }

    await client.query('COMMIT');
    
    log.warn({ disputeId: dispute.id, paymentId: payment.id }, 'Dispute created and funds held');
    recordWebhook('charge.dispute.created', true);
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ error, disputeId: dispute.id }, 'Failed to process dispute creation');
    recordWebhook('charge.dispute.created', false);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle charge.dispute.closed webhook
 * Called when a dispute is closed (won or lost)
 */
export async function handleDisputeClosed(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  
  log.info({
    eventId: event.id,
    disputeId: dispute.id,
    status: dispute.status,
  }, 'Processing charge.dispute.closed webhook');

  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Find dispute record
    const disputeResult = await client.query(
      `SELECT d.*, pt.tenant_id, st.id as transfer_id, st.amount as transfer_amount, st.venue_id
       FROM payment_disputes d
       JOIN payment_transactions pt ON d.payment_id = pt.id
       LEFT JOIN stripe_transfers st ON pt.id = st.payment_id
       WHERE d.stripe_dispute_id = $1
       FOR UPDATE OF d`,
      [dispute.id]
    );

    if (disputeResult.rows.length === 0) {
      log.warn({ disputeId: dispute.id }, 'Dispute record not found');
      await client.query('COMMIT');
      return;
    }

    const disputeRecord = disputeResult.rows[0];
    const won = dispute.status === 'won';

    // Update dispute status
    await client.query(
      `UPDATE payment_disputes 
       SET status = $1, closed_at = NOW(), updated_at = NOW()
       WHERE stripe_dispute_id = $2`,
      [dispute.status, dispute.id]
    );

    // Update payment status
    const newPaymentStatus = won ? 'succeeded' : 'refunded';
    await client.query(
      `UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newPaymentStatus, disputeRecord.payment_id]
    );

    // Handle venue balance
    if (disputeRecord.transfer_id && disputeRecord.venue_id) {
      if (won) {
        // Release held funds back to available
        await client.query(
          `UPDATE venue_balances 
           SET available_balance = available_balance + $1,
               held_for_disputes = COALESCE(held_for_disputes, 0) - $1,
               updated_at = NOW()
           WHERE venue_id = $2 AND tenant_id = $3`,
          [disputeRecord.transfer_amount, disputeRecord.venue_id, disputeRecord.tenant_id]
        );

        // Update transfer status
        await client.query(
          `UPDATE stripe_transfers SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [disputeRecord.transfer_id]
        );
        
        log.info({ disputeId: dispute.id }, 'Dispute won - funds released');
      } else {
        // Remove held funds (already debited by Stripe)
        await client.query(
          `UPDATE venue_balances 
           SET held_for_disputes = COALESCE(held_for_disputes, 0) - $1,
               lost_to_disputes = COALESCE(lost_to_disputes, 0) + $1,
               updated_at = NOW()
           WHERE venue_id = $2 AND tenant_id = $3`,
          [disputeRecord.transfer_amount, disputeRecord.venue_id, disputeRecord.tenant_id]
        );

        // Update transfer status
        await client.query(
          `UPDATE stripe_transfers SET status = 'reversed', updated_at = NOW() WHERE id = $1`,
          [disputeRecord.transfer_id]
        );
        
        log.warn({ disputeId: dispute.id }, 'Dispute lost - funds deducted');
      }
    }

    await client.query('COMMIT');
    recordWebhook('charge.dispute.closed', true);
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ error, disputeId: dispute.id }, 'Failed to process dispute closure');
    recordWebhook('charge.dispute.closed', false);
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// HANDLER REGISTRY
// =============================================================================

export const stripeConnectHandlers: Record<string, (event: Stripe.Event) => Promise<void>> = {
  'transfer.reversed': handleTransferReversed,
  'transfer.failed': handleTransferFailed,
  'payout.failed': handlePayoutFailed,
  'payout.paid': handlePayoutPaid,
  'charge.dispute.created': handleDisputeCreated,
  'charge.dispute.closed': handleDisputeClosed,
  'charge.dispute.updated': handleDisputeCreated, // Re-process to update status
};
