import { getMintQueue, addMintJob } from '../queues/mintQueue';
import { getDASClient } from '../services/DASClient';
import { db } from '../config/database';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

// How old a 'minting' status record needs to be before considered stale (30 minutes)
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

// How often to run reconciliation (15 minutes)
const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;

// Maximum records to process per run
const MAX_RECORDS_PER_RUN = 100;

// Maximum retry attempts before marking as failed
const MAX_RETRY_ATTEMPTS = 3;

// =============================================================================
// RECONCILIATION LOGIC
// =============================================================================

interface StaleMint {
  id: string;
  ticket_id: string;
  tenant_id: string;
  asset_id: string | null;
  transaction_signature: string | null;
  retry_count: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Reconcile a single stale mint record
 */
async function reconcileMint(mint: StaleMint): Promise<'completed' | 'failed' | 'requeued' | 'unknown'> {
  try {
    // If we have an asset_id, check if it exists on-chain
    if (mint.asset_id) {
      const dasClient = getDASClient();
      
      try {
        const exists = await dasClient.assetExists(mint.asset_id);
        
        if (exists) {
          // Asset exists! Mark as completed
          await db('nft_mints')
            .where('id', mint.id)
            .update({
              status: 'completed',
              updated_at: new Date(),
              completed_at: new Date()
            });

          logger.info('Reconciled stale mint as completed', {
            mintId: mint.id,
            assetId: mint.asset_id,
            ticketId: mint.ticket_id
          });

          return 'completed';
        }
      } catch (dasError) {
        // DAS lookup failed, log and continue
        logger.warn('DAS lookup failed during reconciliation', {
          mintId: mint.id,
          assetId: mint.asset_id,
          error: (dasError as Error).message
        });
      }
    }

    // If we don't have an asset_id or signature, decide based on retry count
    if (!mint.transaction_signature && !mint.asset_id) {
      const retryCount = mint.retry_count || 0;

      if (retryCount >= MAX_RETRY_ATTEMPTS) {
        // Max retries exceeded, mark as failed
        await db('nft_mints')
          .where('id', mint.id)
          .update({
            status: 'failed',
            updated_at: new Date(),
            error_message: 'Max retry attempts exceeded during reconciliation'
          });

        logger.warn('Marked stale mint as failed (max retries)', {
          mintId: mint.id,
          ticketId: mint.ticket_id,
          retryCount
        });

        return 'failed';
      }

      // Re-queue for another attempt
      await addMintJob({
        ticketId: mint.ticket_id,
        tenantId: mint.tenant_id
      });

      // Update retry count
      await db('nft_mints')
        .where('id', mint.id)
        .update({
          retry_count: retryCount + 1,
          status: 'pending',
          updated_at: new Date()
        });

      logger.info('Re-queued stale mint', {
        mintId: mint.id,
        ticketId: mint.ticket_id,
        retryCount: retryCount + 1
      });

      return 'requeued';
    }

    // Has signature but no asset_id - something went wrong, retry
    if (mint.transaction_signature && !mint.asset_id) {
      const retryCount = mint.retry_count || 0;

      if (retryCount >= MAX_RETRY_ATTEMPTS) {
        await db('nft_mints')
          .where('id', mint.id)
          .update({
            status: 'failed',
            updated_at: new Date(),
            error_message: 'Transaction completed but asset ID extraction failed'
          });

        return 'failed';
      }
    }

    return 'unknown';

  } catch (error) {
    logger.error('Error reconciling stale mint', {
      mintId: mint.id,
      ticketId: mint.ticket_id,
      error: (error as Error).message
    });
    return 'unknown';
  }
}

/**
 * Find and reconcile all stale minting records
 */
export async function reconcileStaleMints(): Promise<{
  processed: number;
  completed: number;
  failed: number;
  requeued: number;
  unknown: number;
}> {
  const stats = {
    processed: 0,
    completed: 0,
    failed: 0,
    requeued: 0,
    unknown: 0
  };

  try {
    // Calculate stale threshold
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    // Find stale records
    const staleMints = await db('nft_mints')
      .where('status', 'minting')
      .where('updated_at', '<', staleThreshold)
      .orderBy('updated_at', 'asc')
      .limit(MAX_RECORDS_PER_RUN) as StaleMint[];

    if (staleMints.length === 0) {
      logger.debug('No stale mints found');
      return stats;
    }

    logger.info(`Found ${staleMints.length} stale mints to reconcile`);

    // Process each stale mint
    for (const mint of staleMints) {
      const result = await reconcileMint(mint);
      stats.processed++;
      stats[result]++;
    }

    logger.info('Reconciliation completed', stats);
    return stats;

  } catch (error) {
    logger.error('Reconciliation job failed', {
      error: (error as Error).message,
      stats
    });
    throw error;
  }
}

/**
 * Find pending mints that have been in pending state too long
 */
export async function reconcilePendingMints(): Promise<number> {
  try {
    // Mints pending for more than 1 hour might be stuck
    const pendingThreshold = new Date(Date.now() - 60 * 60 * 1000);

    const pendingMints = await db('nft_mints')
      .where('status', 'pending')
      .where('updated_at', '<', pendingThreshold)
      .limit(50) as StaleMint[];

    if (pendingMints.length === 0) {
      return 0;
    }

    logger.warn(`Found ${pendingMints.length} stuck pending mints`);

    let requeuedCount = 0;

    for (const mint of pendingMints) {
      try {
        // Check if there's already a job in the queue
        const queue = getMintQueue();
        const jobId = `mint-${mint.tenant_id}-${mint.ticket_id}`;
        const existingJob = await queue.getJob(jobId);

        if (!existingJob) {
          // No job exists, re-queue
          await addMintJob({
            ticketId: mint.ticket_id,
            tenantId: mint.tenant_id
          });
          requeuedCount++;

          logger.info('Re-queued stuck pending mint', {
            mintId: mint.id,
            ticketId: mint.ticket_id
          });
        }
      } catch (error) {
        logger.error('Failed to requeue pending mint', {
          mintId: mint.id,
          error: (error as Error).message
        });
      }
    }

    return requeuedCount;

  } catch (error) {
    logger.error('Pending mint reconciliation failed', {
      error: (error as Error).message
    });
    return 0;
  }
}

// =============================================================================
// JOB SCHEDULING
// =============================================================================

let reconciliationInterval: NodeJS.Timeout | null = null;

/**
 * Start the periodic reconciliation job
 */
export function startReconciliationJob(): void {
  if (reconciliationInterval) {
    logger.warn('Reconciliation job already running');
    return;
  }

  // Run immediately on start
  setTimeout(async () => {
    try {
      await reconcileStaleMints();
      await reconcilePendingMints();
    } catch (error) {
      logger.error('Initial reconciliation failed', {
        error: (error as Error).message
      });
    }
  }, 5000); // Wait 5 seconds after startup

  // Then run periodically
  reconciliationInterval = setInterval(async () => {
    try {
      logger.debug('Running scheduled reconciliation');
      await reconcileStaleMints();
      await reconcilePendingMints();
    } catch (error) {
      logger.error('Scheduled reconciliation failed', {
        error: (error as Error).message
      });
    }
  }, RECONCILIATION_INTERVAL_MS);

  logger.info('Reconciliation job started', {
    intervalMs: RECONCILIATION_INTERVAL_MS,
    staleThresholdMs: STALE_THRESHOLD_MS,
    maxRecordsPerRun: MAX_RECORDS_PER_RUN
  });
}

/**
 * Stop the reconciliation job
 */
export function stopReconciliationJob(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    logger.info('Reconciliation job stopped');
  }
}

interface ReconciliationResult {
  processed: number;
  completed: number;
  failed: number;
  requeued: number;
  unknown: number;
}

/**
 * Run reconciliation manually (for admin endpoints)
 */
export async function runReconciliationNow(): Promise<{
  staleMints: ReconciliationResult;
  pendingRequeued: number;
}> {
  logger.info('Running manual reconciliation');

  const [staleMints, pendingRequeued] = await Promise.all([
    reconcileStaleMints(),
    reconcilePendingMints()
  ]);

  return {
    staleMints,
    pendingRequeued
  };
}
