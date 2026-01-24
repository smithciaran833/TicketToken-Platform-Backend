/**
 * Blockchain Sync Job
 *
 * Bull queue-based retry mechanism for blockchain sync failures.
 * Implements exponential backoff for resilient blockchain synchronization.
 *
 * TODO #13: Add Bull queue retry for blockchain sync failures
 */

import { Job } from 'bull';
import { getQueue, QUEUE_NAMES } from './index';
import { logger } from '../utils/logger';
import { getDb } from '../config/database';
import { EventBlockchainService, EventBlockchainData } from '../services/blockchain.service';

// Job types
export const BLOCKCHAIN_JOB_TYPES = {
  SYNC_EVENT: 'sync-event',
} as const;

// Queue name
export const BLOCKCHAIN_SYNC_QUEUE = 'blockchain-sync';

// Job data interface
interface BlockchainSyncJobData {
  eventId: string;
  tenantId: string;
  attempt: number;
  maxAttempts: number;
  originalError?: string;
}

// Add blockchain-sync to queue names export
export { BLOCKCHAIN_SYNC_QUEUE as QUEUE_NAME };

/**
 * Add blockchain sync job to queue with retry configuration
 */
export async function queueBlockchainSync(
  eventId: string,
  tenantId: string,
  error?: Error
): Promise<void> {
  const queue = getQueue(BLOCKCHAIN_SYNC_QUEUE);

  const jobData: BlockchainSyncJobData = {
    eventId,
    tenantId,
    attempt: 1,
    maxAttempts: 3,
    originalError: error?.message,
  };

  // Use event-specific job ID to prevent duplicates
  const jobId = `blockchain-sync:${eventId}`;

  await queue.add(
    BLOCKCHAIN_JOB_TYPES.SYNC_EVENT,
    jobData,
    {
      jobId,
      removeOnComplete: true,
      removeOnFail: false, // Keep failed jobs for analysis
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds: 2s, 4s, 8s
      },
      timeout: 60000, // 60 seconds max per attempt (blockchain calls can be slow)
    }
  );

  logger.info({
    eventId,
    tenantId,
    jobId,
    originalError: error?.message,
  }, 'Blockchain sync job queued for retry');
}

/**
 * Process blockchain sync job
 */
async function processBlockchainSyncJob(job: Job<BlockchainSyncJobData>): Promise<void> {
  const { eventId, tenantId, attempt, maxAttempts, originalError } = job.data;
  const db = getDb();

  logger.info({
    eventId,
    tenantId,
    attempt: job.attemptsMade + 1,
    maxAttempts,
    originalError,
  }, 'Processing blockchain sync retry');

  try {
    // Get current event data
    const event = await db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .first();

    if (!event) {
      logger.warn({ eventId, tenantId }, 'Event not found for blockchain sync');
      return;
    }

    // Skip if already synced
    if (event.blockchain_status === 'synced' && event.event_pda) {
      logger.info({ eventId }, 'Event already synced to blockchain, skipping');
      return;
    }

    // Use local EventBlockchainService for blockchain operations
    const blockchainService = new EventBlockchainService();

    // Build event data for blockchain sync
    const eventData: EventBlockchainData = {
      eventId: event.blockchain_event_id || 0,
      venueId: event.venue_id,
      name: event.name,
      ticketPrice: 0, // Will be updated from pricing
      totalTickets: event.capacity || 0,
      startTime: event.starts_at ? new Date(event.starts_at) : new Date(),
      endTime: event.ends_at ? new Date(event.ends_at) : new Date(),
      refundWindow: 24,
      metadataUri: event.metadata_uri || '',
      description: event.description || '',
      transferable: true,
      resaleable: event.resaleable !== false,
      merkleTree: event.merkle_tree_address || '',
      artistWallet: event.artist_wallet || '',
      artistPercentage: event.artist_percentage || 5,
      venuePercentage: event.venue_percentage || 3,
    };

    // Call blockchain service to create/sync event
    const blockchainResult = await blockchainService.createEventOnChain(eventData, tenantId);

    // Update event with blockchain data
    await db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .update({
        blockchain_status: 'synced',
        blockchain_event_id: blockchainResult.eventId,
        event_pda: blockchainResult.eventPda,
        blockchain_signature: blockchainResult.signature,
        blockchain_synced_at: new Date(),
        updated_at: new Date(),
      });

    logger.info({
      eventId,
      blockchainEventId: blockchainResult.eventId,
      eventPda: blockchainResult.eventPda,
      signature: blockchainResult.signature,
      attempt: job.attemptsMade + 1,
    }, 'Event synced to blockchain via retry queue');

  } catch (error: any) {
    logger.error({
      eventId,
      tenantId,
      attempt: job.attemptsMade + 1,
      error: error.message,
    }, 'Blockchain sync retry failed');

    // Update status to indicate retry in progress
    await db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .update({
        blockchain_status: job.attemptsMade + 1 >= 3 ? 'failed' : 'retrying',
        blockchain_error: error.message,
        updated_at: new Date(),
      });

    // Rethrow to trigger Bull retry mechanism
    throw error;
  }
}

/**
 * Initialize the blockchain sync job processor
 */
export async function initializeBlockchainSyncProcessor(): Promise<void> {
  const queue = getQueue(BLOCKCHAIN_SYNC_QUEUE);

  // Process sync jobs with concurrency of 3
  queue.process(BLOCKCHAIN_JOB_TYPES.SYNC_EVENT, 3, processBlockchainSyncJob);

  // Log when job completes all retries and finally fails
  queue.on('failed', (job: Job<BlockchainSyncJobData>, error: Error) => {
    if (job.name === BLOCKCHAIN_JOB_TYPES.SYNC_EVENT && job.attemptsMade >= 3) {
      logger.error({
        eventId: job.data.eventId,
        tenantId: job.data.tenantId,
        attempts: job.attemptsMade,
        error: error.message,
      }, 'Blockchain sync permanently failed after all retries');
    }
  });

  logger.info('Blockchain sync job processor initialized');
}

/**
 * Get pending blockchain sync jobs for monitoring
 */
export async function getPendingBlockchainSyncJobs(): Promise<{
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(BLOCKCHAIN_SYNC_QUEUE);

  const [waiting, active, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, failed, delayed };
}
