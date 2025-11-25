import { FastifyRequest, FastifyReply } from 'fastify';
import { CacheService, CacheOptions } from './cache-service';
import crypto from 'crypto';

export interface CacheMiddlewareOptions extends CacheOptions {
  keyGenerator?: (req: FastifyRequest) => string;
  condition?: (req: FastifyRequest) => boolean;
  excludePaths?: string[];
  includeQuery?: boolean;
  includeBody?: boolean;
  varyByHeaders?: string[];
  varyByUser?: boolean;
}

export class CacheMiddleware {
  constructor(private cache: CacheService) {}

  /**
   * Create Fastify preHandler hook for automatic caching
   */
  auto(options: CacheMiddlewareOptions = {}) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // Skip non-GET requests by default
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return;
      }

      // Check condition
      if (options.condition && !options.condition(request)) {
        return;
      }

      // Check excluded paths
      if (options.excludePaths?.some((path) => request.url.startsWith(path))) {
        return;
      }

      // Generate cache key
      const key = options.keyGenerator ? options.keyGenerator(request) : this.generateKey(request, options);

      // Try to get from cache
      const cached = await this.cache.get(key, undefined, options);

      if (cached && typeof cached === 'object' && 'body' in cached && 'headers' in cached) {
        // Cache hit - send cached response
        const cachedData = cached as any;
        Object.keys(cachedData.headers).forEach((header) => {
          reply.header(header, cachedData.headers[header]);
        });
        reply.header('X-Cache', 'HIT');
        reply.header('X-Cache-Key', key);
        reply.code(cachedData.status || 200).send(cachedData.body);
        return;
      }

      // Cache miss - capture response
      let responseData: any;
      let captured = false;

      // Hook into reply to capture response
      reply.raw.on('finish', () => {
        if (!captured && reply.statusCode < 400) {
          captured = true;

          const cacheData = {
            body: responseData,
            headers: this.getCacheableHeaders(reply),
            status: reply.statusCode,
            timestamp: Date.now(),
          };

          this.cache.set(key, cacheData, options).catch((err: Error) => {
            console.error('Cache set error:', err);
          });
        }
      });

      reply.header('X-Cache', 'MISS');
      reply.header('X-Cache-Key', key);
    };
  }

  /**
   * Invalidation hook
   */
  invalidate(pattern?: string | ((req: FastifyRequest) => string[])) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        if (typeof pattern === 'function') {
          const keys = pattern(request);
          await this.cache.delete(keys);
        } else if (pattern) {
          const keys = await this.findKeys(pattern);
          await this.cache.delete(keys);
        } else {
          // Invalidate based on request
          const key = this.generateKey(request, {});
          await this.cache.delete(key);
        }
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }
    };
  }

  /**
   * Tag-based invalidation hook
   */
  invalidateTags(tagGenerator: (req: FastifyRequest) => string[]) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const tags = tagGenerator(request);
        await this.cache.deleteByTags(tags);
      } catch (err) {
        console.error('Tag invalidation error:', err);
      }
    };
  }

  private generateKey(request: FastifyRequest, options: CacheMiddlewareOptions): string {
    const parts = [request.method, request.url];

    // Include query parameters
    if (options.includeQuery !== false && Object.keys(request.query || {}).length > 0) {
      const sortedQuery = Object.keys(request.query as any)
        .sort()
        .map((k) => `${k}=${(request.query as any)[k]}`)
        .join('&');
      parts.push(sortedQuery);
    }

    // Include body for POST requests
    if (options.includeBody && request.body) {
      const bodyHash = crypto.createHash('md5').update(JSON.stringify(request.body)).digest('hex');
      parts.push(bodyHash);
    }

    // Vary by headers
    if (options.varyByHeaders) {
      options.varyByHeaders.forEach((header) => {
        const value = request.headers[header.toLowerCase()];
        if (value) {
          parts.push(`${header}:${value}`);
        }
      });
    }

    // Vary by user
    if (options.varyByUser && (request as any).user) {
      parts.push(`user:${(request as any).user.id}`);
    }

    return parts.join(':');
  }

  private getCacheableHeaders(reply: FastifyReply): Record<string, string> {
    const headers: Record<string, string> = {};
    const cacheableHeaders = [
      'content-type',
      'content-encoding',
      'cache-control',
      'etag',
      'last-modified',
    ];

    cacheableHeaders.forEach((header) => {
      const value = reply.getHeader(header);
      if (value && typeof value === 'string') {
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
