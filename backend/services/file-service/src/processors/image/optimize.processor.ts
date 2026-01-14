import sharp from 'sharp';
import { logger } from '../../utils/logger';

export class ImageOptimizer {
  async optimize(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Auto-orient based on EXIF
    image.rotate();
    
    // Choose optimization based on image type
    if (this.shouldConvertToWebP(mimeType, metadata)) {
      return this.optimizeAsWebP(image, metadata);
    } else if (mimeType === 'image/png' && !metadata.hasAlpha) {
      return this.optimizeAsJpeg(image);
    } else if (mimeType === 'image/jpeg') {
      return this.optimizeJpeg(image);
    }
    
    return buffer; // Return original if no optimization needed
  }

  private shouldConvertToWebP(mimeType: string, metadata: any): boolean {
    // Convert photos to WebP for better compression
    return mimeType === 'image/jpeg' && 
           !metadata.hasAlpha && 
           (metadata.width || 0) > 500;
  }

  private async optimizeAsWebP(image: sharp.Sharp, metadata: any): Promise<Buffer> {
    const optimized = await image
      .webp({ 
        quality: 85,
        effort: 6 
      })
      .toBuffer();
    
    logger.info(`Converted to WebP: ${Math.round((1 - optimized.length/(metadata.size || 1)) * 100)}% reduction`);
    return optimized;
  }

  private async optimizeAsJpeg(image: sharp.Sharp): Promise<Buffer> {
    return image
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true,
        trellisQuantisation: true,
        overshootDeringing: true,
        optimizeScans: true
      })
      .toBuffer();
  }

  private async optimizeJpeg(image: sharp.Sharp): Promise<Buffer> {
    // Re-encode JPEG with better settings
    return image
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
  }

  async generateResponsiveSet(buffer: Buffer): Promise<Map<number, Buffer>> {
    const sizes = [320, 640, 960, 1280, 1920, 2560];
    const result = new Map<number, Buffer>();
    
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 0;
    
    for (const width of sizes) {
      if (width >= originalWidth) {
        break; // Don't upscale
      }
      
      const resized = await sharp(buffer)
        .resize(width, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
      
      result.set(width, resized);
    }
    
    return result;
  }
}

export const imageOptimizer = new ImageOptimizer();
