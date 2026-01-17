/**
 * Idempotency Middleware Unit Tests
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisQuit = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    quit: mockRedisQuit,
  }));
});

import {
  idempotencyMiddleware,
  requireIdempotencyKey,
  closeIdempotency,
} from '../../../src/middleware/idempotency';
import { logger } from '../../../src/utils/logger';
import { BadRequestError, ConflictError } from '../../../src/errors';

// Helper to compute request hash (matching the middleware implementation)
function computeRequestHash(method: string, url: string, body: any): string {
  const data = JSON.stringify({
    method,
    url,
    body,
  });
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

describe('Idempotency Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let sendMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      method: 'POST',
      url: '/api/orders',
      headers: {},
      body: { item: 'ticket', quantity: 2 },
    };

    // Create send mock that returns undefined (simulating Fastify's early return)
    sendMock = jest.fn().mockReturnValue(undefined);
    
    // Create status mock that returns an object with send
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock,
      header: jest.fn().mockReturnThis(),
      send: sendMock,
      then: jest.fn(),
      statusCode: 200,
    };

    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  describe('idempotencyMiddleware', () => {
    it('should skip non-mutating methods (GET)', async () => {
      mockRequest.method = 'GET';

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should skip non-mutating methods (DELETE)', async () => {
      mockRequest.method = 'DELETE';

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should log debug when no idempotency key provided', async () => {
      await idempotencyMiddleware(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'idempotency_key_missing',
        }),
        'No idempotency key provided'
      );
    });

    it('should reject idempotency key that is too short', async () => {
      mockRequest.headers['idempotency-key'] = 'short';

      await expect(idempotencyMiddleware(mockRequest, mockReply))
        .rejects.toThrow(BadRequestError);
    });

    it('should reject idempotency key that is too long', async () => {
      mockRequest.headers['idempotency-key'] = 'a'.repeat(65);

      await expect(idempotencyMiddleware(mockRequest, mockReply))
        .rejects.toThrow(BadRequestError);
    });

    it('should set idempotencyKey on request', async () => {
      const key = 'valid-idempotency-key-12345';
      mockRequest.headers['idempotency-key'] = key;

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRequest.idempotencyKey).toBe(key);
    });

    it('should create processing record for new request', async () => {
      mockRequest.headers['idempotency-key'] = 'new-request-key-123';

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('analytics:idempotency:'),
        expect.stringContaining('"status":"processing"'),
        'EX',
        86400,
        'NX'
      );
    });

    it('should return cached response for completed request', async () => {
      mockRequest.headers['idempotency-key'] = 'completed-key-123';
      
      // Compute the actual hash for this request
      const requestHash = computeRequestHash(mockRequest.method, mockRequest.url, mockRequest.body);
      
      const cachedRecord = {
        status: 'completed',
        statusCode: 201,
        response: { id: 'order-123', status: 'created' },
        createdAt: new Date().toISOString(),
        requestHash: requestHash,
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedRecord));

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('x-idempotent-replayed', 'true');
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(sendMock).toHaveBeenCalledWith(cachedRecord.response);
    });

    it('should return cached response when requestHash is not stored', async () => {
      mockRequest.headers['idempotency-key'] = 'completed-no-hash-key';
      
      const cachedRecord = {
        status: 'completed',
        statusCode: 200,
        response: { success: true },
        createdAt: new Date().toISOString(),
        // No requestHash - older record format
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedRecord));

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('x-idempotent-replayed', 'true');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(sendMock).toHaveBeenCalledWith({ success: true });
    });

    it('should throw ConflictError for request still processing', async () => {
      mockRequest.headers['idempotency-key'] = 'processing-key-123';
      
      // Compute the actual hash for this request
      const requestHash = computeRequestHash(mockRequest.method, mockRequest.url, mockRequest.body);
      
      const processingRecord = {
        status: 'processing',
        createdAt: new Date().toISOString(),
        requestHash: requestHash,
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(processingRecord));

      await expect(idempotencyMiddleware(mockRequest, mockReply))
        .rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError for mismatched request payload', async () => {
      mockRequest.headers['idempotency-key'] = 'mismatch-key-123';
      
      const existingRecord = {
        status: 'processing',
        createdAt: new Date().toISOString(),
        requestHash: 'different-hash-value',
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(existingRecord));

      await expect(idempotencyMiddleware(mockRequest, mockReply))
        .rejects.toThrow(ConflictError);
    });

    it('should allow retry after previous failure', async () => {
      mockRequest.headers['idempotency-key'] = 'failed-key-123';
      
      // Compute the actual hash for this request
      const requestHash = computeRequestHash(mockRequest.method, mockRequest.url, mockRequest.body);
      
      const failedRecord = {
        status: 'failed',
        createdAt: new Date().toISOString(),
        requestHash: requestHash,
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(failedRecord));

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'idempotency_retry_after_failure',
        }),
        'Allowing retry after previous failure'
      );
    });

    it('should handle race condition (NX returns null)', async () => {
      mockRequest.headers['idempotency-key'] = 'race-key-12345678';
      mockRedisSet.mockResolvedValue(null);

      await expect(idempotencyMiddleware(mockRequest, mockReply))
        .rejects.toThrow(ConflictError);
    });

    it('should continue on Redis errors', async () => {
      mockRequest.headers['idempotency-key'] = 'redis-error-key-12';
      mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'idempotency_check_error',
        }),
        'Idempotency check failed, continuing without'
      );
    });

    it('should apply to PUT requests', async () => {
      mockRequest.method = 'PUT';
      mockRequest.headers['idempotency-key'] = 'put-request-key-123';

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRedisGet).toHaveBeenCalled();
    });

    it('should apply to PATCH requests', async () => {
      mockRequest.method = 'PATCH';
      mockRequest.headers['idempotency-key'] = 'patch-request-key-123';

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRedisGet).toHaveBeenCalled();
    });

    it('should log cache hit for completed request', async () => {
      mockRequest.headers['idempotency-key'] = 'cache-hit-key-123';
      const requestHash = computeRequestHash(mockRequest.method, mockRequest.url, mockRequest.body);
      
      const cachedRecord = {
        status: 'completed',
        statusCode: 200,
        response: { data: 'cached' },
        createdAt: new Date().toISOString(),
        requestHash,
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedRecord));

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'idempotency_cache_hit',
          idempotencyKey: 'cache-hit-key-123',
          statusCode: 200,
        }),
        'Returning cached idempotent response'
      );
    });

    it('should include tenant in cache key when available', async () => {
      mockRequest.headers['idempotency-key'] = 'tenant-key-12345678';
      mockRequest.tenantContext = { tenantId: 'tenant-123' };

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringContaining('tenant-123')
      );
    });

    it('should use default status code 200 when not stored', async () => {
      mockRequest.headers['idempotency-key'] = 'no-status-code-key';
      const requestHash = computeRequestHash(mockRequest.method, mockRequest.url, mockRequest.body);
      
      const cachedRecord = {
        status: 'completed',
        // statusCode not set
        response: { result: 'ok' },
        createdAt: new Date().toISOString(),
        requestHash,
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedRecord));

      await idempotencyMiddleware(mockRequest, mockReply);

      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe('requireIdempotencyKey', () => {
    it('should skip non-mutating methods', async () => {
      mockRequest.method = 'GET';

      await requireIdempotencyKey(mockRequest, mockReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError when key missing on POST', async () => {
      mockRequest.method = 'POST';

      await expect(requireIdempotencyKey(mockRequest, mockReply))
        .rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when key missing on PUT', async () => {
      mockRequest.method = 'PUT';

      await expect(requireIdempotencyKey(mockRequest, mockReply))
        .rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when key missing on PATCH', async () => {
      mockRequest.method = 'PATCH';

      await expect(requireIdempotencyKey(mockRequest, mockReply))
        .rejects.toThrow(BadRequestError);
    });

    it('should call idempotencyMiddleware when key present', async () => {
      mockRequest.headers['idempotency-key'] = 'required-key-12345';

      await requireIdempotencyKey(mockRequest, mockReply);

      expect(mockRedisGet).toHaveBeenCalled();
    });
  });

  describe('closeIdempotency', () => {
    it('should quit Redis connection', async () => {
      // Force initialization by calling middleware
      mockRequest.headers['idempotency-key'] = 'init-key-12345678';
      await idempotencyMiddleware(mockRequest, mockReply);

      await closeIdempotency();

      expect(mockRedisQuit).toHaveBeenCalled();
    });
  });
});
