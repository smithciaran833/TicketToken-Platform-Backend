import sharp from 'sharp';
import { logger } from '../../utils/logger';
import { fileModel } from '../../models/file.model';
import { storageService } from '../../storage/storage.service';

export interface ImageProcessingOptions {
  generateThumbnails?: boolean;
  optimize?: boolean;
  extractMetadata?: boolean;
  generateBlurHash?: boolean;
}

export class ImageProcessor {
  private thumbnailSizes = {
    small: { width: 150, height: 150 },
    medium: { width: 300, height: 300 },
    large: { width: 600, height: 600 }
  };

  // SECURITY: Whitelist of allowed metadata fields
  private readonly ALLOWED_METADATA_FIELDS = [
    'width',
    'height',
    'aspect_ratio',
    'format',
    'thumbnail_small_url',
    'thumbnail_medium_url',
    'thumbnail_large_url',
    'space',
    'channels',
    'depth',
    'density',
    'has_alpha',
    'orientation'
  ];

  async processImage(fileId: string, buffer: Buffer): Promise<void> {
    try {
      logger.info(`Processing image: ${fileId}`);

      // Get file record
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Process based on file type
      const tasks = [];

      // Always extract metadata
      tasks.push(this.extractMetadata(fileId, buffer));

      // Generate thumbnails
      tasks.push(this.generateThumbnails(fileId, buffer, file.storagePath));

      // Optimize original
      tasks.push(this.optimizeImage(fileId, buffer, file.storagePath));

      await Promise.all(tasks);

      logger.info(`Image processing completed: ${fileId}`);

    } catch (error) {
      logger.error(`Image processing failed for ${fileId}:`, error);
      throw error;
    }
  }

  private async extractMetadata(fileId: string, buffer: Buffer): Promise<void> {
    const metadata = await sharp(buffer).metadata();

    await this.saveImageMetadata(fileId, {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation
    });
  }

  private async generateThumbnails(fileId: string, buffer: Buffer, originalPath: string): Promise<void> {
    const thumbnailUrls: any = {};

    for (const [size, dimensions] of Object.entries(this.thumbnailSizes)) {
      const thumbnail = await sharp(buffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          position: 'centre'
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // Generate thumbnail path
      const thumbPath = originalPath.replace(/\.[^.]+$/, `_${size}.jpg`);

      // Save thumbnail
      const result = await storageService.upload(thumbnail, thumbPath);
      thumbnailUrls[`thumbnail_${size}_url`] = result.publicUrl;
    }

    // Update database with thumbnail URLs
    await this.updateImageMetadata(fileId, thumbnailUrls);
  }

  private async optimizeImage(fileId: string, buffer: Buffer, originalPath: string): Promise<void> {
    const optimized = await sharp(buffer)
      .jpeg({ quality: 85, progressive: true, mozjpeg: true })
      .toBuffer();

    // Only save if smaller
    if (optimized.length < buffer.length) {
      const optimizedPath = originalPath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      logger.info(`Image optimized: ${fileId} (${Math.round((1 - optimized.length/buffer.length) * 100)}% reduction)`);
    }
  }

  private async saveImageMetadata(fileId: string, metadata: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    await pool.query(`
      INSERT INTO image_metadata (
        file_id, width, height, aspect_ratio, format
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (file_id) DO UPDATE SET
        width = $2, height = $3, aspect_ratio = $4, format = $5
    `, [fileId, metadata.width, metadata.height, metadata.width/metadata.height, metadata.format]);
  }

  private async updateImageMetadata(fileId: string, data: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    // SECURITY FIX: Validate column names against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.ALLOWED_METADATA_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push(data[key]);
      }
    });

    if (validFields.length === 0) {
      logger.warn('No valid fields to update in image metadata');
      return;
    }

    const setClauses = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const values = [fileId, ...validValues];

    await pool.query(`
      UPDATE image_metadata SET ${setClauses} WHERE file_id = $1
    `, values);
  }
}

export const imageProcessor = new ImageProcessor();
