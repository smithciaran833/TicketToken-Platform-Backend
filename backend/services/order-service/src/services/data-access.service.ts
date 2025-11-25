/**
 * Data Access Service
 * 
 * Implements GDPR Article 15 - Right to Access
 * Allows users to request and download all their personal data
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  DataAccessRequest,
  DataAccessRequestStatus,
  DataExportFormat,
  DataExportContent,
  UserDataExport,
  CreateDataAccessRequestDto,
  DataAccessAction,
  IDataAccessService,
} from '../types/privacy.types';
import { logger } from '../utils/logger';

export class DataAccessService implements IDataAccessService {
  private readonly DATA_EXPORT_DIR = process.env.DATA_EXPORT_DIR || '/tmp/data-exports';
  private readonly EXPORT_EXPIRY_DAYS = 30;
  private readonly MAX_EXPORT_SIZE_MB = 100;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new data access request
   */
  async createAccessRequest(
    userId: string,
    tenantId: string,
    dto: CreateDataAccessRequestDto
  ): Promise<DataAccessRequest> {
    // Check for existing pending request
    const existingResult = await this.pool.query(
      `SELECT * FROM data_access_requests 
       WHERE user_id = $1 AND tenant_id = $2 
       AND status IN ($3, $4)
       LIMIT 1`,
      [userId, tenantId, DataAccessRequestStatus.PENDING, DataAccessRequestStatus.IN_PROGRESS]
    );

    if (existingResult.rows.length > 0) {
      throw new Error('You already have a pending data access request. Please wait for it to complete.');
    }

    const id = uuidv4();
    const requestedAt = new Date();

    await this.pool.query(
      `INSERT INTO data_access_requests (
        id, tenant_id, user_id, email, format, status, requested_at, download_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        tenantId,
        userId,
        dto.email || '',
        dto.format || DataExportFormat.JSON,
        DataAccessRequestStatus.PENDING,
        requestedAt,
        0
      ]
    );

    // Log the request
    await this.logDataAccess(tenantId, userId, DataAccessAction.EXPORT_REQUESTED, id);

    logger.info('Data access request created', { requestId: id, userId, tenantId });

    return {
      id,
      tenant_id: tenantId,
      user_id: userId,
      email: dto.email || '',
      format: dto.format || DataExportFormat.JSON,
      status: DataAccessRequestStatus.PENDING,
      requested_at: requestedAt,
      download_count: 0,
    } as DataAccessRequest;
  }

  /**
   * Get a data access request by ID
   */
  async getAccessRequest(requestId: string, userId: string): Promise<DataAccessRequest> {
    const result = await this.pool.query(
      `SELECT * FROM data_access_requests WHERE id = $1 AND user_id = $2`,
      [requestId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Data access request not found');
    }

    return result.rows[0] as DataAccessRequest;
  }

  /**
   * Get all data access requests for a user
   */
  async getUserAccessRequests(userId: string, tenantId: string): Promise<DataAccessRequest[]> {
    const result = await this.pool.query(
      `SELECT * FROM data_access_requests 
       WHERE user_id = $1 AND tenant_id = $2 
       ORDER BY requested_at DESC`,
      [userId, tenantId]
    );

    return result.rows as DataAccessRequest[];
  }

  /**
   * Process a data access request and compile all user data
   */
  async processAccessRequest(requestId: string): Promise<UserDataExport> {
    const requestResult = await this.pool.query(
      `SELECT * FROM data_access_requests WHERE id = $1`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('Data access request not found');
    }

    const request = requestResult.rows[0];

    if (request.status !== DataAccessRequestStatus.PENDING) {
      throw new Error(`Request is not in PENDING status: ${request.status}`);
    }

    try {
      // Update status to IN_PROGRESS
      await this.pool.query(
        `UPDATE data_access_requests 
         SET status = $1, started_at = $2 
         WHERE id = $3`,
        [DataAccessRequestStatus.IN_PROGRESS, new Date(), requestId]
      );

      // Compile all user data
      const userDataExport = await this.compileUserData(
        request.user_id,
        request.tenant_id,
        request.format
      );

      // Generate download token
      const downloadToken = crypto.randomBytes(32).toString('hex');

      // Save export to file
      const filePath = await this.saveExportToFile(
        requestId,
        userDataExport,
        request.format
      );

      const fileStat = await fs.stat(filePath);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.EXPORT_EXPIRY_DAYS);

      // Update request with file info
      await this.pool.query(
        `UPDATE data_access_requests 
         SET status = $1, completed_at = $2, file_path = $3, 
             file_size_bytes = $4, download_token = $5, expires_at = $6 
         WHERE id = $7`,
        [
          DataAccessRequestStatus.COMPLETED,
          new Date(),
          filePath,
          fileStat.size.toString(),
          downloadToken,
          expiresAt,
          requestId
        ]
      );

      // Log export contents
      await this.logExportContents(requestId, userDataExport);

      logger.info('Data access request processed successfully', {
        requestId,
        userId: request.user_id,
        fileSize: fileStat.size,
      });

      return userDataExport;
    } catch (error) {
      // Update request with error
      await this.pool.query(
        `UPDATE data_access_requests 
         SET status = $1, error_message = $2, error_details = $3 
         WHERE id = $4`,
        [
          DataAccessRequestStatus.FAILED,
          error instanceof Error ? error.message : 'Unknown error',
          JSON.stringify({ error: String(error) }),
          requestId
        ]
      );

      logger.error('Failed to process data access request', {
        requestId,
        error,
      });

      throw error;
    }
  }

  /**
   * Download export file
   */
  async downloadExport(requestId: string, downloadToken: string): Promise<Buffer> {
    const result = await this.pool.query(
      `SELECT * FROM data_access_requests 
       WHERE id = $1 AND download_token = $2`,
      [requestId, downloadToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid download token');
    }

    const request = result.rows[0];

    if (request.status !== DataAccessRequestStatus.COMPLETED) {
      throw new Error('Export is not ready for download');
    }

    if (new Date() > new Date(request.expires_at)) {
      throw new Error('Download link has expired');
    }

    if (!request.file_path) {
      throw new Error('Export file not found');
    }

    // Increment download count
    await this.pool.query(
      `UPDATE data_access_requests SET download_count = download_count + 1 WHERE id = $1`,
      [requestId]
    );

    // Log download
    await this.logDataAccess(
      request.tenant_id,
      request.user_id,
      DataAccessAction.EXPORT_DOWNLOADED,
      requestId
    );

    // Read and return file
    return fs.readFile(request.file_path);
  }

  /**
   * Cleanup expired exports
   */
  async cleanupExpiredExports(): Promise<number> {
    const result = await this.pool.query(
      `SELECT id, file_path FROM data_access_requests 
       WHERE status = $1 AND expires_at < $2`,
      [DataAccessRequestStatus.COMPLETED, new Date()]
    );

    const expiredRequests = result.rows;
    let deletedCount = 0;

    for (const request of expiredRequests) {
      try {
        // Delete file
        if (request.file_path) {
          await fs.unlink(request.file_path).catch(() => {
            // File might already be deleted
          });
        }

        // Update status to EXPIRED
        await this.pool.query(
          `UPDATE data_access_requests 
           SET status = $1, file_path = NULL, download_token = NULL 
           WHERE id = $2`,
          [DataAccessRequestStatus.EXPIRED, request.id]
        );

        deletedCount++;
      } catch (error) {
        logger.error('Failed to cleanup expired export', {
          requestId: request.id,
          error,
        });
      }
    }

    logger.info('Cleaned up expired exports', { deletedCount });

    return deletedCount;
  }

  /**
   * Compile all user data from various tables
   */
  private async compileUserData(
    userId: string,
    tenantId: string,
    format: DataExportFormat
  ): Promise<UserDataExport> {
    const data: UserDataExport['data'] = {};
    let totalRecords = 0;
    const dataCategories: string[] = [];

    // Orders
    const ordersResult = await this.pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    const orders = ordersResult.rows;
    if (orders.length > 0) {
      data.orders = orders;
      totalRecords += orders.length;
      dataCategories.push('orders');
    }

    // Order Items
    const orderIds = orders.map(o => o.id);
    if (orderIds.length > 0) {
      const orderItemsResult = await this.pool.query(
        `SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      const orderItems = orderItemsResult.rows;
      if (orderItems.length > 0) {
        data.order_items = orderItems;
        totalRecords += orderItems.length;
        dataCategories.push('order_items');
      }
    }

    // Payments (from payment_methods table)
    const paymentMethodsResult = await this.pool.query(
      `SELECT id, payment_type, last_four, card_brand, expiry_month, expiry_year, is_default, created_at 
       FROM payment_methods 
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    const paymentMethods = paymentMethodsResult.rows;
    if (paymentMethods.length > 0) {
      data.payment_methods = paymentMethods;
      totalRecords += paymentMethods.length;
      dataCategories.push('payment_methods');
    }

    // Refunds
    if (orderIds.length > 0) {
      const refundsResult = await this.pool.query(
        `SELECT * FROM order_refunds WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      const refunds = refundsResult.rows;
      if (refunds.length > 0) {
        data.refunds = refunds;
        totalRecords += refunds.length;
        dataCategories.push('refunds');
      }
    }

    // Customer Notes
    if (orderIds.length > 0) {
      const notesResult = await this.pool.query(
        `SELECT * FROM order_notes WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      const notes = notesResult.rows;
      if (notes.length > 0) {
        data.notes = notes;
        totalRecords += notes.length;
        dataCategories.push('notes');
      }
    }

    // Customer Interactions
    const interactionsResult = await this.pool.query(
      `SELECT * FROM customer_interactions WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    const interactions = interactionsResult.rows;
    if (interactions.length > 0) {
      data.interactions = interactions;
      totalRecords += interactions.length;
      dataCategories.push('interactions');
    }

    // Notification Preferences
    const notificationPrefsResult = await this.pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    const notificationPrefs = notificationPrefsResult.rows;
    if (notificationPrefs.length > 0) {
      data.notification_preferences = notificationPrefs;
      totalRecords += notificationPrefs.length;
      dataCategories.push('notification_preferences');
    }

    // Fraud Scores (if any)
    if (orderIds.length > 0) {
      const fraudScoresResult = await this.pool.query(
        `SELECT * FROM fraud_scores WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      const fraudScores = fraudScoresResult.rows;
      if (fraudScores.length > 0) {
        data.fraud_scores = fraudScores;
        totalRecords += fraudScores.length;
        dataCategories.push('fraud_scores');
      }
    }

    // Calculate export size
    const exportSize = Buffer.byteLength(JSON.stringify(data));

    return {
      user_id: userId,
      email: '', // Will be populated from user service
      exported_at: new Date(),
      format,
      data,
      metadata: {
        total_records: totalRecords,
        data_categories: dataCategories,
        export_size_bytes: exportSize,
      },
    };
  }

  /**
   * Save export to file
   */
  private async saveExportToFile(
    requestId: string,
    userDataExport: UserDataExport,
    format: DataExportFormat
  ): Promise<string> {
    // Ensure export directory exists
    await fs.mkdir(this.DATA_EXPORT_DIR, { recursive: true });

    const filename = `export_${requestId}_${Date.now()}.${format.toLowerCase()}`;
    const filePath = path.join(this.DATA_EXPORT_DIR, filename);

    let content: string;

    switch (format) {
      case DataExportFormat.JSON:
        content = JSON.stringify(userDataExport, null, 2);
        break;
      case DataExportFormat.CSV:
        // Convert to CSV (simplified - would need proper CSV library in production)
        content = this.convertToCSV(userDataExport);
        break;
      case DataExportFormat.PDF:
        // Would need PDF library in production
        content = JSON.stringify(userDataExport, null, 2);
        break;
      default:
        content = JSON.stringify(userDataExport, null, 2);
    }

    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Convert data to CSV format (simplified)
   */
  private convertToCSV(userDataExport: UserDataExport): string {
    // This is a simplified implementation
    // In production, use a proper CSV library like 'csv-stringify'
    const lines: string[] = [];
    
    lines.push('# User Data Export');
    lines.push(`# User ID: ${userDataExport.user_id}`);
    lines.push(`# Exported At: ${userDataExport.exported_at}`);
    lines.push('');

    for (const [category, records] of Object.entries(userDataExport.data)) {
      if (Array.isArray(records) && records.length > 0) {
        lines.push(`## ${category}`);
        const headers = Object.keys(records[0]);
        lines.push(headers.join(','));
        
        for (const record of records) {
          const values = headers.map(h => {
            const val = record[h];
            return val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`;
          });
          lines.push(values.join(','));
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Log export contents for audit
   */
  private async logExportContents(
    requestId: string,
    userDataExport: UserDataExport
  ): Promise<void> {
    const contents = userDataExport.metadata.data_categories.map(
      (category) => {
        const recordCount = Array.isArray(userDataExport.data[category])
          ? userDataExport.data[category].length
          : 0;
        const fieldsIncluded = Array.isArray(userDataExport.data[category]) &&
          userDataExport.data[category].length > 0
          ? Object.keys(userDataExport.data[category][0])
          : [];

        return [
          uuidv4(),
          requestId,
          category,
          recordCount,
          category,
          JSON.stringify(fieldsIncluded)
        ];
      }
    );

    if (contents.length > 0) {
      const values = contents.map((_, i) => 
        `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
      ).join(', ');

      await this.pool.query(
        `INSERT INTO data_export_contents 
         (id, request_id, data_category, record_count, table_name, fields_included) 
         VALUES ${values}`,
        contents.flat()
      );
    }
  }

  /**
   * Log data access event
   */
  private async logDataAccess(
    tenantId: string,
    userId: string,
    action: DataAccessAction,
    requestId?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO data_access_audit_log 
       (id, tenant_id, user_id, action, request_id, accessed_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), tenantId, userId, action, requestId, new Date()]
    );
  }
}
