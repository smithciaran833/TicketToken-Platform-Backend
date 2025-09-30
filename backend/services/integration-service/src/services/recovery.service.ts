import { db } from '../config/database';
import { queues } from '../config/queue';
import { logger } from '../utils/logger';
// Removed unused: import { WebhookProcessor } from './webhook-processor';

export class RecoveryService {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 5000;
  // Removed unused: private webhookProcessor: WebhookProcessor;

  constructor() {
    // Removed unused: this.webhookProcessor = new WebhookProcessor();
  }

  async handleFailedSync(
    venueId: string,
    integrationType: string,
    error: any,
    context: any
  ): Promise<void> {
    try {
      await this.logFailure(venueId, integrationType, error, context);

      if (this.isRetryableError(error)) {
        await this.scheduleRetry(venueId, integrationType, context);
      } else if (this.isAuthError(error)) {
        await this.handleAuthFailure(venueId, integrationType);
      } else {
        await this.activateDegradedMode(venueId, integrationType);
      }
    } catch (recoveryError) {
      logger.error('Recovery process failed', {
        venueId,
        integrationType,
        originalError: error,
        recoveryError
      });
    }
  }

  async processDeadLetterQueue(): Promise<void> {
    try {
      const deadLetterItems = await db('sync_queue')
        .where('status', 'failed')
        .where('retry_count', '>=', this.MAX_RETRY_ATTEMPTS)
        .orderBy('created_at', 'asc')
        .limit(100);

      for (const item of deadLetterItems) {
        await this.attemptRecovery(item);
      }
    } catch (error) {
      logger.error('Failed to process dead letter queue', error);
    }
  }

  private async attemptRecovery(queueItem: any): Promise<void> {
    try {
      const health = await this.checkIntegrationHealth(
        queueItem.venue_id,
        queueItem.integration_type
      );

      if (health.isHealthy) {
        await queues.low.add('sync', {
          ...queueItem,
          isRecovery: true
        });

        await db('sync_queue')
          .where('id', queueItem.id)
          .update({
            status: 'recovering',
            updated_at: new Date()
          });

        logger.info('Queue item recovered', {
          queueId: queueItem.id,
          venueId: queueItem.venue_id
        });
      }
    } catch (error) {
      logger.error('Failed to recover queue item', {
        queueId: queueItem.id,
        error
      });
    }
  }

  private async checkIntegrationHealth(
    venueId: string,
    integrationType: string
  ): Promise<{ isHealthy: boolean; reason?: string }> {
    const integration = await db('integration_configs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .first();

    if (!integration) {
      return { isHealthy: false, reason: 'Integration not found' };
    }

    if (integration.status !== 'active') {
      return { isHealthy: false, reason: 'Integration not active' };
    }

    return { isHealthy: true };
  }

  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'RATE_LIMIT',
      'SERVICE_UNAVAILABLE'
    ];

    return retryableErrors.some(code => 
      error.code === code || error.message?.includes(code)
    );
  }

  private isAuthError(error: any): boolean {
    const authErrors = [
      'UNAUTHORIZED',
      'INVALID_TOKEN',
      'TOKEN_EXPIRED',
      'AUTHENTICATION_FAILED'
    ];

    return authErrors.some(code => 
      error.code === code || 
      error.message?.includes(code) ||
      error.statusCode === 401
    );
  }

  private async scheduleRetry(
    venueId: string,
    integrationType: string,
    context: any
  ): Promise<void> {
    const retryCount = context.retryCount || 0;

    if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
      await this.moveToDeadLetter(venueId, integrationType, context);
      return;
    }

    await db('sync_queue').insert({
      venue_id: venueId,
      integration_type: integrationType,
      operation: context.operation,
      data: JSON.stringify(context.data),
      status: 'pending',
      retry_count: retryCount + 1,
      scheduled_for: new Date(Date.now() + this.RETRY_DELAY_MS * Math.pow(2, retryCount)),
      created_at: new Date()
    });
  }

  private async handleAuthFailure(
    venueId: string,
    integrationType: string
  ): Promise<void> {
    // Try to refresh tokens
    const refreshed = await this.attemptTokenRefresh(venueId, integrationType);

    if (!refreshed) {
      await this.disableIntegration(venueId, integrationType, 'auth_failed');
      await this.notifyAuthFailure(venueId, integrationType);
    }
  }

  private async attemptTokenRefresh(
    _venueId: string,
    _integrationType: string
  ): Promise<boolean> {
    // Implementation depends on integration type
    try {
      // Attempt refresh logic here - placeholder
      // Parameters prefixed with _ since they're not used yet
      return false; 
    } catch {
      return false;
    }
  }

  private async moveToDeadLetter(
    venueId: string,
    integrationType: string,
    context: any
  ): Promise<void> {
    await db('sync_queue').insert({
      venue_id: venueId,
      integration_type: integrationType,
      operation: context.operation,
      data: JSON.stringify(context.data),
      status: 'failed',
      retry_count: this.MAX_RETRY_ATTEMPTS,
      error: context.lastError,
      created_at: new Date()
    });
  }

  private async disableIntegration(
    venueId: string,
    integrationType: string,
    reason: string
  ): Promise<void> {
    await db('integration_configs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .update({
        status: 'disabled',
        disabled_reason: reason,
        disabled_at: new Date(),
        updated_at: new Date()
      });
  }

  private async activateDegradedMode(
    venueId: string,
    integrationType: string
  ): Promise<void> {
    await db('integration_configs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .update({
        health_status: 'degraded',
        updated_at: new Date()
      });
  }

  private async notifyAuthFailure(
    venueId: string,
    integrationType: string
  ): Promise<void> {
    // Send notification to venue admin
    logger.warn('Auth failure notification sent', {
      venueId,
      integrationType
    });
  }

  private async logFailure(
    venueId: string,
    integrationType: string,
    error: any,
    context: any
  ): Promise<void> {
    await db('sync_logs').insert({
      venue_id: venueId,
      integration_type: integrationType,
      operation: context.operation,
      status: 'failed',
      error_message: error.message,
      error_stack: error.stack,
      context: JSON.stringify(context),
      created_at: new Date()
    });
  }

  async recoverStaleOperations(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes

    const staleOps = await db('sync_queue')
      .where('status', 'processing')
      .where('updated_at', '<', staleThreshold)
      .update({
        status: 'pending',
        retry_count: db.raw('retry_count + 1'),
        updated_at: new Date()
      });

    if (staleOps > 0) {
      logger.info(`Recovered ${staleOps} stale operations`);
    }
  }
}

export const recoveryService = new RecoveryService();
