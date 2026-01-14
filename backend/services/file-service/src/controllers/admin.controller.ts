import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { auditService } from '@tickettoken/shared';

export class AdminController {
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Log admin action
      await auditService.logAdminAction(
        'file-service',
        'admin.getStats',
        (request as any).user?.id || 'system',
        'statistics',
        {
          actionType: 'ACCESS',
          userRole: (request as any).user?.role,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      // Get file statistics
      const stats = await pool.query(`
        SELECT
          COUNT(*) as total_files,
          SUM(size_bytes) as total_bytes,
          COUNT(DISTINCT uploaded_by) as unique_users,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          COUNT(CASE WHEN mime_type LIKE 'image/%' THEN 1 END) as images,
          COUNT(CASE WHEN mime_type LIKE 'video/%' THEN 1 END) as videos,
          COUNT(CASE WHEN mime_type LIKE '%pdf%' THEN 1 END) as pdfs
        FROM files
        WHERE deleted_at IS NULL
      `);

      // Get storage usage by entity
      const entityStats = await pool.query(`
        SELECT
          entity_type,
          COUNT(*) as file_count,
          SUM(size_bytes) as total_bytes
        FROM files
        WHERE deleted_at IS NULL AND entity_type IS NOT NULL
        GROUP BY entity_type
      `);

      // Get recent uploads
      const recentUploads = await pool.query(`
        SELECT id, filename, mime_type, size_bytes, created_at
        FROM files
        ORDER BY created_at DESC
        LIMIT 10
      `);

      reply.send({
        overview: stats.rows[0],
        byEntity: entityStats.rows,
        recentFiles: recentUploads.rows
      });

    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get stats');
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.getStats',
        (request as any).user?.id || 'system',
        'statistics',
        {
          actionType: 'ACCESS',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Failed to get statistics' });
    }
  }

  async cleanupOrphaned(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Find orphaned files (in DB but not on disk)
      const files = await pool.query(`
        SELECT id, storage_path
        FROM files
        WHERE status = 'ready' AND deleted_at IS NULL
      `);

      let cleaned = 0;
      const cleanedFileIds: string[] = [];

      for (const file of files.rows) {
        const exists = await storageService.exists(file.storage_path);
        if (!exists) {
          // Mark as deleted if file doesn't exist
          await pool.query(
            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
            [file.id]
          );
          cleanedFileIds.push(file.id);
          cleaned++;
        }
      }

      // Clean up temp directory
      const tempDir = './temp';
      const tempFiles = await fs.readdir(tempDir).catch(() => []);
      const now = Date.now();
      const tempFilesCleaned: string[] = [];

      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);

        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          tempFilesCleaned.push(file);
          cleaned++;
        }
      }

      // Log admin cleanup action
      await auditService.logAdminAction(
        'file-service',
        'admin.cleanupOrphaned',
        (request as any).user?.id || 'system',
        'cleanup',
        {
          actionType: 'DELETE',
          userRole: (request as any).user?.role,
          metadata: {
            orphanedFiles: cleanedFileIds,
            tempFilesCleaned,
            totalCleaned: cleaned
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      reply.send({
        success: true,
        orphanedFiles: cleaned,
        tempFilesCleaned: tempFiles.length
      });

    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Cleanup failed');
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.cleanupOrphaned',
        (request as any).user?.id || 'system',
        'cleanup',
        {
          actionType: 'DELETE',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Cleanup failed' });
    }
  }

  async bulkDelete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { fileIds } = request.body as { fileIds: string[] };

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return reply.status(400).send({ error: 'No file IDs provided' });
      }

      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Get file info before deletion for audit
      const filesBeforeDelete = await pool.query(
        'SELECT id, filename, size_bytes FROM files WHERE id = ANY($1)',
        [fileIds]
      );

      // Soft delete files
      const result = await pool.query(
        'UPDATE files SET deleted_at = NOW() WHERE id = ANY($1) RETURNING id',
        [fileIds]
      );

      // Log bulk delete action
      await auditService.logAdminAction(
        'file-service',
        'admin.bulkDelete',
        (request as any).user?.id || 'system',
        'files',
        {
          actionType: 'DELETE',
          userRole: (request as any).user?.role,
          previousValue: filesBeforeDelete.rows,
          metadata: {
            requestedFileIds: fileIds,
            deletedCount: result.rowCount,
            deletedFileIds: result.rows.map((r: any) => r.id)
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      reply.send({
        success: true,
        deleted: result.rowCount
      });

    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Bulk delete failed');
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.bulkDelete',
        (request as any).user?.id || 'system',
        'files',
        {
          actionType: 'DELETE',
          success: false,
          metadata: {
            requestedFileIds: (request.body as any).fileIds
          },
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Bulk delete failed' });
    }
  }

  // New endpoint to view audit logs
  async getAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as any;
      
      // Log audit log access
      await auditService.logAdminAction(
        'file-service',
        'admin.getAuditLogs',
        (request as any).user?.id || 'system',
        'audit_logs',
        {
          actionType: 'ACCESS',
          userRole: (request as any).user?.role,
          metadata: { query }
        }
      );

      const logs = await auditService.getAuditLogs({
        service: query.service || 'file-service',
        userId: query.userId,
        resourceType: query.resourceType,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: parseInt(query.limit) || 50,
        offset: parseInt(query.offset) || 0
      });

      reply.send({
        success: true,
        logs,
        count: logs.length
      });

    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get audit logs');
      reply.status(500).send({ error: 'Failed to get audit logs' });
    }
  }
}

export const adminController = new AdminController();
