import crypto from 'crypto';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));

import {
  idempotencyMiddleware,
  captureIdempotentResponse,
} from '../../../src/middleware/idempotency.middleware';

// Helper to generate the same hash the middleware uses
function hashRequestBody(body: any): string {
  const content = JSON.stringify(body || {});
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

describe('idempotency.middleware', () => {
  const createRequest = (overrides: any = {}) => ({
    method: 'POST',
    url: '/auth/register',
    headers: {},
    body: { email: 'test@example.com' },
    user: { tenant_id: 'tenant-1' },
    ...overrides,
  });

  const createReply = () => {
    const reply: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      statusCode: 200,
      getHeader: jest.fn().mockReturnValue('application/json'),
    };
    return reply;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
  });

  describe('idempotencyMiddleware', () => {
    it('skips GET requests', async () => {
      const request = createRequest({ method: 'GET' });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('skips non-idempotent endpoints', async () => {
      const request = createRequest({ url: '/auth/login' });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('skips if no Idempotency-Key header', async () => {
      const request = createRequest();
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('returns 400 for key < 16 characters', async () => {
      const request = createRequest({
        headers: { 'idempotency-key': 'short' },
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_IDEMPOTENCY_KEY' })
      );
    });

    it('returns 400 for key > 64 characters', async () => {
      const request = createRequest({
        headers: { 'idempotency-key': 'a'.repeat(65) },
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('returns cached response on cache hit', async () => {
      const body = { email: 'test@example.com' };
      const requestHash = hashRequestBody(body);
      
      const cachedRecord = {
        statusCode: 201,
        body: { id: 'user-123' },
        headers: { 'content-type': 'application/json' },
        requestHash,
        createdAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      const request = createRequest({
        headers: { 'idempotency-key': 'valid-key-1234567890' },
        body,
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ id: 'user-123' });
    });

    it('returns 422 if key reused with different body', async () => {
      const cachedRecord = {
        statusCode: 201,
        body: { id: 'user-123' },
        headers: {},
        requestHash: 'different-hash',
        createdAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      const request = createRequest({
        headers: { 'idempotency-key': 'valid-key-1234567890' },
        body: { email: 'different@example.com' },
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(422);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'IDEMPOTENCY_KEY_MISMATCH' })
      );
    });

    it('returns 409 if concurrent request in progress', async () => {
      mockRedis.get.mockResolvedValue(null); // No cached response
      mockRedis.set.mockResolvedValue(null); // Lock not acquired

      const request = createRequest({
        headers: { 'idempotency-key': 'valid-key-1234567890' },
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' })
      );
    });

    it('acquires lock for new request', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const request = createRequest({
        headers: { 'idempotency-key': 'valid-key-1234567890' },
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(':lock'),
        '1',
        'EX',
        30,
        'NX'
      );
      expect((request as any).idempotencyKey).toBe('valid-key-1234567890');
    });

    it('uses tenant prefix in Redis key', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const request = createRequest({
        headers: { 'idempotency-key': 'valid-key-1234567890' },
        user: { tenant_id: 'tenant-abc' },
      });
      const reply = createReply();

      await idempotencyMiddleware(request as any, reply);

      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringContaining('tenant:tenant-abc')
      );
    });
  });

  describe('captureIdempotentResponse', () => {
    it('caches 2xx responses', async () => {
      const request: any = {
        idempotencyKey: 'test-key',
        idempotencyRedisKey: 'idempotency:test-key',
        idempotencyRequestHash: 'hash123',
        idempotencyLockKey: 'idempotency:test-key:lock',
        url: '/auth/register',
      };
      const reply = createReply();
      reply.statusCode = 201;

      await captureIdempotentResponse(request, reply, JSON.stringify({ id: 'user-123' }));

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotency:test-key',
        24 * 60 * 60, // 24 hours
        expect.any(String)
      );
    });

    it('does not cache non-2xx responses', async () => {
      const request: any = {
        idempotencyKey: 'test-key',
        idempotencyRedisKey: 'idempotency:test-key',
        idempotencyRequestHash: 'hash123',
        idempotencyLockKey: 'idempotency:test-key:lock',
      };
      const reply = createReply();
      reply.statusCode = 400;

      await captureIdempotentResponse(request, reply, JSON.stringify({ error: 'bad' }));

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('releases lock after response', async () => {
      const request: any = {
        idempotencyKey: 'test-key',
        idempotencyRedisKey: 'idempotency:test-key',
        idempotencyRequestHash: 'hash123',
        idempotencyLockKey: 'idempotency:test-key:lock',
      };
      const reply = createReply();
      reply.statusCode = 201;

      await captureIdempotentResponse(request, reply, '{}');

      expect(mockRedis.del).toHaveBeenCalledWith('idempotency:test-key:lock');
    });

    it('skips if no idempotency key on request', async () => {
      const request: any = { url: '/test' };
      const reply = createReply();

      const result = await captureIdempotentResponse(request, reply, '{}');

      expect(result).toBe('{}');
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });
});
