import { logger } from '../utils/logger';

export interface CDNConfig {
  provider: 'cloudfront' | 'cloudflare' | 'local';
  domain?: string;
  distributionId?: string;
}

export class CDNService {
  private config: CDNConfig;
  
  constructor() {
    this.config = {
      provider: process.env.CDN_PROVIDER as any || 'local',
      domain: process.env.CDN_DOMAIN,
      distributionId: process.env.CDN_DISTRIBUTION_ID
    };
  }
  
  getPublicUrl(path: string): string {
    if (this.config.provider === 'local') {
      return `/files/${path}`;
    }
    
    return `https://${this.config.domain}/${path}`;
  }
  
  async invalidateCache(paths: string[]): Promise<void> {
    if (this.config.provider === 'cloudfront') {
      await this.invalidateCloudFront(paths);
    } else if (this.config.provider === 'cloudflare') {
      await this.invalidateCloudFlare(paths);
    }
  }
  
  private async invalidateCloudFront(paths: string[]): Promise<void> {
    // AWS CloudFront invalidation
    logger.info(`Invalidating CloudFront cache for ${paths.length} paths`);
    // Implementation would use AWS SDK
  }
  
  private async invalidateCloudFlare(paths: string[]): Promise<void> {
    // CloudFlare cache purge
    logger.info(`Purging CloudFlare cache for ${paths.length} paths`);
    // Implementation would use CloudFlare API
  }
  
  generateResponsiveUrls(basePath: string, sizes: number[]): Record<string, string> {
    const urls: Record<string, string> = {};
    
    for (const size of sizes) {
      const sizePath = basePath.replace(/\.[^.]+$/, `_${size}w.jpg`);
      urls[`${size}w`] = this.getPublicUrl(sizePath);
    }
    
    return urls;
  }
  
  generateSrcSet(basePath: string): string {
    const sizes = [320, 640, 960, 1280, 1920];
    const srcset = sizes.map(size => {
      const url = this.getPublicUrl(basePath.replace(/\.[^.]+$/, `_${size}w.jpg`));
      return `${url} ${size}w`;
    }).join(', ');
    
    return srcset;
  }
}

export const cdnService = new CDNService();
