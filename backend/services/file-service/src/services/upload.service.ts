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
      
      // Create database record
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
      });
      
      // Upload to storage
      const storageResult = await storageService.upload(buffer, storageKey);
      logger.info(`File uploaded to storage: ${storageKey}`);
      
      // Update file record with CDN URL
      await fileModel.updateCdnUrl(fileId, storageResult.publicUrl || '');
      
      // Get the updated record
      const updatedRecord = await fileModel.findById(fileId);
      
      if (!updatedRecord) {
        logger.warn(`Could not retrieve updated record for ${fileId}`);
        fileRecord.cdnUrl = storageResult.publicUrl;
        fileRecord.status = FileStatus.READY;
        return fileRecord;
      }
      
      logger.info(`File upload completed: ${fileId}`);
      return updatedRecord;
      
    } catch (error: any) {
      logger.error('File upload failed:', error);
      
      if (fileId) {
        try {
          await fileModel.updateStatus(fileId, FileStatus.FAILED, error.message);
        } catch (updateError) {
          logger.error('Failed to update file status:', updateError);
        }
      }
      
      throw error;
    }
  }
  
  async getFile(fileId: string): Promise<FileRecord | null> {
    return fileModel.findById(fileId);
  }
  
  async getFilesByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
    return fileModel.findByEntity(entityType, entityId);
  }
}

export const uploadService = new UploadService();
