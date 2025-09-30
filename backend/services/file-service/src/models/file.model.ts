import { getPool } from '../config/database.config';
import { FileRecord, FileStatus } from '../types/file.types';
import { logger } from '../utils/logger';

export class FileModel {
  async create(data: Partial<FileRecord>): Promise<FileRecord> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      INSERT INTO files (
        filename, original_filename, mime_type, extension,
        storage_provider, bucket_name, storage_path, cdn_url,
        size_bytes, hash_sha256, uploaded_by, entity_type, entity_id,
        is_public, access_level, status, metadata, tags
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *
    `;

    const values = [
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
      logger.error('Failed to create file record:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<FileRecord | null> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToFile(result.rows[0]);
  }

  async updateStatus(id: string, status: FileStatus, error?: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET status = $2, processing_error = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [id, status, error]);
  }

  async updateCdnUrl(id: string, cdnUrl: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET cdn_url = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [id, cdnUrl]);
  }

  async findByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      SELECT * FROM files
      WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [entityType, entityId]);
    return result.rows.map(row => this.mapRowToFile(row));
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
