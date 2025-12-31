/**
 * Event Transitions Job
 * 
 * Scheduled jobs to handle automatic event state transitions:
 * - Sales start: PUBLISHED → ON_SALE
 * - Sales end: ON_SALE → SALES_PAUSED
 * - Event start: ON_SALE/SOLD_OUT → IN_PROGRESS
 * - Event end: IN_PROGRESS → COMPLETED
 * 
 * Uses distributed locking to prevent duplicate processing.
 */

import { Job } from 'bull';
import { Redis } from 'ioredis';
import { getQueue, QUEUE_NAMES, scheduleRecurringJob, scheduleJobAt } from './index';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';
import { validateTransition, EventState, EventTransition } from '../services/event-state-machine';

// Job types
export const JOB_TYPES = {
  SCAN_PENDING_TRANSITIONS: 'scan-pending-transitions',
  TRANSITION_EVENT: 'transition-event',
  SALES_START: 'sales-start',
  SALES_END: 'sales-end',
  EVENT_START: 'event-start',
  EVENT_END: 'event-end',
} as const;

// Job data interfaces
interface TransitionEventJobData {
  eventId: string;
  tenantId: string;
  transitionType: typeof JOB_TYPES[keyof typeof JOB_TYPES];
  targetState: EventState;
}

interface ScanJobData {
  timestamp: string;
}

// Lock configuration
const LOCK_TTL_MS = 30000; // 30 seconds
const LOCK_PREFIX = 'event-transition-lock:';

/**
 * Acquire a distributed lock for an event transition
 */
async function acquireLock(redis: Redis, eventId: string): Promise<boolean> {
  const lockKey = `${LOCK_PREFIX}${eventId}`;
  const result = await redis.set(lockKey, Date.now().toString(), 'PX', LOCK_TTL_MS, 'NX');
  return result === 'OK';
}

/**
 * Release a distributed lock
 */
async function releaseLock(redis: Redis, eventId: string): Promise<void> {
  const lockKey = `${LOCK_PREFIX}${eventId}`;
  await redis.del(lockKey);
}

/**
 * Perform an event state transition
 */
async function performTransition(
  eventId: string,
  tenantId: string,
  currentState: EventState,
  transition: EventTransition,
  targetState: EventState
): Promise<{ success: boolean; error?: string }> {
  const db = DatabaseService.getPool();
  
  // Validate transition
  const validation = validateTransition(currentState, transition);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Update event state in database
    const result = await db.query(
      `UPDATE events 
       SET status = $1, 
           updated_at = NOW(),
           status_changed_at = NOW()
       WHERE id = $2 
         AND tenant_id = $3 
         AND status = $4
       RETURNING id, status`,
      [targetState, eventId, tenantId, currentState]
    );

    if (result.rowCount === 0) {
      return { 
        success: false, 
        error: 'Event not found or state has changed' 
      };
    }

    logger.info({
      eventId,
      tenantId,
      previousState: currentState,
      newState: targetState,
      transition,
    }, 'Event state transition completed');

    return { success: true };
  } catch (error: any) {
    logger.error({
      error: error.message,
      eventId,
      tenantId,
      transition,
    }, 'Failed to perform event transition');
    return { success: false, error: error.message };
  }
}

/**
 * Process event transition job
 */
async function processTransitionJob(job: Job<TransitionEventJobData>): Promise<void> {
  const { eventId, tenantId, transitionType, targetState } = job.data;
  const db = DatabaseService.getPool();
  
  // Try to acquire lock
  const redis = (await import('../config/redis')).getRedis();
  const lockAcquired = await acquireLock(redis, eventId);
  
  if (!lockAcquired) {
    logger.warn({
      eventId,
      jobId: job.id,
      transitionType,
    }, 'Could not acquire lock for event transition');
    throw new Error('Lock acquisition failed - will retry');
  }

  try {
    // Get current event state
    const eventResult = await db.query(
      `SELECT id, status, tenant_id FROM events WHERE id = $1 AND tenant_id = $2`,
      [eventId, tenantId]
    );

    if (eventResult.rowCount === 0) {
      logger.warn({ eventId, tenantId }, 'Event not found for transition');
      return;
    }

    const event = eventResult.rows[0];
    const currentState = event.status as EventState;

    // Determine the transition based on job type
    let transition: EventTransition;
    switch (transitionType) {
      case JOB_TYPES.SALES_START:
        transition = 'START_SALES';
        break;
      case JOB_TYPES.SALES_END:
        transition = 'PAUSE_SALES';
        break;
      case JOB_TYPES.EVENT_START:
        transition = 'START_EVENT';
        break;
      case JOB_TYPES.EVENT_END:
        transition = 'END_EVENT';
        break;
      default:
        logger.warn({ transitionType }, 'Unknown transition type');
        return;
    }

    const result = await performTransition(
      eventId,
      tenantId,
      currentState,
      transition,
      targetState
    );

    if (!result.success) {
      logger.warn({
        eventId,
        transitionType,
        error: result.error,
      }, 'Event transition failed');
    }
  } finally {
    await releaseLock(redis, eventId);
  }
}

/**
 * Scan for events that need transitions
 */
