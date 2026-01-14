import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { fileValidator } from '../validators/file.validator';
import { generateFileHash, generateStorageKey, generateFileId } from '../utils/file-helpers';
import { FileRecord, UploadOptions } from '../types/file.types';
import { FileStatus } from '../constants/file-status';
import { logger } from '../utils/logger';

export class UploadService {
  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    tenantId: string,
    userId?: string,
    options?: UploadOptions
  ): Promise<FileRecord> {
    let fileId: string | undefined;
    
    try {
      // Validate file
      fileValidator.validateSize(buffer.length, mimeType);
      fileValidator.validateMimeType(mimeType);
      
      // Generate file metadata ONCE
      fileId = generateFileId();
      const sanitizedFilename = fileValidator.sanitizeFilename(filename);
      const extension = fileValidator.getExtension(filename);
      const hash = generateFileHash(buffer);
      
      // Use the SAME fileId for storage key
      const storageKey = generateStorageKey(
        fileId,
        sanitizedFilename,
        options?.entityType,
        options?.entityId
      );
      
      logger.info(`Creating file - ID: ${fileId}, Storage Path: ${storageKey}`);
      
      // Create database record with tenantId
      const fileRecord = await fileModel.create({
        id: fileId,
        filename: sanitizedFilename,
        originalFilename: filename,
        mimeType,
        extension,
        sizeBytes: buffer.length,
        hashSha256: hash,
        uploadedBy: userId,
        entityType: options?.entityType,
        entityId: options?.entityId,
        isPublic: options?.isPublic || false,
        metadata: options?.metadata || {},
        tags: options?.tags,
        status: FileStatus.UPLOADING,
        storagePath: storageKey
      }, tenantId);
      
      // Upload to storage
      const storageResult = await storageService.upload(buffer, storageKey);
      logger.info(`File uploaded to storage: ${storageKey}`);
      
      // Update file record with CDN URL
      await fileModel.updateCdnUrl(fileId, tenantId, storageResult.publicUrl || '');
      
      // Get the updated record
      const updatedRecord = await fileModel.findById(fileId, tenantId);
      
      if (!updatedRecord) {
        logger.warn(`Could not retrieve updated record for ${fileId}`);
        fileRecord.cdnUrl = storageResult.publicUrl;
        fileRecord.status = FileStatus.READY;
        return fileRecord;
      }
      
      logger.info(`File upload completed: ${fileId}`);
      return updatedRecord;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'File upload failed');
      
      if (fileId) {
        try {
          await fileModel.updateStatus(fileId, tenantId, FileStatus.FAILED, errorMessage);
        } catch (updateError) {
          logger.error({ err: updateError instanceof Error ? updateError : new Error(String(updateError)), fileId }, 'Failed to update file status');
        }
      }
      
      throw error;
    }
  }
  
  async getFile(fileId: string, tenantId: string): Promise<FileRecord | null> {
    return fileModel.findById(fileId, tenantId);
  }
  
  async getFilesByEntity(entityType: string, entityId: string, tenantId: string): Promise<FileRecord[]> {
    return fileModel.findByEntity(entityType, entityId, tenantId);
  }
}

export const uploadService = new UploadService();
