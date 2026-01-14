/**
 * File Model
 * 
 * AUDIT FIX: MT-2, MT-5 - Multi-tenant file queries
 * - All queries now include tenant_id filtering
 * - RLS provides defense in depth
 */

import { getPool } from '../config/database.config';
import { FileRecord, FileStatus } from '../types/file.types';
import { logger } from '../utils/logger';
import { TenantRequiredError, FileNotFoundError } from '../errors';

// =============================================================================
// Types
// =============================================================================

export interface FileCreateData extends Partial<FileRecord> {
  tenant_id?: string;
  tenantId?: string;
}

export interface FileQueryOptions {
  tenantId: string;
  includeDeleted?: boolean;
}

// =============================================================================
// File Model Class
// =============================================================================

export class FileModel {
  /**
   * AUDIT FIX: MT-2 - Create file with mandatory tenant_id
   */
  async create(data: FileCreateData, tenantId: string): Promise<FileRecord> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to create a file');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // AUDIT FIX: MT-2 - Include tenant_id in INSERT
    const query = `
      INSERT INTO files (
        tenant_id, filename, original_filename, mime_type, extension,
        storage_provider, bucket_name, storage_path, cdn_url,
        size_bytes, hash_sha256, uploaded_by, entity_type, entity_id,
        is_public, access_level, status, metadata, tags
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING *
    `;

    const values = [
      tenantId,
      data.filename || data.file_name,
      data.original_filename || data.originalFilename,
      data.mime_type || data.mimeType || data.content_type,
      data.extension,
      data.storage_provider || 'local',
      data.bucket_name,
      data.storage_path || data.storagePath || data.file_key,
      data.cdn_url || data.cdnUrl,
      data.size_bytes || data.sizeBytes || data.file_size,
      data.hash_sha256 || data.hashSha256,
      data.uploaded_by || data.uploadedBy || data.user_id,
      data.entity_type || data.entityType,
      data.entity_id || data.entityId,
      data.is_public !== undefined ? data.is_public : (data.isPublic || false),
      data.access_level || data.accessLevel || 'private',
      data.status || 'uploading',
      JSON.stringify(data.metadata || {}),
      data.tags || []
    ];

    try {
      const result = await pool.query(query, values);
      return this.mapRowToFile(result.rows[0]);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to create file record');
      throw error;
    }
  }

  /**
   * AUDIT FIX: MT-5 - Find file by ID with mandatory tenant_id
   * RLS provides defense in depth, but we also filter explicitly
   */
  async findById(id: string, tenantId: string): Promise<FileRecord | null> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to query files');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // AUDIT FIX: MT-5 - Include tenant_id in WHERE clause
    const query = 'SELECT * FROM files WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL';
    const result = await pool.query(query, [id, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToFile(result.rows[0]);
  }

  /**
   * AUDIT FIX: MT-5 - Update status with tenant_id filter
   */
  async updateStatus(id: string, tenantId: string, status: FileStatus, error?: string): Promise<void> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to update files');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // AUDIT FIX: MT-5 - Include tenant_id in WHERE clause
    const query = `
      UPDATE files
      SET status = $3, processing_error = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await pool.query(query, [id, tenantId, status, error]);
    
    if (result.rowCount === 0) {
      throw new FileNotFoundError(`File ${id} not found or access denied`);
    }
  }

  /**
   * AUDIT FIX: MT-5 - Update CDN URL with tenant_id filter
   */
  async updateCdnUrl(id: string, tenantId: string, cdnUrl: string): Promise<void> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to update files');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // AUDIT FIX: MT-5 - Include tenant_id in WHERE clause
    const query = `
      UPDATE files
      SET cdn_url = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await pool.query(query, [id, tenantId, cdnUrl]);
    
    if (result.rowCount === 0) {
      throw new FileNotFoundError(`File ${id} not found or access denied`);
    }
  }

  /**
   * AUDIT FIX: MT-5 - Find files by entity with mandatory tenant_id
   */
  async findByEntity(entityType: string, entityId: string, tenantId: string): Promise<FileRecord[]> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to query files');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // AUDIT FIX: MT-5 - Include tenant_id in WHERE clause
    const query = `
      SELECT * FROM files
      WHERE entity_type = $1 AND entity_id = $2 AND tenant_id = $3 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [entityType, entityId, tenantId]);
    return result.rows.map(row => this.mapRowToFile(row));
  }

  /**
   * AUDIT FIX: MT-5 - Soft delete with tenant_id filter
   */
  async softDelete(id: string, tenantId: string): Promise<void> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to delete files');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id, tenantId]);
    
    if (result.rowCount === 0) {
      throw new FileNotFoundError(`File ${id} not found or access denied`);
    }

    logger.info({ fileId: id, tenantId }, 'File soft deleted');
  }

  /**
   * AUDIT FIX: MT-5 - Find files by user within tenant
   */
  async findByUser(userId: string, tenantId: string, limit: number = 100): Promise<FileRecord[]> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to query files');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      SELECT * FROM files
      WHERE uploaded_by = $1 AND tenant_id = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const result = await pool.query(query, [userId, tenantId, limit]);
    return result.rows.map(row => this.mapRowToFile(row));
  }

  /**
   * Count files for a tenant (for quota checking)
   */
  async countByTenant(tenantId: string): Promise<{ count: number; totalBytes: number }> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required');
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes
      FROM files
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [tenantId]);
    return {
      count: parseInt(result.rows[0].count),
      totalBytes: parseInt(result.rows[0].total_bytes)
    };
  }

  private mapRowToFile(row: any): FileRecord {
    return {
      id: row.id,
      // Required snake_case properties
      filename: row.filename,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      extension: row.extension,
      storage_provider: row.storage_provider,
      bucket_name: row.bucket_name,
      storage_path: row.storage_path,
      cdn_url: row.cdn_url,
      size_bytes: parseInt(row.size_bytes),
      hash_sha256: row.hash_sha256,
      uploaded_by: row.uploaded_by,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      is_public: row.is_public,
      access_level: row.access_level,
      status: row.status,
      processing_error: row.processing_error,
      metadata: row.metadata || {},
      tags: row.tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      
      // Backwards compatibility aliases (camelCase)
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      cdnUrl: row.cdn_url,
      sizeBytes: parseInt(row.size_bytes),
      hashSha256: row.hash_sha256,
      uploadedBy: row.uploaded_by,
      entityType: row.entity_type,
      entityId: row.entity_id,
      isPublic: row.is_public,
      accessLevel: row.access_level,
      file_name: row.filename,
      file_key: row.storage_path,
      content_type: row.mime_type,
      file_size: parseInt(row.size_bytes),
      user_id: row.uploaded_by
    };
  }
}

export const fileModel = new FileModel();
