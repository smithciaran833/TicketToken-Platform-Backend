import { Request, Response, NextFunction } from 'express';
import { idempotencyMiddleware } from '../../src/middleware/idempotency';
import { RedisService } from '../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

jest.mock('../../src/services/redisService');

describe('Idempotency Middleware - 100% Coverage', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: jest.Mock;
  let sendMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn((body) => res as Response);
    sendMock = jest.fn((body) => res as Response);
    statusMock = jest.fn((code) => {
      (res as any).statusCode = code;
      return res as Response;
    });

    req = {
      headers: {},
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'test@example.com',
        role: 'admin'
      },
      path: '/test',
      method: 'POST'
    } as Partial<Request>;

    res = {
      status: statusMock,
      json: jsonMock,
      send: sendMock,
      statusCode: 200
    } as Partial<Response>;

    next = jest.fn();
  });

  describe('Error Handling - Cache Failures', () => {
    it('should handle Redis set failure when caching 2xx response', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Redis set failed'));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 200;
      const wrappedJson = res.json!;
      wrappedJson({ success: true });

      // Wait for async caching to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.set).toHaveBeenCalledTimes(2);
    });

    it('should handle Redis del failure when deleting 5xx key', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);
      (RedisService.del as jest.Mock).mockRejectedValue(new Error('Redis del failed'));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 500;
      const wrappedJson = res.json!;
      wrappedJson({ error: 'Server error' });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.del).toHaveBeenCalledTimes(1);
    });

    it('should handle Redis set failure when caching 4xx response', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Redis set failed'));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 400;
      const wrappedJson = res.json!;
      wrappedJson({ error: 'Bad request' });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.set).toHaveBeenCalledTimes(2);
    });

    it('should handle cacheResponse failure in json override catch block', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValueOnce(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (RedisService.set as jest.Mock).mockRejectedValueOnce(new Error('Catastrophic failure'));

      (res as any).statusCode = 200;
      const wrappedJson = res.json!;
      
      // Call wrapped function - should not throw
      const result = wrappedJson({ success: true });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(jsonMock).toHaveBeenCalledWith({ success: true });
      expect(result).toBe(res);
    });
  });

  describe('res.send Override', () => {
    it('should cache response when using res.send method', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 200;
      const wrappedSend = res.send!;
      wrappedSend('Success response');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.stringContaining('"statusCode":200'),
        86400
      );
      
      expect(sendMock).toHaveBeenCalledWith('Success response');
    });

    it('should handle cacheResponse failure in send override', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Cache failure'));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 200;
      const wrappedSend = res.send!;
      
      const result = wrappedSend('Success');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(sendMock).toHaveBeenCalledWith('Success');
      expect(result).toBe(res);
    });

    it('should handle res.send with 4xx status', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 404;
      const wrappedSend = res.send!;
      wrappedSend('Not found');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.stringContaining('"statusCode":404'),
        3600
      );
    });

    it('should handle res.send with 5xx status and delete key', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);
      (RedisService.del as jest.Mock).mockResolvedValue(1);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 503;
      const wrappedSend = res.send!;
      wrappedSend('Service unavailable');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.del).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple calls to res.json (responseSent guard)', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 200;
      const wrappedJson = res.json!;
      
      wrappedJson({ first: true });
      wrappedJson({ second: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.set).toHaveBeenCalledTimes(2);
    });

    it('should handle status codes outside 2xx, 4xx, 5xx ranges', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      (res as any).statusCode = 302;
      const wrappedJson = res.json!;
      wrappedJson({ redirect: '/somewhere' });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(RedisService.set).toHaveBeenCalledTimes(1);
    });

    it('should use tenantId when available', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;
      (req as any).user = {
        id: '11111111-1111-1111-1111-111111111111',
        tenantId: '22222222-2222-2222-2222-222222222222',
        email: 'test@example.com',
        role: 'admin'
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(RedisService.get).toHaveBeenCalledWith(
        expect.stringContaining('22222222-2222-2222-2222-222222222222')
      );
    });
  });
});
