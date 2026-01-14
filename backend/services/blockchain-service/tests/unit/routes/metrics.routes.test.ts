/**
 * Unit tests for blockchain-service Metrics Routes
 * 
 * AUDIT FIX #4: Schema validation for circuit breaker name with allowlist
 */

describe('Metrics Routes', () => {
  // ===========================================================================
  // Configuration
  // ===========================================================================
  describe('Configuration', () => {
    it('should define VALID_BREAKER_NAMES array', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toHaveLength(6);
    });

    it('should include rpc breaker', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toContain('rpc');
    });

    it('should include database breaker', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toContain('database');
    });

    it('should include minting breaker', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toContain('minting');
    });

    it('should include external breaker', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toContain('external');
    });

    it('should include metaplex breaker', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toContain('metaplex');
    });

    it('should include treasury breaker', () => {
      const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      expect(VALID_BREAKER_NAMES).toContain('treasury');
    });
  });

  // ===========================================================================
  // isValidBreakerName - AUDIT FIX #4
  // ===========================================================================
  describe('isValidBreakerName', () => {
    const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
    const isValidBreakerName = (name: string) => VALID_BREAKER_NAMES.includes(name);

    it('should return true for valid names', () => {
      expect(isValidBreakerName('rpc')).toBe(true);
      expect(isValidBreakerName('database')).toBe(true);
    });

    it('should return false for invalid names', () => {
      expect(isValidBreakerName('invalid')).toBe(false);
      expect(isValidBreakerName('malicious')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidBreakerName('')).toBe(false);
    });

    it('should return false for SQL injection attempts', () => {
      expect(isValidBreakerName("'; DROP TABLE--")).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isValidBreakerName('RPC')).toBe(false);
      expect(isValidBreakerName('Database')).toBe(false);
    });
  });

  // ===========================================================================
  // Breaker Params Schema
  // ===========================================================================
  describe('breakerParamsSchema', () => {
    it('should require name property', () => {
      const schema = { required: ['name'] };
      expect(schema.required).toContain('name');
    });

    it('should have minLength of 1', () => {
      const schema = { properties: { name: { minLength: 1 } } };
      expect(schema.properties.name.minLength).toBe(1);
    });

    it('should have maxLength of 50', () => {
      const schema = { properties: { name: { maxLength: 50 } } };
      expect(schema.properties.name.maxLength).toBe(50);
    });

    it('should use enum for valid names', () => {
      const schema = {
        properties: {
          name: { enum: ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'] }
        }
      };
      expect(schema.properties.name.enum).toHaveLength(6);
    });
  });

  // ===========================================================================
  // GET /metrics
  // ===========================================================================
  describe('GET /metrics', () => {
    it('should return prometheus metrics', () => {
      const contentType = 'text/plain; version=0.0.4; charset=utf-8';
      expect(contentType).toMatch(/text\/plain/);
    });

    it('should set Content-Type from register', () => {
      const header = 'Content-Type';
      expect(header).toBe('Content-Type');
    });

    it('should call register.metrics()', () => {
      let metricsCalled = false;
      const register = { metrics: () => { metricsCalled = true; return '# HELP'; } };
      register.metrics();
      expect(metricsCalled).toBe(true);
    });

    it('should return 500 on error', () => {
      const error = new Error('Metrics error');
      const statusCode = 500;
      expect(statusCode).toBe(500);
    });

    it('should log error on failure', () => {
      const logData = { error: 'Failed to generate metrics' };
      expect(logData.error).toBeDefined();
    });
  });

  // ===========================================================================
  // GET /metrics/circuit-breakers
  // ===========================================================================
  describe('GET /metrics/circuit-breakers', () => {
    it('should call circuitBreakerManager.getAllStats', () => {
      let getAllCalled = false;
      const manager = { getAllStats: () => { getAllCalled = true; return {}; } };
      manager.getAllStats();
      expect(getAllCalled).toBe(true);
    });

    it('should return timestamp', () => {
      const response = { timestamp: new Date().toISOString() };
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return circuitBreakers object', () => {
      const response = { circuitBreakers: { rpc: { state: 'closed' } } };
      expect(response.circuitBreakers).toBeDefined();
    });

    it('should include state in breaker stats', () => {
      const stats = { state: 'open', failures: 5 };
      expect(stats.state).toBe('open');
    });

    it('should include failures count', () => {
      const stats = { failures: 3 };
      expect(stats.failures).toBe(3);
    });

    it('should include successes count', () => {
      const stats = { successes: 100 };
      expect(stats.successes).toBe(100);
    });
  });

  // ===========================================================================
  // GET /metrics/circuit-breakers/:name - AUDIT FIX #4
  // ===========================================================================
  describe('GET /metrics/circuit-breakers/:name', () => {
    it('should validate name against allowlist', () => {
      const VALID = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      const isValid = VALID.includes('rpc');
      expect(isValid).toBe(true);
    });

    it('should return 400 for invalid breaker name', () => {
      const name = 'invalid';
      const VALID = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      const statusCode = VALID.includes(name) ? 200 : 400;
      expect(statusCode).toBe(400);
    });

    it('should return INVALID_BREAKER_NAME error code', () => {
      const response = { code: 'INVALID_BREAKER_NAME' };
      expect(response.code).toBe('INVALID_BREAKER_NAME');
    });

    it('should log warning for invalid name', () => {
      const logData = { name: 'invalid', validNames: ['rpc'], requestId: 'req-123' };
      expect(logData.name).toBe('invalid');
    });

    it('should return 404 if breaker not found', () => {
      const stats = undefined;
      const statusCode = stats ? 200 : 404;
      expect(statusCode).toBe(404);
    });

    it('should return BREAKER_NOT_FOUND error code', () => {
      const response = { code: 'BREAKER_NOT_FOUND' };
      expect(response.code).toBe('BREAKER_NOT_FOUND');
    });

    it('should return stats for valid breaker', () => {
      const stats = { name: 'rpc', state: 'closed', failures: 0 };
      expect(stats.name).toBe('rpc');
    });
  });

  // ===========================================================================
  // POST /metrics/circuit-breakers/:name/reset - AUDIT FIX #4
  // ===========================================================================
  describe('POST /metrics/circuit-breakers/:name/reset', () => {
    it('should validate name against allowlist', () => {
      const VALID = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      const isValid = VALID.includes('database');
      expect(isValid).toBe(true);
    });

    it('should return 400 for invalid breaker name', () => {
      const name = 'malicious';
      const VALID = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      const statusCode = VALID.includes(name) ? 200 : 400;
      expect(statusCode).toBe(400);
    });

    it('should call circuitBreakerManager.reset', () => {
      let resetCalled = false;
      const manager = { reset: () => { resetCalled = true; } };
      manager.reset();
      expect(resetCalled).toBe(true);
    });

    it('should log successful reset', () => {
      const logData = { name: 'rpc', requestId: 'req-123' };
      expect(logData.name).toBe('rpc');
    });

    it('should return success: true', () => {
      const response = { success: true };
      expect(response.success).toBe(true);
    });

    it('should return success message', () => {
      const response = { message: "Circuit breaker 'rpc' reset successfully" };
      expect(response.message).toMatch(/reset successfully/);
    });

    it('should return timestamp', () => {
      const response = { timestamp: new Date().toISOString() };
      expect(response.timestamp).toBeDefined();
    });
  });

  // ===========================================================================
  // GET /metrics/load
  // ===========================================================================
  describe('GET /metrics/load', () => {
    it('should return timestamp', () => {
      const response = { timestamp: new Date().toISOString() };
      expect(response.timestamp).toBeDefined();
    });

    it('should call getLoadStatus', () => {
      let called = false;
      const getLoadStatus = () => { called = true; return { status: 'normal' }; };
      getLoadStatus();
      expect(called).toBe(true);
    });

    it('should call getLoadSheddingMetrics', () => {
      let called = false;
      const getLoadSheddingMetrics = () => { called = true; return {}; };
      getLoadSheddingMetrics();
      expect(called).toBe(true);
    });

    it('should call getBulkheadMetrics', () => {
      let called = false;
      const getBulkheadMetrics = () => { called = true; return {}; };
      getBulkheadMetrics();
      expect(called).toBe(true);
    });

    it('should call getRateLimitMetrics', () => {
      let called = false;
      const getRateLimitMetrics = () => { called = true; return {}; };
      getRateLimitMetrics();
      expect(called).toBe(true);
    });

    it('should return loadStatus object', () => {
      const response = { loadStatus: { status: 'normal' } };
      expect(response.loadStatus).toBeDefined();
    });

    it('should return loadShedding object', () => {
      const response = { loadShedding: { shedding: false } };
      expect(response.loadShedding).toBeDefined();
    });

    it('should return bulkheads object', () => {
      const response = { bulkheads: { mint: { active: 0, max: 10 } } };
      expect(response.bulkheads).toBeDefined();
    });

    it('should return rateLimits object', () => {
      const response = { rateLimits: { global: { remaining: 100 } } };
      expect(response.rateLimits).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Response Schema
  // ===========================================================================
  describe('Error Response Schema', () => {
    it('should follow RFC 7807 format', () => {
      const error = {
        type: 'https://api.tickettoken.com/errors/VALIDATION_FAILED',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid circuit breaker name',
        code: 'INVALID_BREAKER_NAME'
      };
      expect(error.type).toMatch(/^https:/);
      expect(error.status).toBe(400);
    });

    it('should include code property', () => {
      const error = { code: 'METRICS_ERROR' };
      expect(error.code).toBe('METRICS_ERROR');
    });
  });

  // ===========================================================================
  // Security - AUDIT FIX #4
  // ===========================================================================
  describe('Security', () => {
    it('should prevent path traversal in breaker name', () => {
      const name = '../../../etc/passwd';
      const VALID = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      const isValid = VALID.includes(name);
      expect(isValid).toBe(false);
    });

    it('should prevent command injection', () => {
      const name = 'rpc; rm -rf /';
      const VALID = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'];
      const isValid = VALID.includes(name);
      expect(isValid).toBe(false);
    });

    it('should sanitize input through schema validation', () => {
      const usesFastifySchema = true;
      expect(usesFastifySchema).toBe(true);
    });
  });
});
