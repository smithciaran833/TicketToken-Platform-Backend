import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class CleanupService {
  async cleanupOrphanedFiles(): Promise<{ cleaned: number }> {
    const pool = getPool();
    if (!pool) return { cleaned: 0 };
    
    let cleaned = 0;
    
    // Find files marked as deleted
    const deletedFiles = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NOT NULL 
       AND deleted_at < NOW() - INTERVAL '7 days'`
    );
    
    for (const file of deletedFiles.rows) {
      try {
        // Delete from storage
        await storageService.delete(file.storage_path).catch(() => {});
        
        // Hard delete from database
        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
        
        cleaned++;
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId: file.id }, 'Failed to cleanup file');
      }
    }
    
    // Clean expired upload sessions
    await pool.query(
      `UPDATE upload_sessions 
       SET status = 'expired' 
       WHERE status = 'active' 
       AND expires_at < NOW()`
    );
    
    // Clean old access logs
    await pool.query(
      `DELETE FROM file_access_logs 
       WHERE accessed_at < NOW() - INTERVAL '90 days'`
    );
    
    return { cleaned };
  }
  
  async cleanupTempFiles(): Promise<{ cleaned: number }> {
    let cleaned = 0;
    const tempDir = './temp';
    
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          cleaned++;
        }
      }
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Temp cleanup failed');
    }
    
    return { cleaned };
  }
  
  async calculateStorageUsage(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Calculate usage by entity
    await pool.query(`
      INSERT INTO storage_usage (entity_type, entity_id, total_files, total_bytes, 
                                 image_bytes, document_bytes, video_bytes, other_bytes)
      SELECT 
        entity_type,
        entity_id,
        COUNT(*) as total_files,
        SUM(size_bytes) as total_bytes,
        SUM(CASE WHEN mime_type LIKE 'image/%' THEN size_bytes ELSE 0 END) as image_bytes,
        SUM(CASE WHEN mime_type LIKE '%pdf%' OR mime_type LIKE '%document%' THEN size_bytes ELSE 0 END) as document_bytes,
        SUM(CASE WHEN mime_type LIKE 'video/%' THEN size_bytes ELSE 0 END) as video_bytes,
        SUM(CASE WHEN mime_type NOT LIKE 'image/%' 
                 AND mime_type NOT LIKE 'video/%' 
                 AND mime_type NOT LIKE '%pdf%' 
                 AND mime_type NOT LIKE '%document%' THEN size_bytes ELSE 0 END) as other_bytes
      FROM files
      WHERE deleted_at IS NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
      GROUP BY entity_type, entity_id
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        total_files = EXCLUDED.total_files,
        total_bytes = EXCLUDED.total_bytes,
        image_bytes = EXCLUDED.image_bytes,
        document_bytes = EXCLUDED.document_bytes,
        video_bytes = EXCLUDED.video_bytes,
        other_bytes = EXCLUDED.other_bytes,
        calculated_at = NOW()
    `);
    
    logger.info('Storage usage calculated');
  }
  
  async enforceStorageLimits(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Check entities exceeding limits
    const result = await pool.query(`
      SELECT su.*, su.total_bytes > su.max_bytes as exceeds_limit
      FROM storage_usage su
      WHERE su.max_bytes IS NOT NULL
      AND su.total_bytes > su.max_bytes
    `);
    
    for (const entity of result.rows) {
      logger.warn({ entityType: entity.entity_type, entityId: entity.entity_id, totalBytes: entity.total_bytes, maxBytes: entity.max_bytes }, 'Entity exceeds storage limit');
      // Could implement automatic cleanup or notifications here
    }
  }
}

export const cleanupService = new CleanupService();
