/**
 * Recovery Points for Multi-Step Operations
 * 
 * AUDIT FIX #24: Add recovery points for purchase flow
 * 
 * Features:
 * - Tracks progress through multi-step mint operations
 * - Stores recovery point in Redis with job data
 * - Enables resuming from last successful point on retry
 * - Logs all recovery point transitions
 */

import { logger } from './logger';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };

// =============================================================================
// RECOVERY POINT ENUM
// =============================================================================

/**
 * Recovery points for minting flow
 * AUDIT FIX #24: Define clear checkpoints for retry logic
 */
export enum RecoveryPoint {
  /** Request received, not yet validated */
  INITIATED = 'INITIATED',
  
  /** Input validated successfully */
  VALIDATED = 'VALIDATED',
  
  /** Distributed lock acquired */
  LOCKED = 'LOCKED',
  
  /** Ticket marked as reserved in database */
  TICKET_RESERVED = 'TICKET_RESERVED',
  
  /** Metadata uploaded to Arweave/IPFS */
  METADATA_UPLOADED = 'METADATA_UPLOADED',
  
  /** Transaction built and ready */
  TX_BUILT = 'TX_BUILT',
  
  /** Transaction submitted to Solana */
  TX_SUBMITTED = 'TX_SUBMITTED',
  
  /** Transaction confirmed on-chain */
  TX_CONFIRMED = 'TX_CONFIRMED',
  
  /** Database updated with mint result */
  DB_UPDATED = 'DB_UPDATED',
  
  /** Full flow complete, cleanup done */
  COMPLETED = 'COMPLETED',
  
  /** Flow failed at some point */
  FAILED = 'FAILED'
}

// Order of recovery points for comparison
const RECOVERY_POINT_ORDER: RecoveryPoint[] = [
  RecoveryPoint.INITIATED,
  RecoveryPoint.VALIDATED,
  RecoveryPoint.LOCKED,
  RecoveryPoint.TICKET_RESERVED,
  RecoveryPoint.METADATA_UPLOADED,
  RecoveryPoint.TX_BUILT,
  RecoveryPoint.TX_SUBMITTED,
  RecoveryPoint.TX_CONFIRMED,
  RecoveryPoint.DB_UPDATED,
  RecoveryPoint.COMPLETED
];

// =============================================================================
// RECOVERY STATE
// =============================================================================

export interface RecoveryState {
  jobId: string;
  ticketId: string;
  tenantId: string;
  currentPoint: RecoveryPoint;
  previousPoint?: RecoveryPoint;
  startedAt: number;
  updatedAt: number;
  retryCount: number;
  metadata?: {
    metadataUri?: string;
    transactionSignature?: string;
    mintAddress?: string;
    error?: string;
    errorCode?: string;
  };
}

// In-memory store (for services without Redis)
const memoryStore = new Map<string, RecoveryState>();

// Redis client (set via initialization)
let redisClient: any = null;
const REDIS_PREFIX = 'recovery:';
const RECOVERY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize Redis client for recovery points
 */
export function initializeRecoveryRedis(client: any): void {
  redisClient = client;
  logger.info('Recovery points Redis client initialized');
}

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Create initial recovery state for a new job
 */
export async function createRecoveryState(
  jobId: string,
  ticketId: string,
  tenantId: string
): Promise<RecoveryState> {
  const state: RecoveryState = {
    jobId,
    ticketId,
    tenantId,
    currentPoint: RecoveryPoint.INITIATED,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    retryCount: 0
  };

  await saveState(jobId, state);

  logger.info('Recovery state created', {
    jobId,
    ticketId,
    currentPoint: state.currentPoint
  });

  return state;
}

/**
 * Update recovery point for a job
 * AUDIT FIX #24: Track progress through multi-step operations
 */
export async function updateRecoveryPoint(
  jobId: string,
  newPoint: RecoveryPoint,
  metadata?: RecoveryState['metadata']
): Promise<RecoveryState | null> {
  const state = await getRecoveryState(jobId);
  
  if (!state) {
    logger.warn('Recovery state not found for update', { jobId, newPoint });
    return null;
  }

  const previousPoint = state.currentPoint;
  state.previousPoint = previousPoint;
  state.currentPoint = newPoint;
  state.updatedAt = Date.now();
  
  if (metadata) {
    state.metadata = { ...state.metadata, ...metadata };
  }

  await saveState(jobId, state);

  logger.info('Recovery point updated', {
    jobId,
    ticketId: state.ticketId,
    previousPoint,
    newPoint,
    retryCount: state.retryCount
  });

  return state;
}

/**
 * Get current recovery state for a job
 */
