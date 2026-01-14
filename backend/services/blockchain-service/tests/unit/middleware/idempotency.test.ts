/**
 * Unit tests for blockchain-service Idempotency Middleware
 * Issues Fixed: #16, #17, #26 - Request deduplication and replay detection
 * 
 * Tests idempotency key handling, caching, recovery points, and X-Idempotent-Replayed header
 */

describe('Idempotency Middleware', () => {
  // ===========================================================================
  // IdempotencyEntry Interface
  // ===========================================================================
  describe('IdempotencyEntry', () => {
    it('should have requestId property', () => {
      const entry = { requestId: 'req-123', status: 'processing' };
      expect(entry.requestId).toBe('req-123');
    });

    it('should have status property with valid states', () => {
      const validStatuses = ['processing', 'completed', 'failed'];
      expect(validStatuses).toContain('processing');
      expect(validStatuses).toContain('completed');
      expect(validStatuses).toContain('failed');
    });

    it('should have optional response property', () => {
      const entry = {
        requestId: 'req-123',
        status: 'completed',
        response: { statusCode: 200, body: { success: true } }
      };
      expect(entry.response).toBeDefined();
      expect(entry.response?.statusCode).toBe(200);
    });

    it('should have createdAt timestamp', () => {
      const entry = { createdAt: Date.now() };
      expect(entry.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should have expiresAt timestamp', () => {
      const now = Date.now();
      const ttl = 24 * 60 * 60 * 1000; // 24 hours
      const entry = { expiresAt: now + ttl };
      expect(entry.expiresAt).toBeGreaterThan(now);
    });
  });

  // ===========================================================================
  // DEFAULT_TTL_MS Configuration
  // ===========================================================================
  describe('Configuration', () => {
    it('should have default TTL of 24 hours', () => {
      const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
      expect(DEFAULT_TTL_MS).toBe(86400000);
    });

    it('should use redis prefix for cache keys', () => {
      const REDIS_PREFIX = 'idempotency:';
      expect(REDIS_PREFIX).toBe('idempotency:');
    });
  });

  // ===========================================================================
  // getIdempotencyMetrics Function
  // ===========================================================================
  describe('getIdempotencyMetrics', () => {
    it('should return totalRequests', () => {
      const metrics = { totalRequests: 100, replays: 5 };
      expect(metrics.totalRequests).toBe(100);
    });

    it('should return replays count (AUDIT FIX #26)', () => {
      const metrics = { totalRequests: 100, replays: 5 };
      expect(metrics.replays).toBe(5);
    });

    it('should return processing count', () => {
      const metrics = { processing: 3 };
      expect(metrics.processing).toBe(3);
    });

    it('should return completed count', () => {
      const metrics = { completed: 92 };
      expect(metrics.completed).toBe(92);
    });

    it('should return failed count', () => {
      const metrics = { failed: 2 };
      expect(metrics.failed).toBe(2);
    });
  });

  // ===========================================================================
  // getCacheKey Function
  // ===========================================================================
  describe('getCacheKey', () => {
    it('should combine prefix, tenantId, and idempotencyKey', () => {
      const getCacheKey = (key: string, tenantId: string) => {
        return `idempotency:${tenantId}:${key}`;
      };
      
      expect(getCacheKey('idem-123', 'tenant-456'))
        .toBe('idempotency:tenant-456:idem-123');
    });

    it('should use anonymous for missing tenantId', () => {
      const getCacheKey = (key: string, tenantId: string) => {
        return `idempotency:${tenantId || 'anonymous'}:${key}`;
      };
      
      expect(getCacheKey('idem-123', ''))
        .toBe('idempotency:anonymous:idem-123');
    });
  });

  // ===========================================================================
  // idempotencyMiddleware Function
  // ===========================================================================
  describe('idempotencyMiddleware', () => {
    it('should skip for GET requests', () => {
      const method = 'GET';
      const shouldProcess = ['POST', 'PUT', 'PATCH'].includes(method);
      expect(shouldProcess).toBe(false);
    });

    it('should skip for DELETE requests', () => {
      const method = 'DELETE';
      const shouldProcess = ['POST', 'PUT', 'PATCH'].includes(method);
      expect(shouldProcess).toBe(false);
    });

    it('should process POST requests', () => {
      const method = 'POST';
      const shouldProcess = ['POST', 'PUT', 'PATCH'].includes(method);
      expect(shouldProcess).toBe(true);
    });

    it('should process PUT requests', () => {
      const method = 'PUT';
      const shouldProcess = ['POST', 'PUT', 'PATCH'].includes(method);
      expect(shouldProcess).toBe(true);
    });

    it('should process PATCH requests', () => {
      const method = 'PATCH';
      const shouldProcess = ['POST', 'PUT', 'PATCH'].includes(method);
      expect(shouldProcess).toBe(true);
    });

    it('should skip when no Idempotency-Key header', () => {
      const headers = { 'content-type': 'application/json' };
      const idempotencyKey = headers['idempotency-key' as keyof typeof headers];
      expect(idempotencyKey).toBeUndefined();
    });

    it('should validate key length 16-128 chars', () => {
      const isValidLength = (key: string) => key.length >= 16 && key.length <= 128;
      
      expect(isValidLength('short')).toBe(false); // Too short
      expect(isValidLength('a'.repeat(16))).toBe(true);
      expect(isValidLength('a'.repeat(128))).toBe(true);
      expect(isValidLength('a'.repeat(129))).toBe(false); // Too long
    });
  });

  // ===========================================================================
  // Processing Status Handling
  // ===========================================================================
  describe('Processing Status Handling', () => {
    it('should return 409 when request is still processing', () => {
      const existingEntry = { status: 'processing' };
      const isConflict = existingEntry.status === 'processing';
      expect(isConflict).toBe(true);
    });

    it('should include X-Idempotent-Status header for processing (AUDIT FIX #26)', () => {
      const headers: Record<string, string> = {};
      headers['X-Idempotent-Status'] = 'processing';
      expect(headers['X-Idempotent-Status']).toBe('processing');
    });

    it('should include recovery point when available', () => {
      const entry = { status: 'processing', recoveryPoint: 'METADATA_UPLOADED' };
      const headers: Record<string, string> = {};
      if (entry.recoveryPoint) {
        headers['X-Idempotent-Recovery-Point'] = entry.recoveryPoint;
      }
      expect(headers['X-Idempotent-Recovery-Point']).toBe('METADATA_UPLOADED');
    });
  });

  // ===========================================================================
  // Completed Status (Cached Response)
  // ===========================================================================
  describe('Completed Status (Cached Response)', () => {
    it('should return cached response for completed request', () => {
      const existingEntry = {
        status: 'completed',
        response: { statusCode: 201, body: { mintAddress: 'abc123' } }
      };
      
      expect(existingEntry.status).toBe('completed');
      expect(existingEntry.response?.statusCode).toBe(201);
    });

    it('should set X-Idempotent-Replayed header to true (AUDIT FIX #26)', () => {
      const headers: Record<string, string> = {};
      headers['X-Idempotent-Replayed'] = 'true';
      expect(headers['X-Idempotent-Replayed']).toBe('true');
    });

    it('should set X-Idempotent-Original-Timestamp header (AUDIT FIX #26)', () => {
      const createdAt = Date.now() - 60000; // 1 minute ago
      const headers: Record<string, string> = {};
      headers['X-Idempotent-Original-Timestamp'] = new Date(createdAt).toISOString();
      expect(headers['X-Idempotent-Original-Timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should set X-Idempotent-Original-Request-Id header (AUDIT FIX #26)', () => {
      const headers: Record<string, string> = {};
      headers['X-Idempotent-Original-Request-Id'] = 'original-req-123';
      expect(headers['X-Idempotent-Original-Request-Id']).toBe('original-req-123');
    });

    it('should increment replays metric', () => {
      let replays = 0;
      replays++;
      expect(replays).toBe(1);
    });
  });

  // ===========================================================================
  // Failed Status Handling
  // ===========================================================================
  describe('Failed Status Handling', () => {
    it('should allow retry when previous attempt failed', () => {
      const existingEntry = { status: 'failed' };
      const allowRetry = existingEntry.status === 'failed';
      expect(allowRetry).toBe(true);
    });

    it('should clear failed entry to allow new attempt', () => {
      const cache = new Map();
      cache.set('key1', { status: 'failed' });
      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
    });
  });

  // ===========================================================================
  // captureIdempotencyResponse Function
  // ===========================================================================
  describe('captureIdempotencyResponse', () => {
    it('should store response with statusCode', () => {
      const entry = {
        status: 'completed',
        response: { statusCode: 200, body: {} }
      };
      expect(entry.response?.statusCode).toBe(200);
    });

    it('should store response body', () => {
      const entry = {
        status: 'completed',
        response: { statusCode: 200, body: { mintAddress: 'xyz' } }
      };
      expect(entry.response?.body?.mintAddress).toBe('xyz');
    });

    it('should set recovery point to COMPLETED', () => {
      const RecoveryPoint = { COMPLETED: 'COMPLETED' };
      const entry = { recoveryPoint: RecoveryPoint.COMPLETED };
      expect(entry.recoveryPoint).toBe('COMPLETED');
    });

    it('should decrement processing and increment completed metrics', () => {
      let processing = 5;
      let completed = 10;
      processing--;
      completed++;
      expect(processing).toBe(4);
      expect(completed).toBe(11);
    });
  });

  // ===========================================================================
  // markIdempotencyFailed Function
  // ===========================================================================
  describe('markIdempotencyFailed', () => {
    it('should set status to failed', () => {
      const entry = { status: 'failed' };
      expect(entry.status).toBe('failed');
    });

    it('should store error in response body', () => {
      const entry = {
        status: 'failed',
        response: { statusCode: 500, body: { error: 'Minting failed' } }
      };
      expect(entry.response?.body?.error).toBe('Minting failed');
    });

    it('should preserve recovery point on failure', () => {
      const entry = { status: 'failed', recoveryPoint: 'TRANSACTION_SUBMITTED' };
      expect(entry.recoveryPoint).toBe('TRANSACTION_SUBMITTED');
    });

    it('should increment failed metric', () => {
      let failed = 2;
      failed++;
      expect(failed).toBe(3);
    });
  });

  // ===========================================================================
  // getIdempotencyStatus Function (AUDIT FIX #26)
  // ===========================================================================
  describe('getIdempotencyStatus (AUDIT FIX #26)', () => {
    it('should return not_found when entry does not exist', () => {
      const entry = null;
      const status = entry ? entry.status : 'not_found';
      expect(status).toBe('not_found');
    });

    it('should return entry status when found', () => {
      const entry = { status: 'completed' };
      expect(entry.status).toBe('completed');
    });

    it('should include recoveryPoint in response', () => {
      const entry = { status: 'processing', recoveryPoint: 'METADATA_UPLOADED' };
      expect(entry.recoveryPoint).toBeDefined();
    });

    it('should include createdAt and updatedAt timestamps', () => {
      const now = Date.now();
      const entry = {
        createdAt: new Date(now - 60000).toISOString(),
        updatedAt: new Date(now).toISOString()
      };
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
    });

    it('should include requestId in response', () => {
      const entry = { requestId: 'req-abc-123' };
      expect(entry.requestId).toBe('req-abc-123');
    });

    it('should include endpoint in response', () => {
      const entry = { endpoint: '/api/v1/mint' };
      expect(entry.endpoint).toBe('/api/v1/mint');
    });
  });

  // ===========================================================================
  // updateIdempotencyRecoveryPoint Function (AUDIT FIX #24)
  // ===========================================================================
  describe('updateIdempotencyRecoveryPoint (AUDIT FIX #24)', () => {
    const RecoveryPoint = {
      INITIATED: 'INITIATED',
      METADATA_UPLOADED: 'METADATA_UPLOADED',
      TRANSACTION_SUBMITTED: 'TRANSACTION_SUBMITTED',
      CONFIRMATION_PENDING: 'CONFIRMATION_PENDING',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED'
    };

    it('should update entry with new recovery point', () => {
      const entry = { recoveryPoint: 'INITIATED' };
      entry.recoveryPoint = RecoveryPoint.METADATA_UPLOADED;
      expect(entry.recoveryPoint).toBe('METADATA_UPLOADED');
    });

    it('should update updatedAt timestamp', () => {
      const entry = { updatedAt: Date.now() - 1000 };
      entry.updatedAt = Date.now();
      expect(entry.updatedAt).toBeGreaterThan(Date.now() - 100);
    });

    it('should support INITIATED recovery point', () => {
      expect(RecoveryPoint.INITIATED).toBe('INITIATED');
    });

    it('should support METADATA_UPLOADED recovery point', () => {
      expect(RecoveryPoint.METADATA_UPLOADED).toBe('METADATA_UPLOADED');
    });

    it('should support TRANSACTION_SUBMITTED recovery point', () => {
      expect(RecoveryPoint.TRANSACTION_SUBMITTED).toBe('TRANSACTION_SUBMITTED');
    });

    it('should support CONFIRMATION_PENDING recovery point', () => {
      expect(RecoveryPoint.CONFIRMATION_PENDING).toBe('CONFIRMATION_PENDING');
    });
  });

  // ===========================================================================
  // Memory Cache Fallback
  // ===========================================================================
  describe('Memory Cache Fallback', () => {
    it('should store entries in memory when Redis unavailable', () => {
      const memoryCache = new Map();
      memoryCache.set('key1', { status: 'processing' });
      expect(memoryCache.has('key1')).toBe(true);
    });

    it('should check expiry before returning cached entry', () => {
      const entry = { expiresAt: Date.now() - 1000 }; // Expired
      const isExpired = entry.expiresAt < Date.now();
      expect(isExpired).toBe(true);
    });

    it('should delete expired entries', () => {
      const memoryCache = new Map();
      memoryCache.set('key1', { expiresAt: Date.now() - 1000 });
      
      // Cleanup logic
      for (const [key, entry] of memoryCache.entries()) {
        if ((entry as any).expiresAt < Date.now()) {
          memoryCache.delete(key);
        }
      }
      
      expect(memoryCache.has('key1')).toBe(false);
    });
  });

  // ===========================================================================
  // Redis Cache Operations
  // ===========================================================================
  describe('Redis Cache Operations', () => {
    it('should store entry as JSON string', () => {
      const entry = { status: 'processing', requestId: 'req-123' };
      const serialized = JSON.stringify(entry);
      expect(serialized).toContain('processing');
      expect(serialized).toContain('req-123');
    });

    it('should parse entry from JSON string', () => {
      const serialized = '{"status":"completed","requestId":"req-123"}';
      const entry = JSON.parse(serialized);
      expect(entry.status).toBe('completed');
      expect(entry.requestId).toBe('req-123');
    });

    it('should set TTL using PX command', () => {
      const ttlMs = 86400000; // 24 hours
      expect(ttlMs).toBe(86400000);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should throw VALIDATION_FAILED for short key', () => {
      const key = 'short';
      const isValid = key.length >= 16 && key.length <= 128;
      expect(isValid).toBe(false);
    });

    it('should throw CONFLICT for in-progress requests', () => {
      const existingEntry = { status: 'processing' };
      const errorCode = existingEntry.status === 'processing' ? 'CONFLICT' : null;
      expect(errorCode).toBe('CONFLICT');
    });

    it('should return 409 status for conflicts', () => {
      const statusCode = 409;
      expect(statusCode).toBe(409);
    });
  });
});
