import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { OrderEvents } from '../events/event-types';

export interface DLQEntry {
  id: string;
  eventType: string;
  payload: any;
  error: string;
  attemptCount: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  createdAt: Date;
}

/**
 * Dead Letter Queue Service
 * Stores failed event publications for manual review and retry
 */
export class DeadLetterQueueService {
  /**
   * Add a failed event to the DLQ
   */
  async addToDLQ(event: {
    eventType: OrderEvents;
    payload: any;
    error: string;
    attemptCount: number;
  }): Promise<string> {
    const db = getDatabase();
    
    try {
      const result = await db.query(
        `
        INSERT INTO dead_letter_queue (
          event_type, payload, error, attempt_count,
          first_attempt_at, last_attempt_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
        `,
        [
          event.eventType,
          JSON.stringify(event.payload),
          event.error,
          event.attemptCount,
        ]
      );
      
      const dlqId = result.rows[0].id;
      
      logger.error('Event added to DLQ', {
        dlqId,
        eventType: event.eventType,
        error: event.error,
        attemptCount: event.attemptCount,
      });
      
      return dlqId;
    } catch (error) {
      logger.error('Failed to add event to DLQ', { error, event });
      throw error;
    }
  }

  /**
   * Get DLQ entries
   */
  async getDLQEntries(limit: number = 100, offset: number = 0): Promise<DLQEntry[]> {
    const db = getDatabase();
    
    try {
      const result = await db.query(
        `
        SELECT 
          id, event_type, payload, error, attempt_count,
          first_attempt_at, last_attempt_at, created_at
        FROM dead_letter_queue
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        `,
        [limit, offset]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        eventType: row.event_type,
        payload: row.payload,
        error: row.error,
        attemptCount: row.attempt_count,
        firstAttemptAt: row.first_attempt_at,
        lastAttemptAt: row.last_attempt_at,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Failed to get DLQ entries', { error });
      throw error;
    }
  }

  /**
   * Remove entry from DLQ after successful retry
   */
  async removeFromDLQ(dlqId: string): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.query('DELETE FROM dead_letter_queue WHERE id = $1', [dlqId]);
      logger.info('Entry removed from DLQ', { dlqId });
    } catch (error) {
      logger.error('Failed to remove entry from DLQ', { error, dlqId });
      throw error;
    }
  }
}
