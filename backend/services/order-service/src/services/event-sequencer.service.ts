import { RedisService } from './redis.service';
import { logger } from '../utils/logger';

/**
 * Event Sequencer Service
 * Manages sequence numbers for events per order to guarantee ordering
 */
export class EventSequencerService {
  private readonly SEQUENCE_KEY_PREFIX = 'event:sequence:';
  private readonly SEQUENCE_TTL = 86400; // 24 hours

  /**
   * Get the next sequence number for an order
   */
  async getNextSequence(orderId: string): Promise<number> {
    const key = `${this.SEQUENCE_KEY_PREFIX}${orderId}`;
    
    try {
      const client = RedisService.getClient();
      // Increment and get the sequence number atomically
      const sequence = await client.incr(key);
      
      // Set expiry on first use
      if (sequence === 1) {
        await client.expire(key, this.SEQUENCE_TTL);
      }
      
      return sequence;
    } catch (error) {
      logger.error('Failed to get next sequence number', { error, orderId });
      // Fallback to timestamp-based sequence if Redis fails
      return Date.now();
    }
  }

  /**
   * Get current sequence number without incrementing
   */
  async getCurrentSequence(orderId: string): Promise<number> {
    const key = `${this.SEQUENCE_KEY_PREFIX}${orderId}`;
    
    try {
      const sequence = await RedisService.get(key);
      return sequence ? parseInt(sequence, 10) : 0;
    } catch (error) {
      logger.error('Failed to get current sequence number', { error, orderId });
      return 0;
    }
  }

  /**
   * Reset sequence for an order (use with caution)
   */
  async resetSequence(orderId: string): Promise<void> {
    const key = `${this.SEQUENCE_KEY_PREFIX}${orderId}`;
    
    try {
      await RedisService.del(key);
      logger.info('Sequence reset for order', { orderId });
    } catch (error) {
      logger.error('Failed to reset sequence', { error, orderId });
      throw error;
    }
  }
}

export const eventSequencerService = new EventSequencerService();
