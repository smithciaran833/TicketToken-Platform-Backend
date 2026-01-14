import sharp from 'sharp';
import { logger } from '../../utils/logger';

export interface ThumbnailOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export class ThumbnailGenerator {
  async generate(
    input: Buffer,
    options: ThumbnailOptions
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input)
        .resize(options.width, options.height, {
          fit: options.fit || 'cover',
          position: 'centre',
          withoutEnlargement: true
        });

      // Apply format
      switch (options.format || 'jpeg') {
        case 'jpeg':
          pipeline = pipeline.jpeg({ 
            quality: options.quality || 85,
            progressive: true 
          });
          break;
        case 'png':
          pipeline = pipeline.png({ 
            quality: options.quality || 90,
            compressionLevel: 9 
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({ 
            quality: options.quality || 85 
          });
          break;
      }

      return await pipeline.toBuffer();
      
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Thumbnail generation failed');
      throw error;
    }
  }

  async generateSet(
    input: Buffer,
    sizes: Record<string, ThumbnailOptions>
  ): Promise<Record<string, Buffer>> {
    const results: Record<string, Buffer> = {};
    
    for (const [name, options] of Object.entries(sizes)) {
      results[name] = await this.generate(input, options);
    }
    
    return results;
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
