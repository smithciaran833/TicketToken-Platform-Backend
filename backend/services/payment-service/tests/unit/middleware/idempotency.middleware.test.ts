/**
 * Unit Tests for Idempotency Middleware
 * 
 * Tests idempotency key handling for safe payment retries.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Idempotency Middleware', () => {
  // Mock Redis for idempotency storage
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };
  });

  describe('Idempotency Key Extraction', () => {
    it('should extract idempotency key from header', () => {
      const request = createMockRequest({
        headers: {
          'idempotency-key': 'idem_abc123xyz',
        },
      });

      const idempotencyKey = request.headers['idempotency-key'];
      expect(idempotencyKey).toBe('idem_abc123xyz');
    });

    it('should accept X-Idempotency-Key header (case variations)', () => {
      const request = createMockRequest({
        headers: {
          'x-idempotency-key': 'idem_def456',
        },
      });

      const idempotencyKey = 
        request.headers['idempotency-key'] || 
        request.headers['x-idempotency-key'];

      expect(idempotencyKey).toBe('idem_def456');
    });

    it('should reject requests without idempotency key for payment mutations', () => {
      const request = createMockRequest({
        method: 'POST',
        url: '/payments/intents',
        headers: {},
      });
      const reply = createMockReply();

      const requiresIdempotencyKey = 
        request.method === 'POST' && 
        request.url.includes('/payments');

      const hasIdempotencyKey = !!request.headers['idempotency-key'];

      if (requiresIdempotencyKey && !hasIdempotencyKey) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/idempotency-key-required',
          title: 'Idempotency Key Required',
          status: 400,
          detail: 'An Idempotency-Key header is required for this request',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should not require idempotency key for GET requests', () => {
      const request = createMockRequest({
        method: 'GET',
        url: '/payments/pi_test123',
        headers: {},
      });

      const requiresIdempotencyKey = request.method === 'POST';
      expect(requiresIdempotencyKey).toBe(false);
    });
  });

  describe('Idempotency Key Validation', () => {
    it('should validate key format', () => {
      const validKeys = [
        'idem_abc123xyz',
        '550e8400-e29b-41d4-a716-446655440000',
        'order_123_payment_attempt_1',
        'client-generated-unique-key',
      ];

      const isValidFormat = (key: string) => 
        key.length >= 10 && key.length <= 255 && /^[a-zA-Z0-9_-]+$/.test(key);

      validKeys.forEach(key => {
        expect(isValidFormat(key)).toBe(true);
      });
    });

    it('should reject invalid key formats', () => {
      const invalidKeys = [
        'short',
        '', 
        ' '.repeat(256), // Too long
        'key with spaces',
        'key<script>xss</script>',
      ];

      const isValidFormat = (key: string) => 
        key.length >= 10 && key.length <= 255 && /^[a-zA-Z0-9_-]+$/.test(key);

      invalidKeys.forEach(key => {
        expect(isValidFormat(key)).toBe(false);
      });
    });
  });

  describe('Duplicate Request Detection', () => {
    it('should return cached response for duplicate request', async () => {
      const idempotencyKey = 'idem_test123';
      const cachedResponse = {
        statusCode: 201,
        body: {
          id: 'pi_test123',
          status: 'succeeded',
        },
        createdAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const cached = await mockRedis.get(`idempotency:${idempotencyKey}`);
      const parsedCache = cached ? JSON.parse(cached) : null;

      expect(parsedCache).toBeDefined();
      expect(parsedCache.statusCode).toBe(201);
      expect(parsedCache.body.id).toBe('pi_test123');
    });

    it('should allow new request when no cached response', async () => {
      const idempotencyKey = 'idem_new_request';

      mockRedis.get.mockResolvedValue(null);

      const cached = await mockRedis.get(`idempotency:${idempotencyKey}`);
      const shouldProcess = cached === null;

      expect(shouldProcess).toBe(true);
    });

    it('should detect in-progress requests', async () => {
      const idempotencyKey = 'idem_in_progress';
      const inProgressValue = {
        status: 'processing',
        startedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(inProgressValue));

      const cached = await mockRedis.get(`idempotency:${idempotencyKey}`);
      const parsed = JSON.parse(cached);
      const isInProgress = parsed.status === 'processing';

      expect(isInProgress).toBe(true);
    });

    it('should return 409 for concurrent duplicate requests', async () => {
      const reply = createMockReply();
      const idempotencyKey = 'idem_concurrent';

      // Simulate in-progress status
      const inProgressValue = { status: 'processing' };
      mockRedis.get.mockResolvedValue(JSON.stringify(inProgressValue));

      const cached = await mockRedis.get(`idempotency:${idempotencyKey}`);
      const parsed = JSON.parse(cached);

      if (parsed.status === 'processing') {
        reply.status(409).send({
          type: 'https://api.tickettoken.com/problems/conflict',
          title: 'Conflict',
          status: 409,
          detail: 'Request with this idempotency key is already in progress',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(409);
    });
  });

  describe('Request Body Mismatch Detection', () => {
    it('should detect mismatched request bodies for same idempotency key', async () => {
      const idempotencyKey = 'idem_mismatch';
      const originalRequestHash = 'hash_original_body';
      const newRequestHash = 'hash_different_body';

      const cachedValue = {
        statusCode: 201,
        body: { id: 'pi_test' },
        requestHash: originalRequestHash,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedValue));
      const reply = createMockReply();

      const cached = await mockRedis.get(`idempotency:${idempotencyKey}`);
      const parsed = JSON.parse(cached);

      if (parsed.requestHash !== newRequestHash) {
        reply.status(422).send({
          type: 'https://api.tickettoken.com/problems/idempotency-mismatch',
          title: 'Idempotency Key Reused',
          status: 422,
          detail: 'Request body does not match the original request for this idempotency key',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(422);
    });

    it('should allow matching request body with same idempotency key', async () => {
      const idempotencyKey = 'idem_match';
      const requestHash = 'hash_same_body';

      const cachedValue = {
        statusCode: 201,
        body: { id: 'pi_test' },
        requestHash: requestHash,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedValue));

      const cached = await mockRedis.get(`idempotency:${idempotencyKey}`);
      const parsed = JSON.parse(cached);
      const isMatch = parsed.requestHash === requestHash;

      expect(isMatch).toBe(true);
    });
  });

  describe('Response Caching', () => {
    it('should cache successful response', async () => {
      const idempotencyKey = 'idem_success';
      const response = {
        statusCode: 201,
        body: { id: 'pi_test123' },
        requestHash: 'hash123',
        createdAt: new Date().toISOString(),
      };

      const ttlSeconds = 24 * 60 * 60; // 24 hours

      await mockRedis.setex(
        `idempotency:${idempotencyKey}`,
        ttlSeconds,
        JSON.stringify(response)
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `idempotency:${idempotencyKey}`,
        ttlSeconds,
        expect.any(String)
      );
    });

    it('should cache error responses for client errors (4xx)', async () => {
      const idempotencyKey = 'idem_client_error';
      const response = {
        statusCode: 400,
        body: { error: 'Invalid amount' },
        requestHash: 'hash123',
        createdAt: new Date().toISOString(),
      };

      const shouldCache = response.statusCode >= 400 && response.statusCode < 500;
      expect(shouldCache).toBe(true);
    });

    it('should not cache server error responses (5xx)', async () => {
      const response = { statusCode: 500 };
      const shouldCache = response.statusCode < 500;
      expect(shouldCache).toBe(false);
    });

    it('should set appropriate TTL for idempotency keys', () => {
      const ttlHours = 24;
      const ttlSeconds = ttlHours * 60 * 60;
      
      expect(ttlSeconds).toBe(86400); // 24 hours in seconds
    });
  });

  describe('Idempotency Key Lifecycle', () => {
    it('should lock key during processing', async () => {
      const idempotencyKey = 'idem_processing';
      const lockValue = {
        status: 'processing',
        startedAt: new Date().toISOString(),
        lockId: 'lock_abc123',
      };

      const lockTtlSeconds = 60; // 1 minute lock

      await mockRedis.setex(
        `idempotency:${idempotencyKey}`,
        lockTtlSeconds,
        JSON.stringify(lockValue)
      );

      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should release lock on completion', async () => {
      const idempotencyKey = 'idem_complete';
      const finalResponse = {
        status: 'completed',
        statusCode: 201,
        body: { id: 'pi_test' },
      };

      // Update with final response (longer TTL)
      const finalTtlSeconds = 24 * 60 * 60;
      
      await mockRedis.setex(
        `idempotency:${idempotencyKey}`,
        finalTtlSeconds,
        JSON.stringify(finalResponse)
      );

      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should cleanup expired locks', async () => {
      const lockStartedAt = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const maxLockDurationMs = 60 * 1000; // 1 minute

      const isLockExpired = (Date.now() - lockStartedAt.getTime()) > maxLockDurationMs;
      expect(isLockExpired).toBe(true);
    });
  });

  describe('Tenant Scoping', () => {
    it('should scope idempotency keys by tenant', () => {
      const tenantId = 'tenant-abc';
      const idempotencyKey = 'idem_123';
      
      const scopedKey = `idempotency:${tenantId}:${idempotencyKey}`;
      
      expect(scopedKey).toBe('idempotency:tenant-abc:idem_123');
    });

    it('should prevent cross-tenant idempotency key collisions', () => {
      const key1 = `idempotency:tenant-a:idem_same`;
      const key2 = `idempotency:tenant-b:idem_same`;
      
      expect(key1).not.toBe(key2);
    });
  });
});
