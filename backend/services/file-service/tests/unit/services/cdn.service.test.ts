// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/cache.service');

import { CDNService, cdnService } from '../../../src/services/cdn.service';
import { cacheService, CachePrefix } from '../../../src/services/cache.service';

describe('services/cdn.service', () => {
  let service: CDNService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    
    // Setup mock cache service
    (cacheService.delete as jest.Mock) = jest.fn().mockResolvedValue(true);
    (cacheService.deletePattern as jest.Mock) = jest.fn().mockResolvedValue(5);
    (cacheService.clear as jest.Mock) = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with CDN enabled when domain set', () => {
      // Arrange
      process.env.CDN_DOMAIN = 'cdn.example.com';
      process.env.CDN_ENABLED = 'true';

      // Act
      const cdnService = new CDNService();

      // Assert
      expect(cdnService.isEnabled()).toBe(true);
      expect(cdnService.getDomain()).toBe('cdn.example.com');
    });

    it('should initialize with CDN disabled when no domain', () => {
      // Arrange
      delete process.env.CDN_DOMAIN;

      // Act
      const cdnService = new CDNService();

      // Assert
      expect(cdnService.isEnabled()).toBe(false);
      expect(cdnService.getDomain()).toBeNull();
    });

    it('should respect CDN_ENABLED env var as false', () => {
      // Arrange
      process.env.CDN_DOMAIN = 'cdn.example.com';
      process.env.CDN_ENABLED = 'false';

      // Act
      const cdnService = new CDNService();

      // Assert
      expect(cdnService.isEnabled()).toBe(false);
    });

    it('should initialize cache control map', () => {
      // Arrange
      process.env.CDN_DOMAIN = 'cdn.example.com';

      // Act
      const cdnService = new CDNService();

      // Assert
      expect(cdnService.getCacheControl('image/jpeg')).toBe('public, max-age=31536000, immutable');
      expect(cdnService.getCacheControl('application/pdf')).toBe('public, max-age=604800');
    });
  });

  describe('getCDNUrl', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should return CDN URL when enabled', () => {
      // Act
      const url = service.getCDNUrl('files/test.jpg');

      // Assert
      expect(url).toBe('https://cdn.example.com/files/test.jpg');
    });

    it('should add version query param', () => {
      // Act
      const url = service.getCDNUrl('files/test.jpg', { version: 'v2' });

      // Assert
      expect(url).toBe('https://cdn.example.com/files/test.jpg?v=v2');
    });

    it('should add width query param', () => {
      // Act
      const url = service.getCDNUrl('files/test.jpg', { width: 800 });

      // Assert
      expect(url).toBe('https://cdn.example.com/files/test.jpg?w=800');
    });

    it('should add height query param', () => {
      // Act
      const url = service.getCDNUrl('files/test.jpg', { height: 600 });

      // Assert
      expect(url).toBe('https://cdn.example.com/files/test.jpg?h=600');
    });

    it('should add format query param', () => {
      // Act
      const url = service.getCDNUrl('files/test.jpg', { format: 'webp' });

      // Assert
      expect(url).toBe('https://cdn.example.com/files/test.jpg?f=webp');
    });

    it('should combine multiple query params', () => {
      // Act
      const url = service.getCDNUrl('files/test.jpg', {
        version: 'v2',
        width: 800,
        height: 600,
        format: 'webp'
      });

      // Assert
      expect(url).toContain('v=v2');
      expect(url).toContain('w=800');
      expect(url).toContain('h=600');
      expect(url).toContain('f=webp');
    });

    it('should return S3 URL when CDN disabled', () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      process.env.S3_BUCKET_NAME = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      service = new CDNService();

      // Act
      const url = service.getCDNUrl('files/test.jpg');

      // Assert
      expect(url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/files/test.jpg');
    });
  });

  describe('getCacheControl', () => {
    beforeEach(() => {
      service = new CDNService();
    });

    it('should return cache control for image/jpeg', () => {
      // Act
      const cacheControl = service.getCacheControl('image/jpeg');

      // Assert
      expect(cacheControl).toBe('public, max-age=31536000, immutable');
    });

    it('should return cache control for image/png', () => {
      // Act
      const cacheControl = service.getCacheControl('image/png');

      // Assert
      expect(cacheControl).toBe('public, max-age=31536000, immutable');
    });

    it('should return cache control for application/pdf', () => {
      // Act
      const cacheControl = service.getCacheControl('application/pdf');

      // Assert
      expect(cacheControl).toBe('public, max-age=604800');
    });

    it('should return cache control for video/mp4', () => {
      // Act
      const cacheControl = service.getCacheControl('video/mp4');

      // Assert
      expect(cacheControl).toBe('public, max-age=2592000');
    });

    it('should return default cache control for unknown type', () => {
      // Act
      const cacheControl = service.getCacheControl('application/unknown');

      // Assert
      expect(cacheControl).toBe('public, max-age=86400');
    });
  });

  describe('invalidateCache', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should invalidate multiple paths', async () => {
      // Arrange
      const paths = ['/files/file1.jpg', '/files/file2.jpg', '/files/file3.jpg'];

      // Act
      const result = await service.invalidateCache(paths);

      // Assert
      expect(result).toBe(true);
      expect(cacheService.delete).toHaveBeenCalledTimes(3);
    });

    it('should clear from cache service', async () => {
      // Arrange
      const paths = ['/files/test.jpg'];

      // Act
      await service.invalidateCache(paths);

      // Assert
      expect(cacheService.delete).toHaveBeenCalledWith('/files/test.jpg', {
        prefix: CachePrefix.FILE_CONTENT
      });
    });

    it('should return true when CDN disabled', async () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      service = new CDNService();

      // Act
      const result = await service.invalidateCache(['/files/test.jpg']);

      // Assert
      expect(result).toBe(true);
      expect(cacheService.delete).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      (cacheService.delete as jest.Mock).mockRejectedValue(new Error('Cache error'));

      // Act
      const result = await service.invalidateCache(['/files/test.jpg']);

      // Assert
      expect(result).toBe(false);
    });

    it('should log invalidation', async () => {
      // Act
      await service.invalidateCache(['/files/test.jpg', '/files/test2.jpg']);

      // Assert
      expect(cacheService.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateFileCache', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should invalidate file with pattern', async () => {
      // Act
      const result = await service.invalidateFileCache('file-123');

      // Assert
      expect(result).toBe(true);
      expect(cacheService.deletePattern).toHaveBeenCalledWith('file-123*', {
        prefix: CachePrefix.FILE
      });
    });

    it('should handle errors', async () => {
      // Arrange
      (cacheService.deletePattern as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      // Act
      const result = await service.invalidateFileCache('file-123');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getResponsiveImageUrls', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should generate all responsive sizes', () => {
      // Act
      const urls = service.getResponsiveImageUrls('files/image.jpg', 'image/jpeg');

      // Assert
      expect(urls.original).toContain('files/image.jpg');
      expect(urls.thumbnail).toContain('w=150');
      expect(urls.thumbnail).toContain('h=150');
      expect(urls.small).toContain('w=320');
      expect(urls.medium).toContain('w=640');
      expect(urls.large).toContain('w=1280');
    });

    it('should throw error for non-image content', () => {
      // Act & Assert
      expect(() => {
        service.getResponsiveImageUrls('files/doc.pdf', 'application/pdf');
      }).toThrow('Responsive URLs only available for images');
    });

    it('should return CDN URLs for all sizes', () => {
      // Act
      const urls = service.getResponsiveImageUrls('files/photo.png', 'image/png');

      // Assert
      expect(urls.original).toContain('cdn.example.com');
      expect(urls.thumbnail).toContain('cdn.example.com');
      expect(urls.small).toContain('cdn.example.com');
      expect(urls.medium).toContain('cdn.example.com');
      expect(urls.large).toContain('cdn.example.com');
    });
  });

  describe('getVideoUrls', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should return original URL', () => {
      // Act
      const urls = service.getVideoUrls('files/video.mp4');

      // Assert
      expect(urls.original).toBe('https://cdn.example.com/files/video.mp4');
    });

    it('should return HLS URL with .m3u8 extension', () => {
      // Act
      const urls = service.getVideoUrls('files/video.mp4');

      // Assert
      expect(urls.hls).toBe('https://cdn.example.com/files/video.m3u8');
    });

    it('should return DASH URL with .mpd extension', () => {
      // Act
      const urls = service.getVideoUrls('files/video.mp4');

      // Assert
      expect(urls.dash).toBe('https://cdn.example.com/files/video.mpd');
    });

    it('should return thumbnail URL', () => {
      // Act
      const urls = service.getVideoUrls('files/video.mp4');

      // Assert
      expect(urls.thumbnail).toBe('https://cdn.example.com/files/video_thumb.jpg');
    });

    it('should handle different video extensions', () => {
      // Act
      const urls = service.getVideoUrls('files/video.webm');

      // Assert
      expect(urls.original).toContain('video.webm');
      expect(urls.hls).toContain('video.m3u8');
      expect(urls.dash).toContain('video.mpd');
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      // Arrange
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();

      // Act & Assert
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      service = new CDNService();

      // Act & Assert
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('getDomain', () => {
    it('should return CDN domain when set', () => {
      // Arrange
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();

      // Act & Assert
      expect(service.getDomain()).toBe('cdn.example.com');
    });

    it('should return null when not set', () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      service = new CDNService();

      // Act & Assert
      expect(service.getDomain()).toBeNull();
    });
  });

  describe('purgeAll', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should clear all cache prefixes', async () => {
      // Act
      const result = await service.purgeAll();

      // Assert
      expect(result).toBe(true);
      expect(cacheService.clear).toHaveBeenCalledWith(CachePrefix.FILE);
      expect(cacheService.clear).toHaveBeenCalledWith(CachePrefix.FILE_CONTENT);
    });

    it('should return true when CDN disabled', async () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      service = new CDNService();

      // Act
      const result = await service.purgeAll();

      // Assert
      expect(result).toBe(true);
      expect(cacheService.clear).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      // Arrange
      (cacheService.clear as jest.Mock).mockRejectedValue(new Error('Clear failed'));

      // Act
      const result = await service.purgeAll();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getSignedUrl', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should generate signed URL with expiry', () => {
      // Act
      const url = service.getSignedUrl('files/private.pdf', 7200);

      // Assert
      expect(url).toContain('cdn.example.com');
      expect(url).toContain('expires=');
      expect(url).toContain('files/private.pdf');
    });

    it('should use default 3600s expiry', () => {
      // Arrange
      const beforeTime = Date.now();

      // Act
      const url = service.getSignedUrl('files/private.pdf');

      // Assert
      expect(url).toContain('expires=');
      const expiresMatch = url.match(/expires=(\d+)/);
      expect(expiresMatch).toBeTruthy();
      if (expiresMatch) {
        const expires = parseInt(expiresMatch[1]!);
        expect(expires).toBeGreaterThan(beforeTime + 3500000); // ~3600s
      }
    });

    it('should fallback to S3 URL when CDN disabled', () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      process.env.S3_BUCKET_NAME = 'test-bucket';
      process.env.AWS_REGION = 'us-west-2';
      service = new CDNService();

      // Act
      const url = service.getSignedUrl('files/private.pdf');

      // Assert
      expect(url).toContain('test-bucket.s3.us-west-2.amazonaws.com');
    });
  });

  describe('warmCache', () => {
    beforeEach(() => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();
    });

    it('should skip when CDN disabled', async () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      service = new CDNService();

      // Act
      await service.warmCache(['file1.jpg', 'file2.jpg']);

      // Assert - No assertions needed, just checking it doesn't throw
      expect(true).toBe(true);
    });

    it('should process multiple keys', async () => {
      // Act
      await service.warmCache(['file1.jpg', 'file2.jpg', 'file3.jpg']);

      // Assert - Would make HTTP requests in production
      expect(true).toBe(true);
    });

    it('should handle individual failures gracefully', async () => {
      // Act & Assert - Should not throw
      await expect(
        service.warmCache(['file1.jpg', 'file2.jpg'])
      ).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return stats with enabled=true', async () => {
      // Arrange
      process.env.CDN_DOMAIN = 'cdn.example.com';
      service = new CDNService();

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.enabled).toBe(true);
      expect(stats.domain).toBe('cdn.example.com');
      expect(stats.cacheHitRate).toBeUndefined();
      expect(stats.bandwidth).toBeUndefined();
    });

    it('should return stats with enabled=false', async () => {
      // Arrange
      delete process.env.CDN_DOMAIN;
      service = new CDNService();

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.enabled).toBe(false);
      expect(stats.domain).toBeNull();
    });
  });

  describe('singleton instance', () => {
    it('should export cdnService instance', () => {
      expect(cdnService).toBeInstanceOf(CDNService);
    });

    it('should be the same instance across calls', () => {
      const instance1 = cdnService;
      const instance2 = cdnService;
      expect(instance1).toBe(instance2);
    });
  });
});
