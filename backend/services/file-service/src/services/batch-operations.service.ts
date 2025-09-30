import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import archiver from 'archiver';
import { Readable } from 'stream';

export class BatchOperationsService {
  async batchDelete(fileIds: string[]): Promise<{ deleted: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let deleted = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId);
        if (file) {
          // Delete from storage
          await storageService.delete(file.storagePath).catch(() => {});
          
          // Soft delete in database
          await pool.query(
            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
            [fileId]
          );
          
          deleted++;
        }
      } catch (error) {
        logger.error(`Failed to delete file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { deleted, failed };
  }
  
  async batchMove(
    fileIds: string[],
    newEntityType: string,
    newEntityId: string
  ): Promise<{ moved: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let moved = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        await pool.query(
          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3',
          [newEntityType, newEntityId, fileId]
        );
        moved++;
      } catch (error) {
        logger.error(`Failed to move file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { moved, failed };
  }
  
  async batchTag(fileIds: string[], tags: string[]): Promise<{ tagged: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let tagged = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        await pool.query(
          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2',
          [tags, fileId]
        );
        tagged++;
      } catch (error) {
        logger.error(`Failed to tag file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { tagged, failed };
  }
  
  async batchDownload(fileIds: string[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        
        for (const fileId of fileIds) {
          const file = await fileModel.findById(fileId);
          if (file) {
            const buffer = await storageService.download(file.storagePath);
            archive.append(buffer, { name: file.filename });
          }
        }
        
        await archive.finalize();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async batchCopy(
    fileIds: string[],
    targetEntityType: string,
    targetEntityId: string
  ): Promise<{ copied: number; failed: number }> {
    let copied = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId);
        if (file) {
          const buffer = await storageService.download(file.storagePath);
          
          // Create new file record
          const { uploadService } = await import('./upload.service');
          await uploadService.uploadFile(
            buffer,
            file.filename,
            file.mimeType,
            file.uploadedBy,
            {
              entityType: targetEntityType,
              entityId: targetEntityId,
              metadata: file.metadata,
              tags: file.tags
            }
          );
          
          copied++;
        }
      } catch (error) {
        logger.error(`Failed to copy file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { copied, failed };
  }
}

export const batchOperationsService = new BatchOperationsService();
