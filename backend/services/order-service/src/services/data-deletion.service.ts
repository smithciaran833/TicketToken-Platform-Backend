/**
 * Data Deletion Service
 * 
 * Implements GDPR Article 17 - Right to Erasure
 * Handles user data deletion and anonymization requests
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  DataDeletionRequest,
  DataDeletionRequestStatus,
  DeletionStrategy,
  CreateDataDeletionRequestDto,
  IDataDeletionService,
} from '../types/privacy.types';
import { logger } from '../utils/logger';

export class DataDeletionService implements IDataDeletionService {
  private readonly RETENTION_PERIOD_DAYS = 2555; // 7 years for financial records
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new data deletion request
   */
  async createDeletionRequest(
    userId: string,
    tenantId: string,
    dto: CreateDataDeletionRequestDto
  ): Promise<DataDeletionRequest> {
    // Check for existing pending request
    const existingResult = await this.pool.query(
      `SELECT * FROM data_deletion_requests 
       WHERE user_id = $1 AND tenant_id = $2 
       AND status IN ($3, $4)
       LIMIT 1`,
      [userId, tenantId, DataDeletionRequestStatus.PENDING, DataDeletionRequestStatus.IN_PROGRESS]
    );

    if (existingResult.rows.length > 0) {
      throw new Error('You already have a pending data deletion request.');
    }

    const id = uuidv4();
    const requestedAt = new Date();

    await this.pool.query(
      `INSERT INTO data_deletion_requests (
        id, tenant_id, user_id, email, status, strategy, reason, 
        requested_at, records_deleted, records_anonymized
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        tenantId,
        userId,
        '', // Will be populated from user service
        DataDeletionRequestStatus.PENDING,
        dto.strategy || DeletionStrategy.ANONYMIZE,
        dto.reason,
        requestedAt,
        0,
        0
      ]
    );

    logger.info('Data deletion request created', { requestId: id, userId, tenantId });

    return {
      id,
      tenant_id: tenantId,
      user_id: userId,
      email: '',
      status: DataDeletionRequestStatus.PENDING,
      strategy: dto.strategy || DeletionStrategy.ANONYMIZE,
      reason: dto.reason,
      requested_at: requestedAt,
      records_deleted: 0,
      records_anonymized: 0,
    } as DataDeletionRequest;
  }

  /**
   * Get a data deletion request by ID
   */
  async getDeletionRequest(requestId: string, userId: string): Promise<DataDeletionRequest> {
    const result = await this.pool.query(
      `SELECT * FROM data_deletion_requests WHERE id = $1 AND user_id = $2`,
      [requestId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Data deletion request not found');
    }

    return result.rows[0] as DataDeletionRequest;
  }

  /**
   * Process a data deletion request
   */
  async processDeletionRequest(requestId: string): Promise<void> {
    const requestResult = await this.pool.query(
      `SELECT * FROM data_deletion_requests WHERE id = $1`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('Data deletion request not found');
    }

    const request = requestResult.rows[0];

    if (request.status !== DataDeletionRequestStatus.PENDING) {
      throw new Error(`Request is not in PENDING status: ${request.status}`);
    }

    try {
      // Update status to IN_PROGRESS
      await this.pool.query(
        `UPDATE data_deletion_requests 
         SET status = $1, started_at = $2 
         WHERE id = $3`,
        [DataDeletionRequestStatus.IN_PROGRESS, new Date(), requestId]
      );

      let totalDeleted = 0;
      let totalAnonymized = 0;
      const tablesAffected: string[] = [];

      // Process based on strategy
      if (request.strategy === DeletionStrategy.ANONYMIZE) {
        totalAnonymized = await this.anonymizeUserData(request.user_id, request.tenant_id);
      } else if (request.strategy === DeletionStrategy.HARD_DELETE) {
        totalDeleted = await this.hardDeleteUserData(request.user_id, request.tenant_id);
      } else if (request.strategy === DeletionStrategy.SOFT_DELETE) {
        // Soft delete - mark records as deleted
        totalDeleted = await this.softDeleteUserData(request.user_id, request.tenant_id);
      }

      // Update request with completion info
      await this.pool.query(
        `UPDATE data_deletion_requests 
         SET status = $1, completed_at = $2, records_deleted = $3, 
             records_anonymized = $4, tables_affected = $5 
         WHERE id = $6`,
        [
          DataDeletionRequestStatus.COMPLETED,
          new Date(),
          totalDeleted,
          totalAnonymized,
          JSON.stringify(tablesAffected),
          requestId
        ]
      );

      logger.info('Data deletion request completed', {
        requestId,
        userId: request.user_id,
        deleted: totalDeleted,
        anonymized: totalAnonymized,
      });

    } catch (error) {
      // Update request with error
      await this.pool.query(
        `UPDATE data_deletion_requests 
         SET status = $1, rejected_reason = $2 
         WHERE id = $3`,
        [
          DataDeletionRequestStatus.FAILED,
          error instanceof Error ? error.message : 'Unknown error',
          requestId
        ]
      );

      logger.error('Failed to process data deletion request', {
        requestId,
        error,
      });

      throw error;
    }
  }

  /**
   * Anonymize user data
   */
  async anonymizeUserData(userId: string, tenantId: string): Promise<number> {
    let totalAnonymized = 0;

    const anonymizedEmail = `deleted_${crypto.randomBytes(8).toString('hex')}@anon.local`;
    const anonymizedName = `Deleted User ${crypto.randomBytes(4).toString('hex')}`;

    // Anonymize payment methods
    const paymentMethodsResult = await this.pool.query(
      `SELECT id FROM payment_methods WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    for (const pm of paymentMethodsResult.rows) {
      await this.pool.query(
        `UPDATE payment_methods 
         SET last_four = $1, card_brand = $2, billing_address = NULL, 
             billing_city = NULL, billing_state = NULL, billing_zip = NULL, 
             billing_country = NULL 
         WHERE id = $3`,
        ['0000', 'DELETED', pm.id]
      );

      await this.logDeletion(userId, 'payment_methods', pm.id, 'ANONYMIZED');
      totalAnonymized++;
    }

    // Anonymize customer interactions
    const interactionsResult = await this.pool.query(
      `SELECT id FROM customer_interactions WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    for (const interaction of interactionsResult.rows) {
      await this.pool.query(
        `UPDATE customer_interactions 
         SET contact_email = $1, contact_phone = NULL, notes = $2 
         WHERE id = $3`,
        [anonymizedEmail, 'User data deleted per GDPR request', interaction.id]
      );

      await this.logDeletion(userId, 'customer_interactions', interaction.id, 'ANONYMIZED');
      totalAnonymized++;
    }

    // Anonymize notification preferences
    const prefCountResult = await this.pool.query(
      `UPDATE notification_preferences 
       SET email = $1, phone = NULL 
       WHERE user_id = $2 AND tenant_id = $3`,
      [anonymizedEmail, userId, tenantId]
    );

    totalAnonymized += prefCountResult.rowCount || 0;

    logger.info('User data anonymized', {
      userId,
      tenantId,
      totalAnonymized,
    });

    return totalAnonymized;
  }

  /**
   * Hard delete user data
   */
  async hardDeleteUserData(userId: string, tenantId: string): Promise<number> {
    let totalDeleted = 0;

    // Check for retention requirements
    const retentionDate = new Date(Date.now() - this.RETENTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const hasRecentOrdersResult = await this.pool.query(
      `SELECT id FROM orders 
       WHERE user_id = $1 AND tenant_id = $2 AND created_at > $3 
       LIMIT 1`,
      [userId, tenantId, retentionDate]
    );

    if (hasRecentOrdersResult.rows.length > 0) {
      throw new Error('Cannot hard delete: Financial records must be retained for 7 years');
    }

    // Delete customer interactions
    const interactionResult = await this.pool.query(
      `DELETE FROM customer_interactions WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    totalDeleted += interactionResult.rowCount || 0;

    // Delete notification preferences
    const prefResult = await this.pool.query(
      `DELETE FROM notification_preferences WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    totalDeleted += prefResult.rowCount || 0;

    // Delete payment methods
    const pmResult = await this.pool.query(
      `DELETE FROM payment_methods WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    totalDeleted += pmResult.rowCount || 0;

    logger.info('User data hard deleted', {
      userId,
      tenantId,
      totalDeleted,
    });

    return totalDeleted;
  }

  /**
   * Soft delete user data
   */
  private async softDeleteUserData(userId: string, tenantId: string): Promise<number> {
    let totalDeleted = 0;
    const deletedAt = new Date();

    // For tables that support soft delete, set deleted_at field
    const tables = [
      'customer_interactions',
      'notification_preferences',
      'payment_methods',
    ];

    for (const tableName of tables) {
      try {
        const result = await this.pool.query(
          `UPDATE ${tableName} 
           SET deleted_at = $1 
           WHERE user_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
          [deletedAt, userId, tenantId]
        );
        
        totalDeleted += result.rowCount || 0;
      } catch (error) {
        // Table might not have deleted_at column
        logger.warn(`Could not soft delete from ${tableName}`, { error });
      }
    }

    logger.info('User data soft deleted', {
      userId,
      tenantId,
      totalDeleted,
    });

    return totalDeleted;
  }

  /**
   * Log deletion action
   */
  private async logDeletion(
    userId: string,
    tableName: string,
    recordId: string,
    action: 'DELETED' | 'ANONYMIZED'
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO deletion_audit_log 
       (id, request_id, table_name, record_id, action, performed_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), userId, tableName, recordId, action, new Date()]
    );
  }
}
