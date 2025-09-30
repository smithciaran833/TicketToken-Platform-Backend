import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redisService';
import { validate as isUUID } from 'uuid';

interface IdempotencyOptions {
  ttlMs: number;
}

export function idempotencyMiddleware(options: IdempotencyOptions) {
  const { ttlMs } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    // 1. Require key for mutations
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Idempotency-Key header required',
        code: 'IDEMPOTENCY_KEY_MISSING',
        details: 'All payment operations require an Idempotency-Key header with a UUID value'
      });
    }

    // 2. Validate format (must be UUID)
    if (!isUUID(idempotencyKey)) {
      return res.status(400).json({
        error: 'Idempotency-Key must be a valid UUID',
        code: 'IDEMPOTENCY_KEY_INVALID',
        details: 'Use a UUID v4 format like: 123e4567-e89b-12d3-a456-426614174000'
      });
    }

    // 3. Scope by user (required)
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Use tenantId if available, otherwise use userId as scope
    const tenantId = (req as any).user?.tenantId || userId;
    const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

    try {
      // 4. Check if request already processed
      const cached = await RedisService.get(redisKey);

      if (cached) {
        const cachedResponse = JSON.parse(cached);

        // If still processing (102), return 409
        if (cachedResponse.statusCode === 102) {
          console.warn('Concurrent duplicate request detected', {
            idempotencyKey,
            userId,
            tenantId,
            path: req.path
          });

          return res.status(409).json({
            error: 'Request already processing',
            code: 'DUPLICATE_IN_PROGRESS',
            details: 'A request with this idempotency key is currently being processed'
          });
        }

        // Return cached response
        console.info('Returning cached idempotent response', {
          idempotencyKey,
          userId,
          tenantId,
          originalStatus: cachedResponse.statusCode
        });

        return res.status(cachedResponse.statusCode).json(cachedResponse.body);
      }

      // 5. Mark as in-progress to prevent concurrent duplicates
      await RedisService.set(
        redisKey,
        JSON.stringify({
          statusCode: 102,
          body: { processing: true },
          startedAt: new Date().toISOString()
        }),
        Math.floor(ttlMs / 1000)
      );

      // 6. Intercept response to cache result
      const originalJson = res.json?.bind(res);
      const originalSend = res.send?.bind(res);
      
      if (!originalJson) {
        // If json method doesn't exist, skip response wrapping (test environment)
        console.warn('res.json not available, skipping response caching');
        return next();
      }

      let responseSent = false;

      const cacheResponse = async (body: any) => {
        if (responseSent) return;
        responseSent = true;

        const statusCode = res.statusCode;

        // Cache successful responses (2xx) for 24 hours
        if (statusCode >= 200 && statusCode < 300) {
          await RedisService.set(
            redisKey,
            JSON.stringify({
              statusCode,
              body,
              completedAt: new Date().toISOString()
            }),
            86400  // 24 hours
          ).catch(err => {
            console.error('Failed to cache successful response', { err, idempotencyKey });
          });
        }
        // Delete key on server errors (5xx) to allow retry
        else if (statusCode >= 500) {
          await RedisService.del(redisKey).catch(err => {
            console.error('Failed to delete key after server error', { err, idempotencyKey });
          });
        }
        // Keep key for client errors (4xx) to prevent retry
        else if (statusCode >= 400 && statusCode < 500) {
          await RedisService.set(
            redisKey,
            JSON.stringify({
              statusCode,
              body,
              completedAt: new Date().toISOString()
            }),
            3600  // 1 hour for errors
          ).catch(err => {
            console.error('Failed to cache error response', { err, idempotencyKey });
          });
        }
      };

      // Override json method
      res.json = function(body: any) {
        cacheResponse(body).then(() => {
          if (originalJson) {
            originalJson(body);
          }
        }).catch(err => {
          console.error('Cache response failed', { err });
          if (originalJson) {
            originalJson(body);
          }
        });
        return res;
      };

      // Override send method if it exists
      if (originalSend) {
        res.send = function(body: any) {
          cacheResponse(body).then(() => {
            originalSend(body);
          }).catch(err => {
            console.error('Cache response failed', { err });
            originalSend(body);
          });
          return res;
        };
      }

      next();

    } catch (err) {
      console.error('Idempotency middleware error', { err, idempotencyKey });
      // On Redis failure, proceed without idempotency (degraded mode)
      next();
    }
  };
}
