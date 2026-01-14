import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import archiver from 'archiver';

export class BatchOperationsService {
  async batchDelete(fileIds: string[], tenantId: string): Promise<{ deleted: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    let deleted = 0;
    let failed = 0;

    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId, tenantId);
        if (file) {
          // Delete from storage
          if (file.storagePath) {
            await storageService.delete(file.storagePath).catch(() => {});
          }

          // Soft delete in database
          await fileModel.softDelete(fileId, tenantId);
          deleted++;
        }
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Failed to delete file');
        failed++;
      }
    }

    return { deleted, failed };
  }

  async batchMove(
    fileIds: string[],
    tenantId: string,
    newEntityType: string,
    newEntityId: string
  ): Promise<{ moved: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    let moved = 0;
    let failed = 0;

    for (const fileId of fileIds) {
      try {
        // Verify file belongs to tenant first
        const file = await fileModel.findById(fileId, tenantId);
        if (!file) {
          failed++;
          continue;
        }

        await pool.query(
          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3 AND tenant_id = $4',
          [newEntityType, newEntityId, fileId, tenantId]
        );
        moved++;
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Failed to move file');
        failed++;
      }
    }

    return { moved, failed };
  }

  async batchTag(fileIds: string[], tenantId: string, tags: string[]): Promise<{ tagged: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    let tagged = 0;
    let failed = 0;

    for (const fileId of fileIds) {
      try {
        // Verify file belongs to tenant first
        const file = await fileModel.findById(fileId, tenantId);
        if (!file) {
          failed++;
          continue;
        }

        await pool.query(
          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2 AND tenant_id = $3',
          [tags, fileId, tenantId]
        );
        tagged++;
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Failed to tag file');
        failed++;
      }
    }

    return { tagged, failed };
  }

  async batchDownload(fileIds: string[], tenantId: string): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];

        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);

        for (const fileId of fileIds) {
          const file = await fileModel.findById(fileId, tenantId);
          if (file && file.storagePath) {
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
    tenantId: string,
    targetEntityType: string,
    targetEntityId: string
  ): Promise<{ copied: number; failed: number }> {
    let copied = 0;
    let failed = 0;

    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId, tenantId);
        if (file && file.storagePath && file.mimeType) {
          const buffer = await storageService.download(file.storagePath);

          // Create new file record
          const { uploadService } = await import('./upload.service');
          await uploadService.uploadFile(
            buffer,
            file.filename,
            file.mimeType,
            file.uploadedBy || "system",
            tenantId,
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
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Failed to copy file');
        failed++;
      }
    }

    return { copied, failed };
  }
}

export const batchOperationsService = new BatchOperationsService();
