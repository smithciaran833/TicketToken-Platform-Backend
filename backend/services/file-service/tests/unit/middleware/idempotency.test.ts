/**
 * Unit Tests for Idempotency Middleware
 */

import { FastifyRequest } from 'fastify';
import {
  idempotencyMiddleware,
  captureIdempotencyResponse,
  markIdempotencyFailed,
  clearIdempotencyEntry,
  getIdempotencyMetrics,
  checkFileHashDuplicate,
  storeFileHash,
  computeFileHash,
  setRecoveryPoint,
  getRecoveryPoint,
} from '../../../src/middleware/idempotency';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('middleware/idempotency', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockServer: any;
  let testKeyCounter = 0;

  const createMockReply = () => ({
    status: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    sent: false,
  });

  const getUniqueKey = (prefix: string) => `${prefix}-${Date.now()}-${++testKeyCounter}`;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServer = {
      redis: null,
    };

    mockRequest = {
      id: 'req-123',
      method: 'POST',
      url: '/api/upload',
      headers: {},
      server: mockServer,
    };

    mockReply = createMockReply();
  });

  describe('idempotencyMiddleware', () => {
    it('should skip non-mutating requests', async () => {
      mockRequest.method = 'GET';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should skip requests without idempotency key', async () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {};

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject idempotency key shorter than 16 characters', async () => {
      mockRequest.headers = {
        'idempotency-key': 'short',
      };

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          detail: expect.stringContaining('16-128 characters'),
        })
      );
    });

    it('should reject idempotency key longer than 128 characters', async () => {
      mockRequest.headers = {
        'idempotency-key': 'a'.repeat(129),
      };

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should accept valid idempotency key (16-128 chars)', async () => {
      const validKey = getUniqueKey('valid-idempotency-key');
      mockRequest.headers = {
        'idempotency-key': validKey,
      };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      expect(mockRequest.idempotencyKey).toBe(validKey);
      expect(mockRequest.idempotencyCacheKey).toBeDefined();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should return 409 when request is processing', async () => {
      const key = getUniqueKey('processing-request-key');
      mockRequest.headers = {
        'idempotency-key': key,
      };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      const mockRequest2 = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
      };
      const mockReply2 = createMockReply();

      await idempotencyMiddleware(mockRequest2 as FastifyRequest, mockReply2 as any);

      expect(mockReply2.status).toHaveBeenCalledWith(409);
      expect(mockReply2.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 409,
          detail: expect.stringContaining('still being processed'),
        })
      );
      expect(mockReply2.header).toHaveBeenCalledWith('X-Idempotent-Status', 'processing');
    });

    it('should replay completed request response', async () => {
      const key = getUniqueKey('completed-request-key');
      mockRequest.headers = {
        'idempotency-key': key,
      };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        200,
        { success: true, fileId: 'file-789' },
        'file-789'
      );

      const mockRequest2 = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
      };
      const mockReply2 = createMockReply();

      await idempotencyMiddleware(mockRequest2 as FastifyRequest, mockReply2 as any);

      expect(mockReply2.header).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
      expect(mockReply2.code).toHaveBeenCalledWith(200);
      expect(mockReply2.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          fileId: 'file-789',
        })
      );
    });

    it('should allow retry of failed requests', async () => {
      const key = getUniqueKey('failed-request-key');
      mockRequest.headers = {
        'idempotency-key': key,
      };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      await markIdempotencyFailed(mockRequest as FastifyRequest, 'Upload failed');

      const mockRequest2 = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
      };
      const mockReply2 = createMockReply();

      await idempotencyMiddleware(mockRequest2 as FastifyRequest, mockReply2 as any);

      expect(mockReply2.status).not.toHaveBeenCalledWith(409);
      expect(mockRequest2.idempotencyKey).toBe(key);
    });
  });

  describe('captureIdempotencyResponse', () => {
    it('should capture successful response', async () => {
      const key = getUniqueKey('capture-test-key');
      mockRequest.headers = { 'idempotency-key': key };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      const statusCode = 201;
      const body = { success: true, id: 'file-123' };

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        statusCode,
        body,
        'file-123'
      );

      const mockRequest2 = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
      };
      const mockReply2 = createMockReply();

      await idempotencyMiddleware(mockRequest2 as FastifyRequest, mockReply2 as any);

      expect(mockReply2.code).toHaveBeenCalledWith(201);
      expect(mockReply2.send).toHaveBeenCalledWith(body);
    });

    it('should skip capture when no cache key', async () => {
      const reqWithoutCacheKey = { ...mockRequest, idempotencyCacheKey: undefined };

      await expect(
        captureIdempotencyResponse(reqWithoutCacheKey as FastifyRequest, 200, {})
      ).resolves.not.toThrow();
    });

    it('should store file hash when provided', async () => {
      const key = getUniqueKey('hash-test-key');
      const tenantId = 'tenant-hash-123';
      mockRequest.headers = { 'idempotency-key': key };
      mockRequest.tenantId = tenantId;

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      const fileHash = `abc123def456-${Date.now()}`;
      const fileId = 'file-456';

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        200,
        { success: true },
        fileId,
        fileHash
      );

      const result = await checkFileHashDuplicate(fileHash, tenantId);

      expect(result.exists).toBe(true);
      expect(result.fileId).toBe(fileId);
    });
  });

  describe('markIdempotencyFailed', () => {
    it('should mark request as failed', async () => {
      const key = getUniqueKey('fail-test-key');
      mockRequest.headers = { 'idempotency-key': key };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);
      await markIdempotencyFailed(mockRequest as FastifyRequest, 'Database error');

      const mockRequest2 = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
      };
      const mockReply2 = createMockReply();

      await idempotencyMiddleware(mockRequest2 as FastifyRequest, mockReply2 as any);

      expect(mockReply2.status).not.toHaveBeenCalledWith(409);
    });

    it('should skip when no cache key', async () => {
      const reqWithoutCacheKey = { ...mockRequest, idempotencyCacheKey: undefined };

      await expect(
        markIdempotencyFailed(reqWithoutCacheKey as FastifyRequest, 'error')
      ).resolves.not.toThrow();
    });
  });

  describe('clearIdempotencyEntry', () => {
    it('should clear entry to allow retry', async () => {
      const key = getUniqueKey('clear-test-key');
      mockRequest.headers = { 'idempotency-key': key };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);
      await clearIdempotencyEntry(mockRequest as FastifyRequest);

      const mockRequest2 = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
      };
      const mockReply2 = createMockReply();

      await idempotencyMiddleware(mockRequest2 as FastifyRequest, mockReply2 as any);

      expect(mockReply2.status).not.toHaveBeenCalledWith(409);
    });
  });

  describe('getIdempotencyMetrics', () => {
    it('should return metrics object', () => {
      const metrics = getIdempotencyMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('replays');
      expect(metrics).toHaveProperty('hashDuplicates');
      expect(metrics).toHaveProperty('processing');
      expect(metrics).toHaveProperty('completed');
      expect(metrics).toHaveProperty('failed');
    });

    it('should track request counts', async () => {
      const metricsBefore = getIdempotencyMetrics();
      const totalBefore = metricsBefore.totalRequests;

      const key = getUniqueKey('metrics-test-key');
      mockRequest.headers = { 'idempotency-key': key };
      mockRequest.tenantId = 'tenant-123';

      await idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as any);

      const metricsAfter = getIdempotencyMetrics();
      expect(metricsAfter.totalRequests).toBeGreaterThan(totalBefore);
    });
  });

  describe('File Hash Deduplication', () => {
    describe('computeFileHash', () => {
      it('should compute SHA-256 hash of buffer', () => {
        const buffer = Buffer.from('test file content');
        const hash = computeFileHash(buffer);

        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should produce same hash for same content', () => {
        const buffer1 = Buffer.from('identical content');
        const buffer2 = Buffer.from('identical content');

        const hash1 = computeFileHash(buffer1);
        const hash2 = computeFileHash(buffer2);

        expect(hash1).toBe(hash2);
      });

      it('should produce different hash for different content', () => {
        const buffer1 = Buffer.from('content A');
        const buffer2 = Buffer.from('content B');

        const hash1 = computeFileHash(buffer1);
        const hash2 = computeFileHash(buffer2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('storeFileHash and checkFileHashDuplicate', () => {
      it('should store and retrieve file hash', async () => {
        const hash = `test-hash-${Date.now()}`;
        const fileId = 'file-999';
        const tenantId = 'tenant-456';

        await storeFileHash(hash, fileId, tenantId);

        const result = await checkFileHashDuplicate(hash, tenantId);

        expect(result.exists).toBe(true);
        expect(result.fileId).toBe(fileId);
      });

      it('should return not exists for unknown hash', async () => {
        const result = await checkFileHashDuplicate(`unknown-hash-${Date.now()}`, 'tenant-789');

        expect(result.exists).toBe(false);
        expect(result.fileId).toBeUndefined();
      });

      it('should isolate hashes by tenant', async () => {
        const hash = `shared-hash-${Date.now()}`;
        await storeFileHash(hash, 'file-tenant1', 'tenant-1');
        await storeFileHash(hash, 'file-tenant2', 'tenant-2');

        const result1 = await checkFileHashDuplicate(hash, 'tenant-1');
        const result2 = await checkFileHashDuplicate(hash, 'tenant-2');

        expect(result1.fileId).toBe('file-tenant1');
        expect(result2.fileId).toBe('file-tenant2');
      });
    });
  });

  describe('Recovery Points', () => {
    let recoveryRequest: any;

    beforeEach(async () => {
      const key = getUniqueKey('recovery-test-key');
      recoveryRequest = {
        ...mockRequest,
        headers: { 'idempotency-key': key },
        tenantId: 'tenant-recovery',
      };

      await idempotencyMiddleware(recoveryRequest as FastifyRequest, mockReply as any);
    });

    describe('setRecoveryPoint', () => {
      it('should set upload_started recovery point', async () => {
        await setRecoveryPoint(recoveryRequest as FastifyRequest, 'upload_started');

        const { point } = await getRecoveryPoint(recoveryRequest as FastifyRequest);
        expect(point).toBe('upload_started');
      });

      it('should set virus_scan_complete with data', async () => {
        const scanData = { clean: true, scanTime: 150 };
        await setRecoveryPoint(recoveryRequest as FastifyRequest, 'virus_scan_complete', scanData);

        const { point, data } = await getRecoveryPoint(recoveryRequest as FastifyRequest);
        expect(point).toBe('virus_scan_complete');
        expect(data).toEqual(scanData);
      });

      it('should update recovery point', async () => {
        await setRecoveryPoint(recoveryRequest as FastifyRequest, 'upload_started');
        await setRecoveryPoint(recoveryRequest as FastifyRequest, 'metadata_extracted');

        const { point } = await getRecoveryPoint(recoveryRequest as FastifyRequest);
        expect(point).toBe('metadata_extracted');
      });

      it('should skip when no cache key', async () => {
        const reqWithoutCacheKey = { ...mockRequest, idempotencyCacheKey: undefined };

        await expect(
          setRecoveryPoint(reqWithoutCacheKey as FastifyRequest, 'upload_started')
        ).resolves.not.toThrow();
      });
    });

    describe('getRecoveryPoint', () => {
      it('should return empty when no recovery point set', async () => {
        // Create fresh request without setting recovery point
        const freshKey = getUniqueKey('fresh-recovery-key');
        const freshRequest = {
          ...mockRequest,
          headers: { 'idempotency-key': freshKey },
          tenantId: 'tenant-fresh',
        };
        const freshReply = createMockReply();

        await idempotencyMiddleware(freshRequest as FastifyRequest, freshReply as any);

        const result = await getRecoveryPoint(freshRequest as FastifyRequest);

        expect(result.point).toBeUndefined();
        expect(result.data).toBeUndefined();
      });

      it('should return recovery point and data', async () => {
        const pointData = { uploadId: 'upload-123', chunks: 5 };
        await setRecoveryPoint(recoveryRequest as FastifyRequest, 'file_stored', pointData);

        const result = await getRecoveryPoint(recoveryRequest as FastifyRequest);

        expect(result.point).toBe('file_stored');
        expect(result.data).toEqual(pointData);
      });

      it('should skip when no cache key', async () => {
        const reqWithoutCacheKey = { ...mockRequest, idempotencyCacheKey: undefined };

        const result = await getRecoveryPoint(reqWithoutCacheKey as FastifyRequest);
        expect(result).toEqual({});
      });
    });

    it('should support all recovery point types', async () => {
      const points: Array<'upload_started' | 'virus_scan_complete' | 'metadata_extracted' | 'file_stored' | 'db_record_created' | 'upload_complete'> = [
        'upload_started',
        'virus_scan_complete',
        'metadata_extracted',
        'file_stored',
        'db_record_created',
        'upload_complete',
      ];

      for (const pointType of points) {
        await setRecoveryPoint(recoveryRequest as FastifyRequest, pointType);
        const result = await getRecoveryPoint(recoveryRequest as FastifyRequest);
        expect(result.point).toBe(pointType);
      }
    });
  });
});
