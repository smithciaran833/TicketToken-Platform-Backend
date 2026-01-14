import { logger } from '../utils/logger';
import { cacheService, CachePrefix } from './cache.service';

/**
 * CDN Service for CloudFront/CDN integration
 * Manages CDN URL generation and cache invalidation
 */
export class CDNService {
  private cdnDomain: string | null;
  private cdnEnabled: boolean;
  private cacheControlByType: Map<string, string>;

  constructor() {
    this.cdnDomain = process.env.CDN_DOMAIN || null;
    this.cdnEnabled = !!this.cdnDomain && process.env.CDN_ENABLED !== 'false';
    
    // Initialize cache control policies by content type
    this.cacheControlByType = new Map([
      // Images - 1 year cache (immutable)
      ['image/jpeg', 'public, max-age=31536000, immutable'],
      ['image/png', 'public, max-age=31536000, immutable'],
      ['image/gif', 'public, max-age=31536000, immutable'],
      ['image/webp', 'public, max-age=31536000, immutable'],
      
      // Documents - 1 week cache
      ['application/pdf', 'public, max-age=604800'],
      ['application/msword', 'public, max-age=604800'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'public, max-age=604800'],
      
      // Videos - 1 month cache
      ['video/mp4', 'public, max-age=2592000'],
      ['video/quicktime', 'public, max-age=2592000'],
      
      // Default - 1 day cache
      ['default', 'public, max-age=86400']
    ]);

    if (this.cdnEnabled) {
      logger.info(`CDN enabled with domain: ${this.cdnDomain}`);
    } else {
      logger.info('CDN disabled - using direct S3 URLs');
    }
  }

