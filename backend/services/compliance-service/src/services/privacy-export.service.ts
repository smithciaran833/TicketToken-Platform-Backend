import { dbConfig } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';
import Knex from 'knex';

// Create Knex instance using the exported config
const db = Knex({
  client: 'pg',
  connection: dbConfig
});

interface UserDataExport {
  requestId: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PrivacyExportService {
  private exportPath = process.env.EXPORT_PATH || '/tmp/exports';

  /**
   * Get current tenant ID from request context
   */
  private getTenantId(): string {
    // TODO: Implement proper tenant context retrieval
    // For now, return a default - this should be properly implemented with tenant middleware
    return process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001';
  }

  /**
   * Request full data export for GDPR/CCPA compliance
   */
  async requestDataExport(userId: string, reason: string): Promise<UserDataExport> {
    try {
      const requestId = crypto.randomUUID();
      const tenantId = this.getTenantId();
      
      // Store export request
      await db('privacy_export_requests').insert({
        id: requestId,
        user_id: userId,
        tenant_id: tenantId,
        reason,
        status: 'pending',
        requested_at: new Date()
      });
      
      // Queue for processing (async)
      this.processExportAsync(requestId, userId);
      
      return {
        requestId,
        userId,
        requestedAt: new Date(),
        status: 'pending'
      };
      
    } catch (error) {
      logger.error({ error }, 'Failed to create export request');
      throw error;
    }
  }

  /**
   * Process data export asynchronously
   */
  private async processExportAsync(requestId: string, userId: string): Promise<void> {
    try {
      // Update status
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({ status: 'processing' });
      
      // Collect all user data
      const userData = await this.collectUserData(userId);
      
      // Create export file
      const exportFile = await this.createExportArchive(userId, userData);
      
      // Generate secure download URL
      const downloadUrl = await this.generateDownloadUrl(exportFile);
      
      // Update request
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'completed',
          completed_at: new Date(),
          download_url: downloadUrl,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
      
      // Send notification to user
      await this.notifyUserExportReady(userId, downloadUrl);
      
    } catch (error) {
      logger.error({ error }, 'Export processing failed');
      
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'failed',
          error_message: (error as Error).message
        });
    }
  }

  /**
   * Collect all user data from various tables
   */
  private async collectUserData(userId: string): Promise<any> {
    const data: any = {};
    
    // Profile data
    data.profile = await db('users')
      .where({ id: userId })
      .select('id', 'email', 'name', 'phone', 'created_at', 'last_login')
      .first();
    
    // Purchase history
    data.purchases = await db('orders')
      .where({ customer_id: userId })
      .select('id', 'event_id', 'ticket_count', 'total_amount', 'status', 'created_at');
    
    // Tickets owned
    data.tickets = await db('tickets')
      .where({ owner_id: userId })
      .select('id', 'event_id', 'seat_number', 'price', 'status', 'created_at');
    
    // NFTs
    data.nfts = await db('nft_mints')
      .where({ owner_address: userId })
      .select('mint_address', 'metadata', 'created_at');
    
    // Marketplace activity
    data.listings = await db('marketplace_listings')
      .where({ seller_id: userId })
      .orWhere({ buyer_id: userId })
      .select('id', 'ticket_id', 'price', 'status', 'created_at');
    
    // Payment methods (masked)
    data.paymentMethods = await db('payment_methods')
      .where({ user_id: userId })
      .select(
        'id',
        'type',
        db.raw('RIGHT(card_last4, 4) as last4'),
        'card_brand',
        'created_at'
      );
    
    // Notifications
    data.notifications = await db('notifications')
      .where({ recipient_id: userId })
      .select('id', 'type', 'channel', 'status', 'created_at');
    
    // Consent records
    data.consent = await db('consent')
      .where({ customer_id: userId })
      .select('channel', 'type', 'granted', 'granted_at', 'revoked_at');
    
    // Activity logs (last 90 days)
    data.activityLogs = await db('activity_logs')
      .where({ user_id: userId })
      .where('created_at', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .select('action', 'ip_address', 'user_agent', 'created_at')
      .limit(1000);
    
    return data;
  }

  /**
   * Create ZIP archive of user data
   */
  private async createExportArchive(userId: string, data: any): Promise<string> {
    const timestamp = Date.now();
    const filename = `user_data_export_${userId}_${timestamp}.zip`;
    const filepath = path.join(this.exportPath, filename);
    
    // Ensure export directory exists
    if (!fs.existsSync(this.exportPath)) {
      fs.mkdirSync(this.exportPath, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filepath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      output.on('close', () => {
        logger.info(`Export created: ${filepath} (${archive.pointer()} bytes)`);
        resolve(filepath);
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add JSON files
      archive.append(JSON.stringify(data.profile, null, 2), { name: 'profile.json' });
      archive.append(JSON.stringify(data.purchases, null, 2), { name: 'purchases.json' });
      archive.append(JSON.stringify(data.tickets, null, 2), { name: 'tickets.json' });
      archive.append(JSON.stringify(data.nfts, null, 2), { name: 'nfts.json' });
      archive.append(JSON.stringify(data.listings, null, 2), { name: 'marketplace.json' });
      archive.append(JSON.stringify(data.paymentMethods, null, 2), { name: 'payment_methods.json' });
      archive.append(JSON.stringify(data.notifications, null, 2), { name: 'notifications.json' });
      archive.append(JSON.stringify(data.consent, null, 2), { name: 'consent.json' });
      archive.append(JSON.stringify(data.activityLogs, null, 2), { name: 'activity_logs.json' });
      
      // Add README
      archive.append(this.generateReadme(userId), { name: 'README.txt' });
      
      archive.finalize();
    });
  }

  /**
   * Generate README for export
   */
  private generateReadme(userId: string): string {
    return `TicketToken Data Export
========================
User ID: ${userId}
Export Date: ${new Date().toISOString()}

This archive contains all personal data associated with your TicketToken account.

Files included:
- profile.json: Your account information
- purchases.json: Order history
- tickets.json: Tickets you own
- nfts.json: NFT tickets on blockchain
- marketplace.json: Marketplace activity
- payment_methods.json: Payment methods (masked)
- notifications.json: Notification history
- consent.json: Privacy consent records
- activity_logs.json: Recent account activity

This export is provided in compliance with GDPR Article 20 (Right to Data Portability)
and CCPA regulations.

For questions, contact: privacy@tickettoken.com`;
  }

  /**
   * Request account deletion
   * Updated to use gdpr_deletion_requests table
   */
  async requestAccountDeletion(userId: string, reason: string): Promise<any> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store deletion request (using gdpr_deletion_requests table)
      await db('gdpr_deletion_requests').insert({
        customer_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date()
      });
      
      // Send confirmation email
      await this.sendDeletionConfirmation(userId, requestId);
      
      return {
        requestId,
        message: 'Account deletion scheduled',
        scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        canCancelUntil: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
      };
      
    } catch (error) {
      logger.error({ error }, 'Failed to create deletion request');
      throw error;
    }
  }

  /**
   * Generate secure download URL
   */
  private async generateDownloadUrl(filepath: string): Promise<string> {
    // In production, would upload to S3 and return signed URL
    // For now, return local path
    return `/exports/${path.basename(filepath)}`;
  }

  /**
   * Notify user that export is ready
   */
  private async notifyUserExportReady(userId: string, downloadUrl: string): Promise<void> {
    // Would send email notification
    logger.info(`Export ready for user ${userId}: ${downloadUrl}`);
  }

  /**
   * Send deletion confirmation
   */
  private async sendDeletionConfirmation(userId: string, requestId: string): Promise<void> {
    // Would send email with cancellation link
    logger.info(`Deletion requested for user ${userId}: ${requestId}`);
  }
}

export const privacyExportService = new PrivacyExportService();
