/**
 * Transfer Retry Job
 * 
 * HIGH FIX: Implements retry logic for failed Stripe transfers
 * - Retries failed transfers with exponential backoff
 * - Validates tenant context before processing
 * - Updates transfer status and sends alerts
 */

import Stripe from 'stripe';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { alertingService } from '../services/alerting.service';
import { recordStripeApiDuration } from '../routes/metrics.routes';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'TransferRetryJob' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAX_RETRY_ATTEMPTS = 5;
const BATCH_SIZE = 10;

// Retry delays in seconds (exponential backoff)
const RETRY_DELAYS = [60, 300, 900, 3600, 21600]; // 1m, 5m, 15m, 1h, 6h

// =============================================================================
// TYPES
// =============================================================================

interface PendingTransfer {
  id: string;
  stripe_transfer_id: string | null;
  payment_id: string;
  order_id: string;
  amount: number;
  destination_account: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  tenant_id: string;
  created_at: Date;
}

// =============================================================================
// STRIPE CLIENT
// =============================================================================

function getStripe(): Stripe | null {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    log.warn('STRIPE_SECRET_KEY not set');
    return null;
  }
  return new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    timeout: 30000,
    maxNetworkRetries: 0, // We handle retries ourselves
  });
}

// =============================================================================
// TRANSFER RETRY JOB
// =============================================================================

/**
 * Process pending transfers
 */
export async function processPendingTransfers(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    log.error('Stripe not configured - skipping transfer retry job');
    return;
  }

  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    // Use SKIP LOCKED to allow parallel workers
    const result = await client.query(`
      SELECT pt.*, 
             st.stripe_transfer_id as existing_transfer_id
      FROM pending_transfers pt
      LEFT JOIN stripe_transfers st ON pt.id = st.pending_transfer_id
      WHERE pt.status = 'pending_retry'
        AND pt.retry_count < $1
        AND (pt.retry_after IS NULL OR pt.retry_after <= NOW())
      ORDER BY pt.created_at ASC
      LIMIT $2
      FOR UPDATE OF pt SKIP LOCKED
    `, [MAX_RETRY_ATTEMPTS, BATCH_SIZE]);

    if (result.rows.length === 0) {
      log.debug('No pending transfers to process');
      return;
    }

    log.info({ count: result.rows.length }, 'Processing pending transfers');

    for (const transfer of result.rows) {
      await processTransfer(client, stripe, transfer);
    }
  } catch (error) {
    log.error({ error }, 'Error processing pending transfers');
  } finally {
    client.release();
  }
}

/**
 * Process a single transfer
 */
