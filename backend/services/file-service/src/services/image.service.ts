import { imageProcessor } from '../processors/image/image.processor';
import { thumbnailGenerator } from '../processors/image/thumbnail.generator';
import { imageOptimizer } from '../processors/image/optimize.processor';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ImageService {
  async processUploadedImage(fileId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Download original
      const buffer = await storageService.download(file.storagePath);
      
      // Process image
      await imageProcessor.processImage(fileId, buffer);
      
      // Update status
      await fileModel.updateStatus(fileId, 'ready');
      
      logger.info(`Image processing completed for ${fileId}`);
      
    } catch (error) {
      logger.error(`Image processing failed for ${fileId}:`, error);
      await fileModel.updateStatus(fileId, 'failed', error.message);
    }
  }

  async generateThumbnail(fileId: string, size: 'small' | 'medium' | 'large'): Promise<string> {
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
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

  async optimizeImage(fileId: string): Promise<void> {
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    const optimized = await imageOptimizer.optimize(buffer, file.mimeType);
    
    if (optimized.length < buffer.length) {
      const optimizedPath = file.storagePath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      
      const reduction = Math.round((1 - optimized.length/buffer.length) * 100);
      logger.info(`Image optimized: ${fileId} (${reduction}% size reduction)`);
    }
  }
}

export const imageService = new ImageService();
