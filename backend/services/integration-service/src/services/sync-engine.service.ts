import { db } from '../config/database';
import { credentialEncryptionService } from './credential-encryption.service';
import { stripeSyncService } from './providers/stripe-sync.service';
import { squareSyncService } from './providers/square-sync.service';
import { mailchimpSyncService } from './providers/mailchimp-sync.service';
import { quickbooksSyncService } from './providers/quickbooks-sync.service';
import { rateLimiterService } from './rate-limiter.service';

export interface SyncJob {
  id?: string;
  venueId: string;
  integrationType: string;
  syncType: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  scheduledFor?: Date;
  metadata?: Record<string, any>;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errors: Array<{ record: any; error: string }>;
  duration: number;
}

export class SyncEngineService {
  /**
   * Queue a sync job
   */
  async queueSync(job: SyncJob): Promise<string> {
    try {
      const [result] = await db('sync_queue')
        .insert({
          venue_id: job.venueId,
          integration_type: job.integrationType,
          sync_type: job.syncType,
          direction: job.direction,
          status: 'pending',
          priority: job.priority || 'normal',
          attempts: 0,
          max_attempts: 3,
          scheduled_for: job.scheduledFor || new Date(),
          metadata: JSON.stringify(job.metadata || {}),
        })
        .returning('id');

      console.log(`✅ Sync job queued: ${result.id} for venue ${job.venueId}`);
      return result.id;
    } catch (error) {
      console.error('Failed to queue sync job:', error);
      throw new Error(`Failed to queue sync job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a sync job
   */
  async processSync(jobId: string): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsSucceeded = 0;
    let recordsFailed = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      // Get job from queue
      const job = await db('sync_queue')
        .where({ id: jobId })
        .first();

      if (!job) {
        throw new Error(`Sync job ${jobId} not found`);
      }

      // Update job status to processing
      await db('sync_queue')
        .where({ id: jobId })
        .update({
          status: 'processing',
          started_at: new Date(),
          attempts: db.raw('attempts + 1'),
        });

      // Get credentials for the integration
      const credentials = await this.getCredentials(
        job.venue_id,
        job.integration_type
      );

      if (!credentials) {
        throw new Error(`No credentials found for venue ${job.venue_id}, integration ${job.integration_type}`);
      }

      // Execute sync based on sync type
      const syncResult = await this.executeSync(job, credentials);
      
      recordsProcessed = syncResult.recordsProcessed;
      recordsSucceeded = syncResult.recordsSucceeded;
      recordsFailed = syncResult.recordsFailed;
      errors.push(...syncResult.errors);

      // Update job as completed
      const duration = Date.now() - startTime;
      await db('sync_queue')
        .where({ id: jobId })
        .update({
          status: 'completed',
          completed_at: new Date(),
          duration_ms: duration,
          records_processed: recordsProcessed,
          records_succeeded: recordsSucceeded,
          records_failed: recordsFailed,
          errors: JSON.stringify(errors),
        });

      // Log sync completion
      await this.logSyncCompletion(job, recordsProcessed, recordsSucceeded, recordsFailed, errors, duration);

      console.log(`✅ Sync completed: ${jobId}, processed ${recordsProcessed} records in ${duration}ms`);

      return {
        success: recordsFailed === 0,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed,
        errors,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('Sync job failed:', error);

      // Update job as failed
      await db('sync_queue')
        .where({ id: jobId })
        .update({
          status: 'failed',
          completed_at: new Date(),
          duration_ms: duration,
          errors: JSON.stringify([{
            record: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          }]),
        });

      throw error;
    }
  }

  /**
   * Get credentials for an integration (OAuth or API keys)
   */
  private async getCredentials(venueId: string, integrationType: string): Promise<any> {
    // Try OAuth tokens first
    const oauthTokens = await credentialEncryptionService.retrieveOAuthTokens(
      venueId,
      integrationType
    );

    if (oauthTokens) {
      // Check if token needs rotation
      const needsRotation = await credentialEncryptionService.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      if (needsRotation) {
        console.log(`⚠️ Token rotation needed for venue ${venueId}, integration ${integrationType}`);
        // In production, trigger token refresh flow here
      }

      return {
        type: 'oauth',
        ...oauthTokens,
      };
    }

    // Try API keys
    // Note: In practice, you'd need to know the key name
    // This is a simplified example
    const apiKeys = await credentialEncryptionService.retrieveApiKeys(
      venueId,
      integrationType,
      'default'
    );

    if (apiKeys) {
      return {
        type: 'api_key',
        ...apiKeys,
      };
    }

    return null;
  }

  /**
   * Execute the actual sync operation
   */
  private async executeSync(job: any, credentials: any): Promise<SyncResult> {
    const startTime = Date.now();
    console.log(`Executing sync for ${job.integration_type}, type: ${job.sync_type}, direction: ${job.direction}`);

    try {
      switch (job.integration_type.toLowerCase()) {
        case 'stripe':
          return await this.executeStripeSync(job, credentials);
        
        case 'square':
          return await this.executeSquareSync(job, credentials);
        
        case 'mailchimp':
          return await this.executeMailchimpSync(job, credentials);
        
        case 'quickbooks':
          return await this.executeQuickBooksSync(job, credentials);
        
        default:
          throw new Error(`Unsupported integration type: ${job.integration_type}`);
      }
    } catch (error) {
      console.error(`Sync execution failed for ${job.integration_type}:`, error);
      return {
        success: false,
        recordsProcessed: 0,
        recordsSucceeded: 0,
        recordsFailed: 0,
        errors: [{
          record: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Stripe sync
   */
  private async executeStripeSync(job: any, credentials: any): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsSucceeded = 0;
    let recordsFailed = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      const venueId = job.venue_id;
      const syncType = job.sync_type.toLowerCase();
      const direction = job.direction;

      if (syncType === 'customers' && direction === 'inbound') {
        // Sync customers from Stripe to our system
        await rateLimiterService.waitIfNeeded('stripe', venueId, 'customers');
        const customers = await stripeSyncService.syncCustomersFromStripe(venueId);
        recordsProcessed = customers.length;
        recordsSucceeded = customers.length;
        console.log(`✅ Synced ${customers.length} customers from Stripe`);
      } else if (syncType === 'products' && direction === 'inbound') {
        // Sync products from Stripe
        const products = await stripeSyncService.getProducts(venueId);
        recordsProcessed = products.length;
        recordsSucceeded = products.length;
        console.log(`✅ Synced ${products.length} products from Stripe`);
      } else if (syncType === 'subscriptions' && direction === 'inbound') {
        // Sync subscriptions from Stripe
        const subscriptions = await stripeSyncService.getSubscriptions(venueId);
        recordsProcessed = subscriptions.length;
        recordsSucceeded = subscriptions.length;
        console.log(`✅ Synced ${subscriptions.length} subscriptions from Stripe`);
      } else if (syncType === 'charges' && direction === 'inbound') {
        // Sync charges from Stripe
        const charges = await stripeSyncService.syncChargesFromStripe(venueId);
        recordsProcessed = charges.length;
        recordsSucceeded = charges.length;
        console.log(`✅ Synced ${charges.length} charges from Stripe`);
      } else {
        throw new Error(`Unsupported Stripe sync type/direction: ${syncType}/${direction}`);
      }

      return {
        success: true,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Stripe sync failed:', error);
      return {
        success: false,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed: recordsProcessed - recordsSucceeded,
        errors: [{
          record: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Square sync
   */
  private async executeSquareSync(job: any, credentials: any): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsSucceeded = 0;
    let recordsFailed = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      const venueId = job.venue_id;
      const syncType = job.sync_type.toLowerCase();
      const direction = job.direction;

      if (syncType === 'customers' && direction === 'inbound') {
        // Sync customers from Square
        await rateLimiterService.waitIfNeeded('square', venueId, 'customers');
        const customers = await squareSyncService.syncCustomersFromSquare(venueId);
        recordsProcessed = customers.length;
        recordsSucceeded = customers.length;
        console.log(`✅ Synced ${customers.length} customers from Square`);
      } else if (syncType === 'orders' && direction === 'inbound') {
        // Sync orders from Square
        const orders = await squareSyncService.syncOrdersFromSquare(venueId);
        recordsProcessed = orders.length;
        recordsSucceeded = orders.length;
        console.log(`✅ Synced ${orders.length} orders from Square`);
      } else if (syncType === 'catalog' && direction === 'inbound') {
        // Sync catalog items from Square
        const catalogItems = await squareSyncService.searchCatalogObjects(venueId, ['ITEM']);
        recordsProcessed = catalogItems.length;
        recordsSucceeded = catalogItems.length;
        console.log(`✅ Synced ${catalogItems.length} catalog items from Square`);
      } else if (syncType === 'payments' && direction === 'inbound') {
        // Sync payments from Square
        const payments = await squareSyncService.getPayments(venueId);
        recordsProcessed = payments.length;
        recordsSucceeded = payments.length;
        console.log(`✅ Synced ${payments.length} payments from Square`);
      } else {
        throw new Error(`Unsupported Square sync type/direction: ${syncType}/${direction}`);
      }

      return {
        success: true,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Square sync failed:', error);
      return {
        success: false,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed: recordsProcessed - recordsSucceeded,
        errors: [{
          record: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Mailchimp sync
   */
  private async executeMailchimpSync(job: any, credentials: any): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsSucceeded = 0;
    let recordsFailed = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      const venueId = job.venue_id;
      const syncType = job.sync_type.toLowerCase();
      const direction = job.direction;

      if (syncType === 'contacts' && direction === 'inbound') {
        // Sync contacts from Mailchimp
        await rateLimiterService.waitIfNeeded('mailchimp', venueId, 'contacts');
        const listId = job.metadata?.listId || 'default';
        const contacts = await mailchimpSyncService.syncContactsFromMailchimp(venueId, listId);
        recordsProcessed = contacts.length;
        recordsSucceeded = contacts.length;
        console.log(`✅ Synced ${contacts.length} contacts from Mailchimp`);
      } else if (syncType === 'contacts' && direction === 'outbound') {
        // Sync contacts to Mailchimp
        const listId = job.metadata?.listId || 'default';
        const contacts = job.metadata?.contacts || [];
        const result = await mailchimpSyncService.syncContactsToMailchimp(venueId, listId, contacts);
        recordsProcessed = result.contactsSynced;
        recordsSucceeded = result.contactsSynced - result.errors.length;
        recordsFailed = result.errors.length;
        // Map Mailchimp errors to sync engine format
        errors.push(...result.errors.map(e => ({ record: e.contact, error: e.error })));
        console.log(`✅ Synced ${recordsSucceeded} contacts to Mailchimp`);
      } else if (syncType === 'lists' && direction === 'inbound') {
        // Get Mailchimp lists
        const lists = await mailchimpSyncService.getLists(venueId);
        recordsProcessed = lists.length;
        recordsSucceeded = lists.length;
        console.log(`✅ Retrieved ${lists.length} lists from Mailchimp`);
      } else {
        throw new Error(`Unsupported Mailchimp sync type/direction: ${syncType}/${direction}`);
      }

      return {
        success: recordsFailed === 0,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Mailchimp sync failed:', error);
      return {
        success: false,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed: recordsProcessed - recordsSucceeded,
        errors: [{
          record: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute QuickBooks sync
   */
  private async executeQuickBooksSync(job: any, credentials: any): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsSucceeded = 0;
    let recordsFailed = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      const venueId = job.venue_id;
      const syncType = job.sync_type.toLowerCase();
      const direction = job.direction;

      if (syncType === 'customers' && direction === 'inbound') {
        // Sync customers from QuickBooks
        await rateLimiterService.waitIfNeeded('quickbooks', venueId, 'customers');
        const customers = await quickbooksSyncService.syncCustomersFromQuickBooks(venueId);
        recordsProcessed = customers.length;
        recordsSucceeded = customers.length;
        console.log(`✅ Synced ${customers.length} customers from QuickBooks`);
      } else if (syncType === 'customers' && direction === 'outbound') {
        // Sync customers to QuickBooks
        const customers = job.metadata?.customers || [];
        const result = await quickbooksSyncService.syncCustomersToQuickBooks(venueId, customers);
        recordsProcessed = result.recordsSynced;
        recordsSucceeded = result.recordsSynced - result.errors.length;
        recordsFailed = result.errors.length;
        errors.push(...result.errors);
        console.log(`✅ Synced ${recordsSucceeded} customers to QuickBooks`);
      } else if (syncType === 'invoices' && direction === 'inbound') {
        // Sync invoices from QuickBooks
        const invoices = await quickbooksSyncService.syncInvoicesFromQuickBooks(venueId);
        recordsProcessed = invoices.length;
        recordsSucceeded = invoices.length;
        console.log(`✅ Synced ${invoices.length} invoices from QuickBooks`);
      } else {
        throw new Error(`Unsupported QuickBooks sync type/direction: ${syncType}/${direction}`);
      }

      return {
        success: recordsFailed === 0,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('QuickBooks sync failed:', error);
      return {
        success: false,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed: recordsProcessed - recordsSucceeded,
        errors: [{
          record: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Log sync completion to sync_logs table
   */
  private async logSyncCompletion(
    job: any,
    recordsProcessed: number,
    recordsSucceeded: number,
    recordsFailed: number,
    errors: Array<{ record: any; error: string }>,
    duration: number
  ): Promise<void> {
    try {
      await db('sync_logs').insert({
        venue_id: job.venue_id,
        integration_type: job.integration_type,
        sync_type: job.sync_type,
        direction: job.direction,
        status: recordsFailed === 0 ? 'success' : 'partial_failure',
        started_at: job.started_at,
        completed_at: new Date(),
        duration_ms: duration,
        success_count: recordsSucceeded,
        error_count: recordsFailed,
        skip_count: 0,
        errors: JSON.stringify(errors),
        triggered_by: 'system',
        metadata: job.metadata || {},
      });
    } catch (error) {
      console.error('Failed to log sync completion:', error);
      // Don't throw - logging failure shouldn't fail the sync
    }
  }

  /**
   * Get pending sync jobs
   */
  async getPendingSyncJobs(limit: number = 10): Promise<any[]> {
    try {
      const jobs = await db('sync_queue')
        .where('status', 'pending')
        .where('scheduled_for', '<=', new Date())
        .orderBy('priority', 'desc')
        .orderBy('scheduled_for', 'asc')
        .limit(limit);

      return jobs;
    } catch (error) {
      console.error('Failed to get pending sync jobs:', error);
      throw new Error(`Failed to get pending sync jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retry failed sync jobs
   */
  async retryFailedSync(jobId: string): Promise<void> {
    try {
      const job = await db('sync_queue')
        .where({ id: jobId })
        .first();

      if (!job) {
        throw new Error(`Sync job ${jobId} not found`);
      }

      if (job.attempts >= job.max_attempts) {
        throw new Error(`Sync job ${jobId} has exceeded max retry attempts`);
      }

      // Reset job status
      await db('sync_queue')
        .where({ id: jobId })
        .update({
          status: 'pending',
          scheduled_for: new Date(),
        });

      console.log(`✅ Sync job ${jobId} queued for retry`);
    } catch (error) {
      console.error('Failed to retry sync job:', error);
      throw new Error(`Failed to retry sync job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel a pending sync job
   */
  async cancelSync(jobId: string): Promise<void> {
    try {
      await db('sync_queue')
        .where({ id: jobId })
        .update({
          status: 'cancelled',
          completed_at: new Date(),
        });

      console.log(`✅ Sync job ${jobId} cancelled`);
    } catch (error) {
      console.error('Failed to cancel sync job:', error);
      throw new Error(`Failed to cancel sync job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get sync history for a venue
   */
  async getSyncHistory(
    venueId: string,
    integrationType?: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      let query = db('sync_logs')
        .where('venue_id', venueId);

      if (integrationType) {
        query = query.where('integration_type', integrationType);
      }

      const history = await query
        .orderBy('started_at', 'desc')
        .limit(limit);

      return history;
    } catch (error) {
      console.error('Failed to get sync history:', error);
      throw new Error(`Failed to get sync history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const syncEngineService = new SyncEngineService();
