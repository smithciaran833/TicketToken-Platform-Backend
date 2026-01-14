import sharp from 'sharp';

export interface WatermarkOptions {
  text?: string;
  imagePath?: string;
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  fontSize?: number;
  rotate?: number;
}

export class WatermarkProcessor {
  async addTextWatermark(
    imageBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    const fontSize = options.fontSize || Math.min(width, height) / 10;
    const opacity = options.opacity || 0.3;
    const rotate = options.rotate || -45;
    
    // Position calculation
    let x = width / 2;
    let y = height / 2;
    let anchor = 'middle';
    
    switch (options.position) {
      case 'top-left':
        x = fontSize;
        y = fontSize;
        anchor = 'start';
        break;
      case 'top-right':
        x = width - fontSize;
        y = fontSize;
        anchor = 'end';
        break;
      case 'bottom-left':
        x = fontSize;
        y = height - fontSize;
        anchor = 'start';
        break;
      case 'bottom-right':
        x = width - fontSize;
        y = height - fontSize;
        anchor = 'end';
        break;
    }
    
    const watermarkSVG = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <style>
            .watermark { 
              fill: white; 
              fill-opacity: ${opacity};
              font-family: Arial, sans-serif;
              font-size: ${fontSize}px;
              font-weight: bold;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            }
          </style>
        </defs>
        <text x="${x}" y="${y}" 
              class="watermark"
              text-anchor="${anchor}"
              transform="rotate(${rotate} ${x} ${y})">
          ${options.text || 'WATERMARK'}
        </text>
      </svg>
    `);
    
    return sharp(imageBuffer)
      .composite([{
        input: watermarkSVG,
        blend: 'over'
      }])
      .toBuffer();
  }
  
  async addImageWatermark(
    imageBuffer: Buffer,
    watermarkBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const watermarkMetadata = await sharp(watermarkBuffer).metadata();
    
    // Resize watermark to 20% of main image
    const watermarkWidth = Math.floor((metadata.width || 800) * 0.2);
    const resizedWatermark = await sharp(watermarkBuffer)
      .resize(watermarkWidth, null, { 
        withoutEnlargement: true 
      })
      .toBuffer();
    
    // Calculate position
    let left = 0;
    let top = 0;
    
    switch (options.position) {
      case 'top-left':
        left = 20;
        top = 20;
        break;
      case 'top-right':
        left = (metadata.width || 800) - watermarkWidth - 20;
        top = 20;
        break;
      case 'bottom-left':
        left = 20;
        top = (metadata.height || 600) - (watermarkMetadata.height || 100) - 20;
        break;
      case 'bottom-right':
        left = (metadata.width || 800) - watermarkWidth - 20;
        top = (metadata.height || 600) - (watermarkMetadata.height || 100) - 20;
        break;
      default: // center
        left = Math.floor(((metadata.width || 800) - watermarkWidth) / 2);
        top = Math.floor(((metadata.height || 600) - (watermarkMetadata.height || 100)) / 2);
    }
    
    return sharp(imageBuffer)
      .composite([{
        input: resizedWatermark,
        left,
        top,
        blend: 'over'
      }])
      .toBuffer();
  }
  
  async addPattern(imageBuffer: Buffer, pattern: string): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    // Create repeating pattern
    const patternSVG = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <pattern id="watermarkPattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <text x="100" y="100" 
                  fill="white" 
                  fill-opacity="0.1" 
                  font-size="20" 
                  text-anchor="middle"
                  transform="rotate(-45 100 100)">
              ${pattern}
            </text>
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#watermarkPattern)" />
      </svg>
    `);
    
    return sharp(imageBuffer)
      .composite([{
        input: patternSVG,
        blend: 'over'
      }])
      .toBuffer();
  }
}

export const watermarkProcessor = new WatermarkProcessor();
