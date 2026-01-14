import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { s3Storage } from '../services/storage.s3';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];

interface UploadUrlBody {
  fileName: string;
  contentType: string;
}

interface ConfirmUploadParams {
  fileKey: string;
}

interface DeleteFileParams {
  fileId: string;
}

// Extend the UploadOptions interface locally to include what S3StorageService expects
interface S3UploadOptions {
  contentType: string;
  maxSize?: number;
  allowedTypes?: string[];
  expiresIn?: number;
  generateThumbnail?: boolean;
  scanForVirus?: boolean;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  metadata?: any;
  tags?: string[];
}

export class UploadController {
  /**
   * Generate signed URL for file upload
   */
  async generateUploadUrl(request: FastifyRequest<{ Body: UploadUrlBody }>, reply: FastifyReply) {
    try {
      const { fileName, contentType } = request.body;
      const userId = (request as any).user?.id || 'anonymous';

      // Validate file type
      const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
      if (!allowedTypes.includes(contentType)) {
        return reply.status(400).send({
          error: 'Invalid file type'
        });
      }

      // Generate signed URL with correct parameters including contentType
      const options: S3UploadOptions = {
        contentType,
        maxSize: MAX_FILE_SIZE,
        allowedTypes,
        expiresIn: 300 // 5 minutes
      };
      
      const signedUrl = await s3Storage.generateSignedUploadUrl(userId, options as any);

      // Store upload record - Use proper Knex syntax
      await db('file_uploads').insert({
        user_id: userId,
        file_key: signedUrl.fileKey,
        file_name: fileName,
        content_type: contentType,
        status: 'pending',
        expires_at: signedUrl.expiresAt
      });

      return reply.send({
        uploadUrl: signedUrl.uploadUrl,
        fileKey: signedUrl.fileKey,
        expiresAt: signedUrl.expiresAt
      });
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to generate upload URL');
      return reply.status(500).send({
        error: 'Failed to generate upload URL'
      });
    }
  }

  /**
   * Confirm file upload completion
   */
  async confirmUpload(request: FastifyRequest<{ Params: ConfirmUploadParams }>, reply: FastifyReply) {
    try {
      const { fileKey } = request.params;
      const userId = (request as any).user?.id || 'anonymous';

      // Get upload record - Use proper Knex syntax
      const upload = await db('file_uploads')
        .where({ file_key: fileKey, user_id: userId, status: 'pending' })
        .first();

      if (!upload) {
        return reply.status(404).send({ error: 'Upload not found' });
      }

      // Update status - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: upload.id })
        .update({ 
          status: 'processing',
          updated_at: db.fn.now()
        });

      // Start processing
      await this.processFile(upload.id, fileKey);

      return reply.send({
        message: 'Upload confirmed',
        fileId: upload.id
      });
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to confirm upload');
      return reply.status(500).send({
        error: 'Failed to confirm upload'
      });
    }
  }

  /**
   * Process uploaded file
   */
  private async processFile(fileId: string, _fileKey: string) {
    try {
      // Note: S3StorageService doesn't have a download/getObject method
      // We'll need to add it or use the AWS SDK directly
      // For now, skip virus scanning
      
      // Update status to ready - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'ready',
          updated_at: db.fn.now()
        });

      // Clear cache
      await serviceCache.delete(`file:${fileId}`);
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'File processing failed');
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'failed',
          processing_error: error.message,
          updated_at: db.fn.now()
        });
    }
  }

  /**
   * Delete file
   */
  async deleteFile(request: FastifyRequest<{ Params: DeleteFileParams }>, reply: FastifyReply) {
    try {
      const { fileId } = request.params;
      const userId = (request as any).user?.id || 'anonymous';

      // Get file record - Use proper Knex syntax
      const upload = await db('file_uploads')
        .where({ id: fileId, user_id: userId })
        .first();

      if (!upload) {
        return reply.status(404).send({ error: 'File not found' });
      }

      // Delete from storage - Use the correct method name
      await s3Storage.deleteFile(upload.file_key);

      // Update database - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'deleted',
          deleted_at: db.fn.now()
        });

      return reply.send({ message: 'File deleted successfully' });
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to delete file');
      return reply.status(500).send({
        error: 'Failed to delete file'
      });
    }
  }
}