async function scanPendingTransitions(job: Job<ScanJobData>): Promise<void> {
  const db = DatabaseService.getPool();
  const now = new Date();

  logger.info({ timestamp: job.data.timestamp }, 'Scanning for pending event transitions');

  try {
    // Find events where sales should start
    const salesStartEvents = await db.query(
      `SELECT id, tenant_id 
       FROM events 
       WHERE status = 'PUBLISHED' 
         AND sales_start_date <= $1 
         AND (sales_end_date IS NULL OR sales_end_date > $1)`,
      [now]
    );

    for (const event of salesStartEvents.rows) {
      await scheduleEventTransition(
        event.id,
        event.tenant_id,
        JOB_TYPES.SALES_START,
        'ON_SALE'
      );
    }

    // Find events where sales should end
    const salesEndEvents = await db.query(
      `SELECT id, tenant_id 
       FROM events 
       WHERE status = 'ON_SALE' 
         AND sales_end_date <= $1`,
      [now]
    );

    for (const event of salesEndEvents.rows) {
      await scheduleEventTransition(
        event.id,
        event.tenant_id,
        JOB_TYPES.SALES_END,
        'SALES_PAUSED'
      );
    }

    // Find events that should start
    const eventStartEvents = await db.query(
      `SELECT id, tenant_id 
       FROM events 
       WHERE status IN ('ON_SALE', 'SOLD_OUT', 'SALES_PAUSED') 
         AND start_date <= $1`,
      [now]
    );

    for (const event of eventStartEvents.rows) {
      await scheduleEventTransition(
        event.id,
        event.tenant_id,
        JOB_TYPES.EVENT_START,
        'IN_PROGRESS'
      );
    }

    // Find events that should end
    const eventEndEvents = await db.query(
      `SELECT id, tenant_id 
       FROM events 
       WHERE status = 'IN_PROGRESS' 
         AND end_date <= $1`,
      [now]
    );

    for (const event of eventEndEvents.rows) {
      await scheduleEventTransition(
        event.id,
        event.tenant_id,
        JOB_TYPES.EVENT_END,
        'COMPLETED'
      );
    }

    logger.info({
      salesStart: salesStartEvents.rowCount,
      salesEnd: salesEndEvents.rowCount,
      eventStart: eventStartEvents.rowCount,
      eventEnd: eventEndEvents.rowCount,
    }, 'Pending transitions scan completed');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to scan for pending transitions');
    throw error;
  }
}

/**
 * Schedule a specific event transition job
 */
export async function scheduleEventTransition(
  eventId: string,
  tenantId: string,
  transitionType: typeof JOB_TYPES[keyof typeof JOB_TYPES],
  targetState: EventState
): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.EVENT_TRANSITIONS);
  
  // Use event-specific job ID to prevent duplicates
  const jobId = `${transitionType}:${eventId}`;
  
  await queue.add(
    JOB_TYPES.TRANSITION_EVENT,
    {
      eventId,
      tenantId,
      transitionType,
      targetState,
    },
    {
      jobId,
      removeOnComplete: true,
      removeOnFail: false, // Keep failed jobs for analysis
      // CRITICAL FIX: Failed job retry configuration
      attempts: 5, // Increased from 3 to 5
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      // Job timeout
      timeout: 30000, // 30 seconds max per attempt
    }
  );

  logger.debug({
    eventId,
    tenantId,
    transitionType,
    targetState,
  }, 'Event transition job scheduled');
}

/**
 * Schedule a transition job at a specific time (for future events)
 */
export async function scheduleTransitionAt(
  eventId: string,
  tenantId: string,
  transitionType: typeof JOB_TYPES[keyof typeof JOB_TYPES],
  targetState: EventState,
  runAt: Date
): Promise<void> {
  await scheduleJobAt(
    QUEUE_NAMES.EVENT_TRANSITIONS,
    JOB_TYPES.TRANSITION_EVENT,
    {
      eventId,
      tenantId,
      transitionType,
      targetState,
    },
    runAt,
    {
      jobId: `${transitionType}:${eventId}:${runAt.getTime()}`,
    }
  );

  logger.info({
    eventId,
    transitionType,
    runAt: runAt.toISOString(),
  }, 'Scheduled future event transition');
}

/**
 * Initialize the event transitions job processor
 */
export async function initializeEventTransitionsProcessor(): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.EVENT_TRANSITIONS);

  // Process transition jobs
  queue.process(JOB_TYPES.TRANSITION_EVENT, 5, processTransitionJob);
  
  // Process scan jobs
  queue.process(JOB_TYPES.SCAN_PENDING_TRANSITIONS, 1, scanPendingTransitions);

  // Schedule recurring scan job (every 5 minutes)
  await scheduleRecurringJob(
    QUEUE_NAMES.EVENT_TRANSITIONS,
    JOB_TYPES.SCAN_PENDING_TRANSITIONS,
    { timestamp: new Date().toISOString() },
    '*/5 * * * *' // Every 5 minutes
  );

  logger.info('Event transitions job processor initialized');
}

/**
 * Manually trigger a scan (for testing or immediate processing)
 */
export async function triggerTransitionScan(): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.EVENT_TRANSITIONS);
  
  await queue.add(
    JOB_TYPES.SCAN_PENDING_TRANSITIONS,
    { timestamp: new Date().toISOString() },
    { removeOnComplete: true }
  );

  logger.info('Manual transition scan triggered');
}
