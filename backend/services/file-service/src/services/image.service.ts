import { imageProcessor } from '../processors/image/image.processor';
import { thumbnailGenerator } from '../processors/image/thumbnail.generator';
import { imageOptimizer } from '../processors/image/optimize.processor';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ImageService {
  async processUploadedImage(fileId: string, tenantId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId, tenantId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      if (!file.storagePath) {
        throw new Error(`File ${fileId} has no storage path`);
      }

      // Download original
      const buffer = await storageService.download(file.storagePath);
      
      // Process image
      await imageProcessor.processImage(fileId, buffer);
      
      // Update status
      await fileModel.updateStatus(fileId, tenantId, 'ready');
      
      logger.info(`Image processing completed for ${fileId}`);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Image processing failed');
      await fileModel.updateStatus(fileId, tenantId, 'failed', errorMessage);
    }
  }

  async generateThumbnail(fileId: string, tenantId: string, size: 'small' | 'medium' | 'large'): Promise<string> {
    const file = await fileModel.findById(fileId, tenantId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    if (!file.storagePath) {
      throw new Error(`File ${fileId} has no storage path`);
    }

    const buffer = await storageService.download(file.storagePath);
    
    const sizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };

    const thumbnail = await thumbnailGenerator.generate(buffer, sizes[size]);
    
    const thumbPath = file.storagePath.replace(/\.[^.]+$/, `_${size}.jpg`);
    const result = await storageService.upload(thumbnail, thumbPath);
    
    return result.publicUrl || '';
  }

  async optimizeImage(fileId: string, tenantId: string): Promise<void> {
    const file = await fileModel.findById(fileId, tenantId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    if (!file.storagePath) {
      throw new Error(`File ${fileId} has no storage path`);
    }

    const buffer = await storageService.download(file.storagePath);
    const mimeType = file.mimeType || 'image/jpeg';
    const optimized = await imageOptimizer.optimize(buffer, mimeType);
    
    if (optimized.length < buffer.length) {
      const optimizedPath = file.storagePath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      
      const reduction = Math.round((1 - optimized.length/buffer.length) * 100);
      logger.info(`Image optimized: ${fileId} (${reduction}% size reduction)`);
    }
  }
}

export const imageService = new ImageService();
