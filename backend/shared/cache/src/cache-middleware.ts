import { Request, Response, NextFunction } from 'express';
import { CacheService, CacheOptions } from './cache-service';
import crypto from 'crypto';

export interface CacheMiddlewareOptions extends CacheOptions {
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  excludePaths?: string[];
  includeQuery?: boolean;
  includeBody?: boolean;
  varyByHeaders?: string[];
  varyByUser?: boolean;
}

export class CacheMiddleware {
  constructor(private cache: CacheService) {}

  /**
   * Create Express middleware for automatic caching
   */
  auto(options: CacheMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip non-GET requests by default
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }

      // Check condition
      if (options.condition && !options.condition(req)) {
        return next();
      }

      // Check excluded paths
      if (options.excludePaths?.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Generate cache key
      const key = options.keyGenerator 
        ? options.keyGenerator(req)
        : this.generateKey(req, options);

      // Try to get from cache
      const cached = await this.cache.get(key, undefined, options);
      
      if (cached && typeof cached === 'object' && 'body' in cached && 'headers' in cached) {
        // Cache hit - send cached response
        res.set(cached.headers);
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', key);
        return res.status((cached as any).status || 200).send((cached as any).body);
      }

      // Cache miss - capture response
      const originalSend = res.send;
      const originalJson = res.json;
      
      let responseData: any;
      let captured = false;

      const captureResponse = (data: any) => {
        if (!captured && res.statusCode < 400) {
          captured = true;
          responseData = data;
          
          // Store in cache
          const cacheData = {
            body: data,
            headers: this.getCacheableHeaders(res),
            status: res.statusCode,
            timestamp: Date.now()
          };
          
          this.cache.set(key, cacheData, options).catch((err: Error) => {
            console.error('Cache set error:', err);
          });
        }
        return data;
      };

      res.send = function(data: any) {
        captureResponse(data);
        return originalSend.call(this, data);
      };

      res.json = function(data: any) {
        captureResponse(JSON.stringify(data));
        return originalJson.call(this, data);
      };

      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Key', key);
      
      next();
    };
  }

  /**
   * Invalidation middleware
   */
  invalidate(pattern?: string | ((req: Request) => string[])) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (typeof pattern === 'function') {
          const keys = pattern(req);
          await this.cache.delete(keys);
        } else if (pattern) {
          const keys = await this.findKeys(pattern);
          await this.cache.delete(keys);
        } else {
          // Invalidate based on request
          const key = this.generateKey(req, {});
          await this.cache.delete(key);
        }
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }
      next();
    };
  }

  /**
   * Tag-based invalidation middleware
   */
  invalidateTags(tagGenerator: (req: Request) => string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tags = tagGenerator(req);
        await this.cache.deleteByTags(tags);
      } catch (err) {
        console.error('Tag invalidation error:', err);
      }
      next();
    };
  }

  private generateKey(req: Request, options: CacheMiddlewareOptions): string {
    const parts = [
      req.method,
      req.path
    ];

    // Include query parameters
    if (options.includeQuery !== false && Object.keys(req.query).length > 0) {
      const sortedQuery = Object.keys(req.query)
        .sort()
        .map(k => `${k}=${req.query[k]}`)
        .join('&');
      parts.push(sortedQuery);
    }

    // Include body for POST requests
    if (options.includeBody && req.body) {
      const bodyHash = crypto
        .createHash('md5')
        .update(JSON.stringify(req.body))
        .digest('hex');
      parts.push(bodyHash);
    }

    // Vary by headers
    if (options.varyByHeaders) {
      options.varyByHeaders.forEach(header => {
        const value = req.headers[header.toLowerCase()];
        if (value) {
          parts.push(`${header}:${value}`);
        }
      });
    }

    // Vary by user
    if (options.varyByUser && (req as any).user) {
      parts.push(`user:${(req as any).user.id}`);
    }

    return parts.join(':');
  }

  private getCacheableHeaders(res: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    const cacheableHeaders = [
      'content-type',
      'content-encoding',
      'cache-control',
      'etag',
      'last-modified'
    ];

    cacheableHeaders.forEach(header => {
      const value = res.get(header);
      if (value) {
        headers[header] = value;
      }
    });

    return headers;
  }

  private async findKeys(pattern: string): Promise<string[]> {
    // This would need Redis SCAN implementation
    // For now, return empty array
    return [];
  }
}