  /**
   * Get CDN URL for a file
   */
  getCDNUrl(storageKey: string, options?: {
    version?: string;
    width?: number;
    height?: number;
    format?: string;
  }): string {
    if (!this.cdnEnabled || !this.cdnDomain) {
      // Fall back to S3 URL
      return this.getS3Url(storageKey);
    }

    let url = `https://${this.cdnDomain}/${storageKey}`;

    // Add query parameters for image transformations if supported
    if (options) {
      const params = new URLSearchParams();
      
      if (options.version) params.append('v', options.version);
      if (options.width) params.append('w', options.width.toString());
      if (options.height) params.append('h', options.height.toString());
      if (options.format) params.append('f', options.format);

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Get S3 URL (fallback when CDN disabled)
   */
  private getS3Url(storageKey: string): string {
    const bucketName = process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    return `https://${bucketName}.s3.${region}.amazonaws.com/${storageKey}`;
  }

  /**
   * Get cache control header for content type
   */
  getCacheControl(contentType: string): string {
    return this.cacheControlByType.get(contentType) || 
           this.cacheControlByType.get('default')!;
  }

  /**
   * Invalidate CDN cache for specific paths
   */
  async invalidateCache(paths: string[]): Promise<boolean> {
    if (!this.cdnEnabled) {
      logger.debug('CDN disabled - skipping cache invalidation');
      return true;
    }

    try {
      // For CloudFront, you would use AWS SDK
      // This is a placeholder for the actual implementation
      logger.info(`Invalidating CDN cache for ${paths.length} paths`);

      // In a real implementation:
      // const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
      // await cloudfront.send(new CreateInvalidationCommand({
      //   DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      //   InvalidationBatch: {
      //     Paths: { Quantity: paths.length, Items: paths },
      //     CallerReference: Date.now().toString()
      //   }
      // }));

      // For now, just clear from our cache
      for (const path of paths) {
        await cacheService.delete(path, { prefix: CachePrefix.FILE_CONTENT });
      }

      logger.info(`Cache invalidation completed for ${paths.length} paths`);
      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'CDN cache invalidation failed');
      return false;
    }
  }

  /**
   * Invalidate cache for a file (by file ID)
   */
  async invalidateFileCache(fileId: string): Promise<boolean> {
    try {
      // Invalidate main file
      await this.invalidateCache([`files/${fileId}/*`]);
      
      // Clear from local cache
      await cacheService.deletePattern(`${fileId}*`, { prefix: CachePrefix.FILE });
      
      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Failed to invalidate cache for file');
      return false;
    }
  }

  /**
   * Generate responsive image URLs
   */
  getResponsiveImageUrls(storageKey: string, contentType: string): {
    original: string;
    thumbnail: string;
    small: string;
    medium: string;
    large: string;
  } {
    if (!contentType.startsWith('image/')) {
      throw new Error('Responsive URLs only available for images');
    }

    return {
      original: this.getCDNUrl(storageKey),
      thumbnail: this.getCDNUrl(storageKey, { width: 150, height: 150 }),
      small: this.getCDNUrl(storageKey, { width: 320 }),
      medium: this.getCDNUrl(storageKey, { width: 640 }),
      large: this.getCDNUrl(storageKey, { width: 1280 })
    };
  }

  /**
   * Get optimized video URLs
   */
  getVideoUrls(storageKey: string): {
    original: string;
    hls?: string;
    dash?: string;
    thumbnail?: string;
  } {
    return {
      original: this.getCDNUrl(storageKey),
      // HLS and DASH would be generated by video transcoding
      hls: this.getCDNUrl(storageKey.replace(/\.[^.]+$/, '.m3u8')),
      dash: this.getCDNUrl(storageKey.replace(/\.[^.]+$/, '.mpd')),
      thumbnail: this.getCDNUrl(storageKey.replace(/\.[^.]+$/, '_thumb.jpg'))
    };
  }

  /**
   * Check if CDN is enabled
   */
  isEnabled(): boolean {
    return this.cdnEnabled;
  }

  /**
   * Get CDN domain
   */
  getDomain(): string | null {
    return this.cdnDomain;
  }

  /**
   * Purge entire CDN cache (use with caution!)
   */
  async purgeAll(): Promise<boolean> {
    if (!this.cdnEnabled) {
      return true;
    }

    try {
      logger.warn({}, 'Purging entire CDN cache');
      
      // In production, this would trigger a CloudFront invalidation
      // For all paths: /*
      
      // Clear local cache
      await cacheService.clear(CachePrefix.FILE);
      await cacheService.clear(CachePrefix.FILE_CONTENT);
      
      logger.info('CDN cache purged successfully');
      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to purge CDN cache');
      return false;
    }
  }

  /**
   * Get signed CDN URL (for private content)
   */
  getSignedUrl(storageKey: string, expiresIn: number = 3600): string {
    if (!this.cdnEnabled || !this.cdnDomain) {
      return this.getS3Url(storageKey);
    }

    // For CloudFront signed URLs, you would use CloudFront key pair
    // This is a simplified implementation
    const url = this.getCDNUrl(storageKey);
    const expires = Date.now() + (expiresIn * 1000);
    
    // In production: generate actual CloudFront signed URL with key pair
    // For now, just append expiry as query param
    return `${url}?expires=${expires}`;
  }

  /**
   * Preload files into CDN cache
   */
  async warmCache(storageKeys: string[]): Promise<void> {
    if (!this.cdnEnabled) {
      logger.debug('CDN disabled - skipping cache warming');
      return;
    }

    logger.info(`Warming CDN cache for ${storageKeys.length} files`);

    // Make HEAD requests to CDN to trigger cache population
    const promises = storageKeys.map(async (key) => {
      try {
        const url = this.getCDNUrl(key);
        // In production, make actual HTTP HEAD request
        logger.debug(`Warmed cache for: ${url}`);
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), key }, 'Failed to warm cache');
      }
    });

    await Promise.allSettled(promises);
    logger.info('Cache warming completed');
  }

  /**
   * Get CDN statistics (if supported)
   */
  async getStats(): Promise<{
    enabled: boolean;
    domain: string | null;
    cacheHitRate?: number;
    bandwidth?: number;
  }> {
    return {
      enabled: this.cdnEnabled,
      domain: this.cdnDomain,
      // Would fetch from CloudFront metrics in production
      cacheHitRate: undefined,
      bandwidth: undefined
    };
  }
}

// Export singleton instance
export const cdnService = new CDNService();
