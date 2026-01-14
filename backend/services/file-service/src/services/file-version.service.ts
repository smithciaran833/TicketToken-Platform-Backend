import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { fileModel } from '../models/file.model';
import { generateFileHash } from '../utils/file-helpers';
import { logger } from '../utils/logger';

export class FileVersionService {
  async createVersion(
    fileId: string,
    tenantId: string,
    buffer: Buffer,
    changeDescription?: string,
    userId?: string
  ): Promise<number> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // Get current file
    const file = await fileModel.findById(fileId, tenantId);
    if (!file) {
      throw new Error('File not found');
    }

    if (!file.storagePath) {
      throw new Error('File has no storage path');
    }

    // Get latest version number
    const versionResult = await pool.query(
      'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
      [fileId]
    );

    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

    // Save new version
    const versionPath = file.storagePath.replace(/\.[^.]+$/, `_v${nextVersion}$&`);
    await storageService.upload(buffer, versionPath);

    // Create version record
    await pool.query(
      `INSERT INTO file_versions
       (file_id, version_number, storage_path, size_bytes, hash_sha256, change_description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fileId, nextVersion, versionPath, buffer.length, generateFileHash(buffer), changeDescription, userId]
    );

    logger.info(`Created version ${nextVersion} for file ${fileId}`);

    return nextVersion;
  }

  async getVersions(fileId: string, tenantId: string): Promise<any[]> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // Verify file belongs to tenant
    const file = await fileModel.findById(fileId, tenantId);
    if (!file) {
      throw new Error('File not found');
    }

    const result = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC',
      [fileId]
    );

    return result.rows;
  }

  async restoreVersion(fileId: string, tenantId: string, versionNumber: number): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // Get version
    const versionResult = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );

    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }

    const version = versionResult.rows[0];

    // Get file (also verifies tenant access)
    const file = await fileModel.findById(fileId, tenantId);
    if (!file) {
      throw new Error('File not found');
    }

    if (!file.storagePath) {
      throw new Error('File has no storage path');
    }

    // Copy version to main file
    const buffer = await storageService.download(version.storage_path);
    await storageService.upload(buffer, file.storagePath);

    // Update file record
    await pool.query(
      'UPDATE files SET size_bytes = $1, hash_sha256 = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
      [version.size_bytes, version.hash_sha256, fileId, tenantId]
    );

    logger.info(`Restored version ${versionNumber} for file ${fileId}`);
  }

  async deleteVersion(fileId: string, tenantId: string, versionNumber: number): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    // Verify file belongs to tenant
    const file = await fileModel.findById(fileId, tenantId);
    if (!file) {
      throw new Error('File not found');
    }

    // Get version
    const versionResult = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );

    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }

    const version = versionResult.rows[0];

    // Delete from storage
    await storageService.delete(version.storage_path);

    // Delete record
    await pool.query(
      'DELETE FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );

    logger.info(`Deleted version ${versionNumber} for file ${fileId}`);
  }
}

export const fileVersionService = new FileVersionService();
