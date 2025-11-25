/**
 * Idempotency Service
 * 
 * Prevents duplicate processing of requests using idempotency keys
 * Essential for webhook processing and retry scenarios
 */

import { logger } from '../utils/logger';

export interface IdempotencyRecord {
  key: string;
  requestId?: string;
  response?: any;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

class IdempotencyService {
  private records: Map<string, IdempotencyRecord> = new Map();
  private readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_RECORDS = 10000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup on initialization
    this.startCleanup();
  }

  /**
   * Check if a request with this idempotency key has been processed
   */
  async checkIdempotency(key: string): Promise<{
    exists: boolean;
    record?: IdempotencyRecord;
  }> {
    const record = this.records.get(key);

    if (!record) {
      return { exists: false };
    }

    // Check if expired
    if (record.expiresAt < new Date()) {
      this.records.delete(key);
      return { exists: false };
    }

    logger.info('Idempotency key found', {
      key,
      status: record.status,
      createdAt: record.createdAt,
    });

    return {
      exists: true,
      record,
    };
  }

  /**
   * Store a new idempotency record
   */
  async storeIdempotency(
    key: string,
    requestId?: string,
    ttlMs: number = this.DEFAULT_TTL_MS,
    metadata?: Record<string, any>
  ): Promise<IdempotencyRecord> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const record: IdempotencyRecord = {
      key,
      requestId,
      status: 'processing',
      createdAt: now,
      expiresAt,
      metadata,
    };

    this.records.set(key, record);

    logger.debug('Idempotency record created', {
      key,
      requestId,
      expiresAt,
    });

    // Auto-cleanup if too many records
    if (this.records.size > this.MAX_RECORDS) {
      this.cleanupExpired();
    }

    return record;
  }

  /**
   * Update an idempotency record with response
   */
  async completeIdempotency(
    key: string,
    response: any,
    status: 'completed' | 'failed' = 'completed'
  ): Promise<boolean> {
    const record = this.records.get(key);

    if (!record) {
      logger.warn('Idempotency record not found for completion', { key });
      return false;
    }

    record.status = status;
    record.response = response;
    record.completedAt = new Date();

    this.records.set(key, record);

    logger.debug('Idempotency record completed', {
      key,
      status,
      duration: record.completedAt.getTime() - record.createdAt.getTime(),
    });

    return true;
  }

  /**
   * Get idempotency record
   */
  getRecord(key: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);

    // Check if expired
    if (record && record.expiresAt < new Date()) {
      this.records.delete(key);
      return undefined;
    }

    return record;
  }

  /**
   * Delete an idempotency record
   */
  deleteRecord(key: string): boolean {
    return this.records.delete(key);
  }

  /**
   * Generate idempotency key from request data
   */
  generateKey(data: {
    operation: string;
    provider?: string;
    venueId?: string;
    payload?: any;
  }): string {
    const parts = [
      data.operation,
      data.provider || 'none',
      data.venueId || 'none',
      JSON.stringify(data.payload || {}),
    ];

    // Simple hash of the parts
    const hash = this.simpleHash(parts.join('::'));
    
    return `idem-${hash}`;
  }

  /**
   * Simple hash function for generating keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Execute a function with idempotency protection
   */
  async withIdempotency<T>(
    key: string,
    fn: () => Promise<T>,
    options?: {
      requestId?: string;
      ttlMs?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<T> {
    // Check if already processed
    const check = await this.checkIdempotency(key);

    if (check.exists && check.record) {
      if (check.record.status === 'processing') {
        throw new Error('Request is already being processed');
      }

      if (check.record.status === 'completed') {
        logger.info('Returning cached response for idempotent request', { key });
        return check.record.response as T;
      }

      if (check.record.status === 'failed') {
        logger.warn('Previous request failed, retrying', { key });
        // Allow retry for failed requests
      }
    }

    // Store new idempotency record
    await this.storeIdempotency(
      key,
      options?.requestId,
      options?.ttlMs,
      options?.metadata
    );

    try {
      // Execute the function
      const result = await fn();

      // Store successful result
      await this.completeIdempotency(key, result, 'completed');

      return result;
    } catch (error) {
      // Store failure
      await this.completeIdempotency(
        key,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'failed'
      );

      throw error;
    }
  }

  /**
   * Clean up expired records
   */
  cleanupExpired(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [key, record] of this.records.entries()) {
      if (record.expiresAt < now) {
        this.records.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired idempotency records`);
    }

    return cleaned;
  }

  /**
   * Start automatic cleanup
   */
  private startCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    processing: number;
    completed: number;
    failed: number;
    expiringSoon: number; // Expiring in next hour
  } {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let expiringSoon = 0;

    for (const record of this.records.values()) {
      switch (record.status) {
        case 'processing':
          processing++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }

      if (record.expiresAt < oneHourFromNow) {
        expiringSoon++;
      }
    }

    return {
      total: this.records.size,
      processing,
      completed,
      failed,
      expiringSoon,
    };
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records.clear();
    logger.info('Cleared all idempotency records');
  }
}

// Export singleton instance
export const idempotencyService = new IdempotencyService();
