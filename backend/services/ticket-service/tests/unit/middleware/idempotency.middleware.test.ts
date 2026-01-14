import { FastifyRequest, FastifyReply } from 'fastify';

// Mock prom-client
jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    get: jest.fn().mockResolvedValue({ values: [] }),
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    get: jest.fn().mockResolvedValue({ values: [] }),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    dec: jest.fn(),
    get: jest.fn().mockResolvedValue({ values: [] }),
  })),
}));

// Mock metrics registry
jest.mock('../../../src/utils/metrics', () => ({
  registry: {
    registerMetric: jest.fn(),
  },
}));

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import {
  createIdempotencyMiddleware,
  idempotencyMiddleware,
  idempotencyResponseHook,
  idempotencyErrorHook,
  completeIdempotency,
  cleanupExpiredIdempotencyKeys,
  startIdempotencyCleanup,
  stopIdempotencyCleanup,
  getIdempotencyTTLConfig,
  setIdempotencyTTLConfig,
  recordIdempotencyOperation,
  getIdempotencyMetricsSummary,
} from '../../../src/middleware/idempotency.middleware';
import { DatabaseService } from '../../../src/services/databaseService';

describe('Idempotency Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockHeader = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({
      send: mockSend,
      header: mockHeader,
    });

    mockReply = {
      status: mockStatus,
      send: mockSend,
      header: mockHeader,
      statusCode: 200,
    };

    mockRequest = {
      method: 'POST',
      url: '/api/purchase',
      headers: {},
      body: { eventId: 'event-123' },
    } as any;

    (mockRequest as any).tenantId = 'tenant-456';
  });

  describe('createIdempotencyMiddleware', () => {
    it('should skip non-idempotent methods (GET)', async () => {
      mockRequest.method = 'GET';

      const middleware = createIdempotencyMiddleware({ operation: 'test' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.query).not.toHaveBeenCalled();
    });

    it('should return 400 if tenant context missing and required', async () => {
      (mockRequest as any).tenantId = undefined;
      mockRequest.headers = { 'idempotency-key': 'key-123' };

      const middleware = createIdempotencyMiddleware({ operation: 'test', required: true });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_REQUIRED',
        })
      );
    });

    it('should skip if tenant missing and not required', async () => {
      (mockRequest as any).tenantId = undefined;
      mockRequest.headers = { 'idempotency-key': 'key-123' };

      const middleware = createIdempotencyMiddleware({ operation: 'test', required: false });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should return 400 if idempotency key missing and required', async () => {
      mockRequest.headers = {};

      const middleware = createIdempotencyMiddleware({ operation: 'test', required: true });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        })
      );
    });

    it('should skip if idempotency key missing and not required', async () => {
      mockRequest.headers = {};

      const middleware = createIdempotencyMiddleware({ operation: 'test', required: false });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid idempotency key format', async () => {
      mockRequest.headers = { 'idempotency-key': 'invalid key with spaces!' };

      const middleware = createIdempotencyMiddleware({ operation: 'test' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_IDEMPOTENCY_KEY',
        })
      );
    });

    it('should return 400 for idempotency key exceeding max length', async () => {
      mockRequest.headers = { 'idempotency-key': 'a'.repeat(256) };

      const middleware = createIdempotencyMiddleware({ operation: 'test' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_IDEMPOTENCY_KEY',
        })
      );
    });

    it('should acquire new idempotency key for new request', async () => {
      mockRequest.headers = { 'idempotency-key': 'new-key-123' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          key_id: 'db-key-id',
          status: 'processing',
          is_new: true,
          is_locked: true,
          response_status: null,
          response_body: null,
          resource_id: null,
        }],
      });

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.query).toHaveBeenCalled();
      expect((mockRequest as any).idempotencyKeyId).toBe('db-key-id');
      expect((mockRequest as any).idempotencyOperation).toBe('purchase');
    });

    it('should return cached response for completed key', async () => {
      mockRequest.headers = { 'idempotency-key': 'completed-key' };

      const cachedResponse = { orderId: 'order-123', status: 'completed' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          key_id: 'db-key-id',
          status: 'completed',
          is_new: false,
          is_locked: false,
          response_status: 200,
          response_body: cachedResponse,
          resource_id: 'order-123',
        }],
      });

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockHeader).toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
      expect(mockSend).toHaveBeenCalledWith(cachedResponse);
    });

    it('should return 409 for concurrent request (processing, not locked)', async () => {
      mockRequest.headers = { 'idempotency-key': 'processing-key' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          key_id: 'db-key-id',
          status: 'processing',
          is_new: false,
          is_locked: false,
          response_status: null,
          response_body: null,
          resource_id: null,
        }],
      });

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'REQUEST_IN_PROGRESS',
        })
      );
    });

    it('should allow retry for failed key', async () => {
      mockRequest.headers = { 'idempotency-key': 'failed-key' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          key_id: 'db-key-id',
          status: 'failed',
          is_new: false,
          is_locked: false,
          response_status: 500,
          response_body: null,
          resource_id: null,
        }],
      });

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).idempotencyKeyId).toBe('db-key-id');
      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should accept x-idempotency-key header as alternative', async () => {
      mockRequest.headers = { 'x-idempotency-key': 'alt-key-123' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          key_id: 'db-key-id',
          status: 'processing',
          is_new: true,
          is_locked: true,
        }],
      });

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('should handle database errors in production', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-123' };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_ERROR',
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should continue without idempotency in development on DB error', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-123' };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      const middleware = createIdempotencyMiddleware({ operation: 'purchase' });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('idempotencyResponseHook', () => {
    it('should return payload if no idempotency key on request', async () => {
      const payload = { data: 'test' };

      const result = await idempotencyResponseHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(result).toBe(payload);
      expect(DatabaseService.query).not.toHaveBeenCalled();
    });

    it('should complete idempotency key with response', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      (mockRequest as any).idempotencyOperation = 'purchase';
      (mockReply as any).statusCode = 200;

      const payload = JSON.stringify({ orderId: 'order-123' });

      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [{ complete_idempotency_key: true }] });

      await idempotencyResponseHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('complete_idempotency_key'),
        expect.arrayContaining(['key-id-123', 'completed', 200])
      );
    });

    it('should mark as failed for non-2xx status codes', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      (mockRequest as any).idempotencyOperation = 'purchase';
      (mockReply as any).statusCode = 400;

      const payload = JSON.stringify({ error: 'Bad request' });

      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [{ complete_idempotency_key: true }] });

      await idempotencyResponseHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('complete_idempotency_key'),
        expect.arrayContaining(['key-id-123', 'failed', 400])
      );
    });

    it('should handle non-JSON payload', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      (mockRequest as any).idempotencyOperation = 'purchase';
      (mockReply as any).statusCode = 200;

      const payload = 'plain text response';

      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [{ complete_idempotency_key: true }] });

      await idempotencyResponseHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('should not fail response on completion error', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      (mockRequest as any).idempotencyOperation = 'purchase';
      (mockReply as any).statusCode = 200;

      const payload = { orderId: 'order-123' };

      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await idempotencyResponseHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(result).toBe(payload);
    });
  });

  describe('idempotencyErrorHook', () => {
    it('should not do anything if no idempotency key on request', async () => {
      const error = new Error('Test error');

      await idempotencyErrorHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        error
      );

      expect(DatabaseService.query).not.toHaveBeenCalled();
    });

    it('should release lock on error', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      const error = new Error('Test error');

      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [{ release_idempotency_lock: true }] });

      await idempotencyErrorHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        error
      );

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('release_idempotency_lock'),
        expect.arrayContaining(['key-id-123', true])
      );
    });

    it('should not throw on release error', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      const error = new Error('Test error');

      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        idempotencyErrorHook(mockRequest as FastifyRequest, mockReply as FastifyReply, error)
      ).resolves.not.toThrow();
    });
  });

  describe('completeIdempotency', () => {
    it('should not do anything if no idempotency key on request', async () => {
      await completeIdempotency(mockRequest as FastifyRequest, 200, { data: 'test' });

      expect(DatabaseService.query).not.toHaveBeenCalled();
    });

    it('should complete idempotency key manually', async () => {
      (mockRequest as any).idempotencyKeyId = 'key-id-123';
      (mockRequest as any).idempotencyOperation = 'purchase';

      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [] });

      await completeIdempotency(
        mockRequest as FastifyRequest,
        200,
        { orderId: 'order-123' },
        'order-123'
      );

      expect(DatabaseService.query).toHaveBeenCalled();
    });
  });

  describe('idempotencyMiddleware presets', () => {
    it('should have purchase middleware', () => {
      expect(idempotencyMiddleware.purchase).toBeDefined();
      expect(typeof idempotencyMiddleware.purchase).toBe('function');
    });

    it('should have reservation middleware', () => {
      expect(idempotencyMiddleware.reservation).toBeDefined();
      expect(typeof idempotencyMiddleware.reservation).toBe('function');
    });

    it('should have transfer middleware', () => {
      expect(idempotencyMiddleware.transfer).toBeDefined();
    });

    it('should have refund middleware', () => {
      expect(idempotencyMiddleware.refund).toBeDefined();
    });

    it('should have generic middleware', () => {
      expect(idempotencyMiddleware.generic).toBeDefined();
    });

    it('should have optional middleware factory', () => {
      expect(typeof idempotencyMiddleware.optional).toBe('function');
      const optionalMiddleware = idempotencyMiddleware.optional('test');
      expect(typeof optionalMiddleware).toBe('function');
    });
  });

  describe('cleanupExpiredIdempotencyKeys', () => {
    it('should execute cleanup query', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ deleted_count: '5' }],
      });

      const result = await cleanupExpiredIdempotencyKeys();

      expect(result).toBe(5);
      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('should return 0 if no rows deleted', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ deleted_count: '0' }],
      });

      const result = await cleanupExpiredIdempotencyKeys();

      expect(result).toBe(0);
    });

    it('should throw on database error', async () => {
      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(cleanupExpiredIdempotencyKeys()).rejects.toThrow('DB error');
    });
  });

  describe('TTL Configuration', () => {
    it('should return default TTL config', () => {
      const config = getIdempotencyTTLConfig();

      expect(config.completedTTLHours).toBeDefined();
      expect(config.failedTTLHours).toBeDefined();
      expect(config.processingTTLMinutes).toBeDefined();
    });

    it('should update TTL config', () => {
      const originalConfig = getIdempotencyTTLConfig();

      setIdempotencyTTLConfig({ completedTTLHours: 48 });

      const newConfig = getIdempotencyTTLConfig();
      expect(newConfig.completedTTLHours).toBe(48);

      // Reset
      setIdempotencyTTLConfig(originalConfig);
    });
  });

  describe('Cleanup Scheduler', () => {
    it('should start and stop cleanup scheduler', () => {
      startIdempotencyCleanup({ cleanupIntervalMinutes: 1 });

      // Should not throw
      stopIdempotencyCleanup();
    });

    it('should handle multiple start calls', () => {
      startIdempotencyCleanup();
      startIdempotencyCleanup(); // Should clear previous interval

      stopIdempotencyCleanup();
    });
  });

  describe('Metrics', () => {
    it('should record idempotency operation', () => {
      expect(() => {
        recordIdempotencyOperation('purchase', 'acquired', 'success');
      }).not.toThrow();
    });

    it('should get metrics summary', async () => {
      const summary = await getIdempotencyMetricsSummary();

      expect(summary).toHaveProperty('totalOperations');
      expect(summary).toHaveProperty('cacheHitRate');
      expect(summary).toHaveProperty('conflictCount');
      expect(summary).toHaveProperty('activeLocks');
      expect(summary).toHaveProperty('expiredKeys');
    });
  });
});