export async function getRecoveryState(jobId: string): Promise<RecoveryState | null> {
  if (redisClient) {
    try {
      const data = await redisClient.get(`${REDIS_PREFIX}${jobId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn('Redis get failed for recovery state', { jobId, error: (error as Error).message });
    }
  }
  
  return memoryStore.get(jobId) || null;
}

/**
 * Get current recovery point for a job
 */
export async function getRecoveryPoint(jobId: string): Promise<RecoveryPoint | null> {
  const state = await getRecoveryState(jobId);
  return state?.currentPoint || null;
}

/**
 * Increment retry count for a job
 */
export async function incrementRetryCount(jobId: string): Promise<number> {
  const state = await getRecoveryState(jobId);
  
  if (!state) {
    logger.warn('Recovery state not found for retry increment', { jobId });
    return 0;
  }

  state.retryCount++;
  state.updatedAt = Date.now();
  
  await saveState(jobId, state);

  logger.info('Retry count incremented', {
    jobId,
    retryCount: state.retryCount,
    currentPoint: state.currentPoint
  });

  return state.retryCount;
}

/**
 * Mark job as failed
 */
export async function markFailed(
  jobId: string,
  error: string,
  errorCode?: string
): Promise<RecoveryState | null> {
  return updateRecoveryPoint(jobId, RecoveryPoint.FAILED, {
    error,
    errorCode
  });
}

/**
 * Mark job as completed
 */
export async function markCompleted(
  jobId: string,
  mintAddress: string
): Promise<RecoveryState | null> {
  return updateRecoveryPoint(jobId, RecoveryPoint.COMPLETED, {
    mintAddress
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Save state to storage
 */
async function saveState(jobId: string, state: RecoveryState): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.setex(
        `${REDIS_PREFIX}${jobId}`,
        RECOVERY_TTL_SECONDS,
        JSON.stringify(state)
      );
      return;
    } catch (error) {
      logger.warn('Redis save failed for recovery state', { jobId, error: (error as Error).message });
    }
  }
  
  memoryStore.set(jobId, state);
}

/**
 * Check if a recovery point is before another
 */
export function isPointBefore(point: RecoveryPoint, before: RecoveryPoint): boolean {
  const pointIndex = RECOVERY_POINT_ORDER.indexOf(point);
  const beforeIndex = RECOVERY_POINT_ORDER.indexOf(before);
  
  if (pointIndex === -1 || beforeIndex === -1) return false;
  return pointIndex < beforeIndex;
}

/**
 * Check if job can be resumed from current point
 */
export function canResumeFrom(currentPoint: RecoveryPoint): boolean {
  // Can resume from any point except COMPLETED or FAILED
  return currentPoint !== RecoveryPoint.COMPLETED && 
         currentPoint !== RecoveryPoint.FAILED;
}

/**
 * Get the next logical recovery point
 */
export function getNextPoint(currentPoint: RecoveryPoint): RecoveryPoint | null {
  const index = RECOVERY_POINT_ORDER.indexOf(currentPoint);
  if (index === -1 || index >= RECOVERY_POINT_ORDER.length - 1) {
    return null;
  }
  return RECOVERY_POINT_ORDER[index + 1];
}

/**
 * Determine if job should resume or restart
 * AUDIT FIX #24: Resume from last successful recovery point
 */
export function shouldResumeFrom(state: RecoveryState): {
  shouldResume: boolean;
  resumePoint: RecoveryPoint;
} {
  const { currentPoint } = state;

  // If completed or failed, don't resume
  if (currentPoint === RecoveryPoint.COMPLETED) {
    return { shouldResume: false, resumePoint: currentPoint };
  }

  // If failed, we need to determine where to resume from
  if (currentPoint === RecoveryPoint.FAILED) {
    const resumePoint = state.previousPoint || RecoveryPoint.INITIATED;
    return { shouldResume: true, resumePoint };
  }

  // For transaction states, be careful about resumption
  if (currentPoint === RecoveryPoint.TX_SUBMITTED) {
    // Need to check if transaction was actually confirmed
    // Resume from TX_SUBMITTED means checking transaction status first
    return { shouldResume: true, resumePoint: currentPoint };
  }

  // Resume from current point
  return { shouldResume: true, resumePoint: currentPoint };
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Delete recovery state for a job
 */
export async function deleteRecoveryState(jobId: string): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.del(`${REDIS_PREFIX}${jobId}`);
    } catch (error) {
      logger.warn('Redis delete failed for recovery state', { jobId, error: (error as Error).message });
    }
  }
  
  memoryStore.delete(jobId);
  
  logger.debug('Recovery state deleted', { jobId });
}

/**
 * Get all active recovery states (for debugging/admin)
 */
export async function getActiveStates(): Promise<RecoveryState[]> {
  const states: RecoveryState[] = [];
  
  // Memory store
  for (const state of memoryStore.values()) {
    if (canResumeFrom(state.currentPoint)) {
      states.push(state);
    }
  }
  
  // Note: Redis scan would be needed for distributed systems
  // This is simplified for single-process
  
  return states;
}

// =============================================================================
// METRICS
// =============================================================================

export interface RecoveryMetrics {
  activeStates: number;
  byPoint: Record<RecoveryPoint, number>;
  averageRetries: number;
  oldestState: number | null;
}

/**
 * Get recovery metrics
 */
export function getRecoveryMetrics(): RecoveryMetrics {
  const states = Array.from(memoryStore.values());
  
  const byPoint: Record<RecoveryPoint, number> = {} as Record<RecoveryPoint, number>;
  for (const point of Object.values(RecoveryPoint)) {
    byPoint[point as RecoveryPoint] = 0;
  }
  
  let totalRetries = 0;
  let oldestState: number | null = null;
  
  for (const state of states) {
    byPoint[state.currentPoint]++;
    totalRetries += state.retryCount;
    
    if (!oldestState || state.startedAt < oldestState) {
      oldestState = state.startedAt;
    }
  }
  
  return {
    activeStates: states.length,
    byPoint,
    averageRetries: states.length > 0 ? totalRetries / states.length : 0,
    oldestState
  };
}
