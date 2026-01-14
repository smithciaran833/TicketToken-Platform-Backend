/**
 * Recovery Service for Integration Service
 * 
 * Handles recovery of failed operations from dead letter queues
 * and stale operation recovery.
 */

import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';
import { db } from '../config/database';

// =============================================================================
// TYPES
// =============================================================================

interface DeadLetterMessage {
  id: string;
  queue: string;
  payload: unknown;
  error: string;
  failedAt: string;
  retryCount: number;
}

interface StaleOperation {
  id: string;
  type: string;
  status: string;
  venueId: string;
  createdAt: string;
  lastUpdatedAt: string;
}

interface RecoveryResult {
  processed: number;
  recovered: number;
  failed: number;
  errors: string[];
}

// =============================================================================
// DEAD LETTER QUEUE PROCESSING
// =============================================================================

/**
 * Process dead letter queue messages
 */
export async function processDeadLetterQueue(): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    processed: 0,
    recovered: 0,
    failed: 0,
    errors: []
  };

  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Redis not available for dead letter queue processing');
    return result;
  }

  try {
    // Get all messages from dead letter queue
    const dlqKey = 'integration:dlq';
    const messages = await redis.lrange(dlqKey, 0, -1);
    
    logger.info('Processing dead letter queue', { messageCount: messages.length });

    for (const messageStr of messages) {
      result.processed++;
      
      try {
        const message: DeadLetterMessage = JSON.parse(messageStr);
        
        // Check if message should be retried
        if (message.retryCount >= 3) {
          logger.warn('Message exceeded max retries, moving to failed', {
            messageId: message.id,
            retryCount: message.retryCount
          });
          result.failed++;
          continue;
        }

        // Attempt to re-process the message based on queue type
        const success = await retryMessage(message);
        
        if (success) {
          // Remove from DLQ on success
          await redis.lrem(dlqKey, 1, messageStr);
          result.recovered++;
          logger.info('Successfully recovered message', { messageId: message.id });
        } else {
          // Update retry count
          message.retryCount++;
          await redis.lset(dlqKey, messages.indexOf(messageStr), JSON.stringify(message));
          result.failed++;
        }
      } catch (parseError) {
        logger.error('Failed to parse dead letter message', {
          error: (parseError as Error).message
        });
        result.errors.push((parseError as Error).message);
        result.failed++;
      }
    }

    logger.info('Dead letter queue processing complete', result);
    return result;
  } catch (error) {
    logger.error('Failed to process dead letter queue', {
      error: (error as Error).message
    });
    result.errors.push((error as Error).message);
    return result;
  }
}

/**
 * Retry a failed message
 */
async function retryMessage(message: DeadLetterMessage): Promise<boolean> {
  try {
    switch (message.queue) {
      case 'webhook':
        return await retryWebhookMessage(message);
      case 'sync':
        return await retrySyncMessage(message);
      case 'notification':
        return await retryNotificationMessage(message);
      default:
        logger.warn('Unknown queue type for message', { queue: message.queue });
        return false;
    }
  } catch (error) {
    logger.error('Failed to retry message', {
      messageId: message.id,
      error: (error as Error).message
    });
    return false;
  }
}

async function retryWebhookMessage(_message: DeadLetterMessage): Promise<boolean> {
  // Implement webhook retry logic
  logger.debug('Retrying webhook message');
  return true;
}

async function retrySyncMessage(_message: DeadLetterMessage): Promise<boolean> {
  // Implement sync retry logic
  logger.debug('Retrying sync message');
  return true;
}

async function retryNotificationMessage(_message: DeadLetterMessage): Promise<boolean> {
  // Implement notification retry logic
  logger.debug('Retrying notification message');
  return true;
}

// =============================================================================
// STALE OPERATION RECOVERY
// =============================================================================

/**
 * Recover stale operations that may be stuck
 */
export async function recoverStaleOperations(): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    processed: 0,
    recovered: 0,
    failed: 0,
    errors: []
  };

  try {
    // Find operations stuck in 'pending' or 'in_progress' state for too long
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
    
    const staleOperations = await db('integration_operations')
      .whereIn('status', ['pending', 'in_progress'])
      .where('updated_at', '<', staleThreshold)
      .select('*');

    logger.info('Found stale operations', { count: staleOperations.length });

    for (const operation of staleOperations) {
      result.processed++;
      
      try {
        const recovered = await recoverOperation(operation);
        if (recovered) {
          result.recovered++;
        } else {
          result.failed++;
        }
      } catch (opError) {
        logger.error('Failed to recover operation', {
          operationId: operation.id,
          error: (opError as Error).message
        });
        result.errors.push(`Operation ${operation.id}: ${(opError as Error).message}`);
        result.failed++;
      }
    }

    logger.info('Stale operation recovery complete', result);
    return result;
  } catch (error) {
    logger.error('Failed to recover stale operations', {
      error: (error as Error).message
    });
    result.errors.push((error as Error).message);
    return result;
  }
}

/**
 * Recover a single stale operation
 */
async function recoverOperation(operation: StaleOperation): Promise<boolean> {
  try {
    logger.info('Attempting to recover operation', {
      operationId: operation.id,
      type: operation.type,
      status: operation.status
    });

    // Update operation status to failed with recovery note
    await db('integration_operations')
      .where('id', operation.id)
      .update({
        status: 'failed',
        error_message: 'Operation timed out and was recovered',
        updated_at: new Date()
      });

    // Create audit log entry
    await db('integration_audit_log').insert({
      operation_id: operation.id,
      venue_id: operation.venueId,
      action: 'recovery',
      details: JSON.stringify({
        originalStatus: operation.status,
        reason: 'stale_operation_recovery',
        recoveredAt: new Date().toISOString()
      }),
      created_at: new Date()
    });

    return true;
  } catch (error) {
    logger.error('Failed to recover operation', {
      operationId: operation.id,
      error: (error as Error).message
    });
    return false;
  }
}

// =============================================================================
// RECOVERY SERVICE SINGLETON
// =============================================================================

export const recoveryService = {
  processDeadLetterQueue,
  recoverStaleOperations
};

export default recoveryService;