async function processTransfer(
  client: any,
  stripe: Stripe,
  transfer: PendingTransfer
): Promise<void> {
  const startTime = Date.now();
  
  log.info({
    transferId: transfer.id,
    amount: transfer.amount,
    destination: transfer.destination_account,
    retryCount: transfer.retry_count,
  }, 'Processing transfer');

  try {
    // Set tenant context
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      [transfer.tenant_id]
    );

    // Mark as processing
    await client.query(
      `UPDATE pending_transfers 
       SET status = 'processing', 
           retry_count = retry_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [transfer.id]
    );

    // Execute the transfer
    const stripeTransfer = await stripe.transfers.create({
      amount: transfer.amount,
      currency: 'usd',
      destination: transfer.destination_account,
      transfer_group: transfer.order_id,
      metadata: {
        payment_id: transfer.payment_id,
        order_id: transfer.order_id,
        tenant_id: transfer.tenant_id,
        retry_attempt: (transfer.retry_count + 1).toString(),
      },
    });

    // Record API duration
    recordStripeApiDuration('transfers.create', Date.now() - startTime);

    // Update pending transfer status
    await client.query(
      `UPDATE pending_transfers 
       SET status = 'completed',
           stripe_transfer_id = $2,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [transfer.id, stripeTransfer.id]
    );

    // Create/update stripe_transfers record
    await client.query(`
      INSERT INTO stripe_transfers (
        id, payment_id, order_id, stripe_transfer_id, destination_account,
        amount, status, tenant_id, pending_transfer_id, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'completed', $7, $8, NOW()
      )
      ON CONFLICT (stripe_transfer_id) DO UPDATE SET
        status = 'completed',
        updated_at = NOW()
    `, [
      uuidv4(),
      transfer.payment_id,
      transfer.order_id,
      stripeTransfer.id,
      transfer.destination_account,
      transfer.amount,
      transfer.tenant_id,
      transfer.id,
    ]);

    await client.query('COMMIT');

    log.info({
      transferId: transfer.id,
      stripeTransferId: stripeTransfer.id,
    }, 'Transfer completed successfully');
  } catch (error: any) {
    await client.query('ROLLBACK');
    
    const errorMessage = error.message || 'Unknown error';
    const shouldRetry = !isTerminalError(error);
    const nextRetryDelay = RETRY_DELAYS[Math.min(transfer.retry_count, RETRY_DELAYS.length - 1)];

    log.error({
      transferId: transfer.id,
      error: errorMessage,
      shouldRetry,
      nextRetryDelay,
    }, 'Transfer failed');

    // Update transfer status
    if (shouldRetry && transfer.retry_count + 1 < MAX_RETRY_ATTEMPTS) {
      await client.query(
        `UPDATE pending_transfers 
         SET status = 'pending_retry',
             last_error = $2,
             retry_after = NOW() + INTERVAL '${nextRetryDelay} seconds',
             updated_at = NOW()
         WHERE id = $1`,
        [transfer.id, errorMessage]
      );
    } else {
      // Mark as permanently failed
      await client.query(
        `UPDATE pending_transfers 
         SET status = 'failed',
             last_error = $2,
             failed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [transfer.id, errorMessage]
      );

      // Send alert
      await alertingService.alertTransferFailed(
        transfer.id,
        transfer.amount,
        transfer.destination_account,
        errorMessage,
        transfer.tenant_id
      );
    }

    // Record API duration even on failure
    recordStripeApiDuration('transfers.create', Date.now() - startTime);
  }
}

/**
 * Check if an error is terminal (should not retry)
 */
function isTerminalError(error: any): boolean {
  // Stripe error codes that should not be retried
  const terminalCodes = [
    'account_invalid',
    'account_closed',
    'insufficient_funds', // For transfers, this is terminal
    'invalid_destination',
    'invalid_amount',
    'transfer_amount_exceeds_available_balance',
  ];

  if (error.code && terminalCodes.includes(error.code)) {
    return true;
  }

  // 4xx errors (except rate limits) are terminal
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
    return true;
  }

  return false;
}

/**
 * Queue a transfer for retry
 */
export async function queueTransferForRetry(
  paymentId: string,
  orderId: string,
  amount: number,
  destinationAccount: string,
  tenantId: string,
  error: string
): Promise<string> {
  const db = DatabaseService.getPool();
  const id = uuidv4();

  await db.query(`
    INSERT INTO pending_transfers (
      id, payment_id, order_id, amount, destination_account,
      status, retry_count, last_error, tenant_id, created_at, retry_after
    ) VALUES (
      $1, $2, $3, $4, $5, 'pending_retry', 0, $6, $7, NOW(), NOW() + INTERVAL '1 minute'
    )
  `, [id, paymentId, orderId, amount, destinationAccount, error, tenantId]);

  log.info({
    pendingTransferId: id,
    paymentId,
    amount,
  }, 'Transfer queued for retry');

  return id;
}

/**
 * Get transfer status
 */
export async function getTransferStatus(pendingTransferId: string): Promise<{
  status: string;
  retryCount: number;
  lastError: string | null;
  stripeTransferId: string | null;
} | null> {
  const db = DatabaseService.getPool();
  
  const result = await db.query(`
    SELECT status, retry_count, last_error, stripe_transfer_id
    FROM pending_transfers
    WHERE id = $1
  `, [pendingTransferId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    status: row.status,
    retryCount: row.retry_count,
    lastError: row.last_error,
    stripeTransferId: row.stripe_transfer_id,
  };
}

// =============================================================================
// JOB REGISTRATION
// =============================================================================

/**
 * Register transfer retry job with the background job processor
 */
export function registerTransferRetryJob(processor: any): void {
  processor.registerHandler('process_pending_transfers', async () => {
    await processPendingTransfers();
  });
  
  log.info('Transfer retry job registered');
}

/**
 * Schedule the transfer retry job to run periodically
 */
export function scheduleTransferRetryJob(): NodeJS.Timeout {
  const intervalMs = parseInt(process.env.TRANSFER_RETRY_INTERVAL_MS || '60000', 10);
  
  const intervalId = setInterval(async () => {
    try {
      await processPendingTransfers();
    } catch (error) {
      log.error({ error }, 'Transfer retry job failed');
    }
  }, intervalMs);

  log.info({ intervalMs }, 'Transfer retry job scheduled');
  
  return intervalId;
}
