import { logger } from '../config/logger';
import { db } from '../config/database';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
}

export class RetryService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    factor: 2,
  };

  async shouldRetry(
    notificationId: string,
    error: Error
  ): Promise<{ retry: boolean; delay: number }> {
    // Get current attempt count
    const notification = await db('notification_tracking')
      .where('id', notificationId)
      .first();

    if (!notification) {
      return { retry: false, delay: 0 };
    }

    const attempts = notification.retry_attempts || 0;

    // Check if we should retry based on error type
    if (!this.isRetryableError(error)) {
      logger.info('Error is not retryable', { 
        notificationId, 
        error: error.message 
      });
      return { retry: false, delay: 0 };
    }

    // Check max attempts
    if (attempts >= this.defaultConfig.maxAttempts) {
      logger.warn('Max retry attempts reached', { 
        notificationId, 
        attempts 
      });
      return { retry: false, delay: 0 };
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.defaultConfig.baseDelay * Math.pow(this.defaultConfig.factor, attempts),
      this.defaultConfig.maxDelay
    );

    // Update retry count
    await db('notification_tracking')
      .where('id', notificationId)
      .update({
        retry_attempts: attempts + 1,
        next_retry_at: new Date(Date.now() + delay),
        updated_at: new Date(),
      });

    logger.info('Scheduling retry', { 
      notificationId, 
      attempt: attempts + 1, 
      delay 
    });

    return { retry: true, delay };
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Don't retry on permanent failures
    if (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request')
    ) {
      return false;
    }

    // Retry on temporary failures
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return true;
    }

    // Default to retry for unknown errors
    return true;
  }

  async recordRetryMetrics(notificationId: string, success: boolean) {
    const key = success ? 'retry_success' : 'retry_failure';
    await db('notification_tracking')
      .where('id', notificationId)
      .increment(key, 1);
  }
}

export const retryService = new RetryService();
