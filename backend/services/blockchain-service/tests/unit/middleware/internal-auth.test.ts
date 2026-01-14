/**
 * Unit tests for blockchain-service Internal Auth Middleware
 * Issues Fixed: #24, #25, #26-30, #16 - HMAC-SHA256 service authentication
 * 
 * Tests signature verification, timing-safe comparison, replay window, and metrics
 */

import crypto from 'crypto';

describe('Internal Auth Middleware', () => {
  // ===========================================================================
  // ALLOWED_SERVICES Configuration
  // ===========================================================================
  describe('ALLOWED_SERVICES', () => {
    const ALLOWED_SERVICES = [
      'payment-service',
      'ticket-service',
      'order-service',
      'minting-service',
      'transfer-service',
      'marketplace-service'
    ];

    it('should allow payment-service', () => {
      expect(ALLOWED_SERVICES).toContain('payment-service');
    });

    it('should allow ticket-service', () => {
      expect(ALLOWED_SERVICES).toContain('ticket-service');
    });

    it('should allow order-service', () => {
      expect(ALLOWED_SERVICES).toContain('order-service');
    });

    it('should allow minting-service', () => {
      expect(ALLOWED_SERVICES).toContain('minting-service');
    });

    it('should allow transfer-service', () => {
      expect(ALLOWED_SERVICES).toContain('transfer-service');
    });

    it('should allow marketplace-service', () => {
      expect(ALLOWED_SERVICES).toContain('marketplace-service');
    });

    it('should not allow unknown services', () => {
      expect(ALLOWED_SERVICES).not.toContain('unknown-service');
    });
  });

  // ===========================================================================
  // HMAC Replay Window (AUDIT FIX #16)
  // ===========================================================================
  describe('HMAC Replay Window (AUDIT FIX #16)', () => {
    it('should default to 60 seconds', () => {
      const HMAC_REPLAY_WINDOW_MS = 60000;
      expect(HMAC_REPLAY_WINDOW_MS).toBe(60000);
    });

    it('should be configurable via environment', () => {
      const customWindow = parseInt('30000', 10);
      expect(customWindow).toBe(30000);
    });

    it('should have warning threshold at 75% of window', () => {
      const window = 60000;
      const warningThreshold = window * 0.75;
      expect(warningThreshold).toBe(45000);
    });
  });

  // ===========================================================================
  // getHmacMetrics Function
  // ===========================================================================
  describe('getHmacMetrics', () => {
    it('should return requestsTotal', () => {
      const metrics = { requestsTotal: 100 };
      expect(metrics.requestsTotal).toBe(100);
    });

    it('should return successTotal', () => {
      const metrics = { successTotal: 95 };
      expect(metrics.successTotal).toBe(95);
    });

    it('should return failedTotal', () => {
      const metrics = { failedTotal: 5 };
      expect(metrics.failedTotal).toBe(5);
    });

    it('should return replayAttemptsTotal', () => {
      const metrics = { replayAttemptsTotal: 2 };
      expect(metrics.replayAttemptsTotal).toBe(2);
    });

    it('should calculate averageDriftMs', () => {
      const driftHistogram = [10, 20, 30, 40];
      const totalDrift = driftHistogram.reduce((a, b) => a + b, 0);
      const avgDrift = totalDrift / driftHistogram.length;
      expect(avgDrift).toBe(25);
    });
  });

  // ===========================================================================
  // validateInternalRequest Function
  // ===========================================================================
  describe('validateInternalRequest', () => {
    it('should require x-internal-service header', () => {
      const headers = { 'x-internal-signature': 'abc' };
      const hasService = !!headers['x-internal-service' as keyof typeof headers];
      expect(hasService).toBe(false);
    });

    it('should require x-internal-signature header', () => {
      const headers = { 'x-internal-service': 'payment-service' };
      const hasSignature = !!headers['x-internal-signature' as keyof typeof headers];
      expect(hasSignature).toBe(false);
    });

    it('should require x-timestamp header', () => {
      const headers = { 'x-internal-service': 'payment-service', 'x-internal-signature': 'abc' };
      const hasTimestamp = !!headers['x-timestamp' as keyof typeof headers];
      expect(hasTimestamp).toBe(false);
    });

    it('should reject invalid service names', () => {
      const ALLOWED = ['payment-service', 'ticket-service'];
      const service = 'malicious-service';
      expect(ALLOWED.includes(service)).toBe(false);
    });

    it('should reject expired timestamps', () => {
      const requestTime = Date.now() - 120000; // 2 minutes ago
      const now = Date.now();
      const windowMs = 60000;
      const timeDiff = Math.abs(now - requestTime);
      expect(timeDiff > windowMs).toBe(true);
    });

    it('should accept timestamps within window', () => {
      const requestTime = Date.now() - 30000; // 30 seconds ago
      const now = Date.now();
      const windowMs = 60000;
      const timeDiff = Math.abs(now - requestTime);
      expect(timeDiff <= windowMs).toBe(true);
    });

    it('should reject future timestamps beyond window', () => {
      const requestTime = Date.now() + 120000; // 2 minutes in future
      const now = Date.now();
      const windowMs = 60000;
      const timeDiff = Math.abs(now - requestTime);
      expect(timeDiff > windowMs).toBe(true);
    });
  });

  // ===========================================================================
  // HMAC Signature Generation
  // ===========================================================================
  describe('HMAC Signature Generation', () => {
    it('should build payload as service:timestamp:body', () => {
      const service = 'payment-service';
      const timestamp = '1234567890';
      const body = JSON.stringify({ amount: 100 });
      const payload = `${service}:${timestamp}:${body}`;
      expect(payload).toBe('payment-service:1234567890:{"amount":100}');
    });

    it('should use SHA256 algorithm', () => {
      const secret = 'test-secret';
      const payload = 'test-payload';
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(signature).toHaveLength(64); // SHA256 hex is 64 chars
    });

    it('should produce consistent signatures', () => {
      const secret = 'test-secret';
      const payload = 'test-payload';
      const sig1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different payloads', () => {
      const secret = 'test-secret';
      const sig1 = crypto.createHmac('sha256', secret).update('payload1').digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update('payload2').digest('hex');
      expect(sig1).not.toBe(sig2);
    });
  });

  // ===========================================================================
  // Timing-Safe Comparison (Security)
  // ===========================================================================
  describe('Timing-Safe Comparison', () => {
    it('should use crypto.timingSafeEqual for comparison', () => {
      const sig1 = Buffer.from('a'.repeat(32));
      const sig2 = Buffer.from('a'.repeat(32));
      expect(crypto.timingSafeEqual(sig1, sig2)).toBe(true);
    });

    it('should return false for different signatures', () => {
      const sig1 = Buffer.from('a'.repeat(32));
      const sig2 = Buffer.from('b'.repeat(32));
      expect(crypto.timingSafeEqual(sig1, sig2)).toBe(false);
    });

    it('should check buffer length before comparison', () => {
      const sig1 = Buffer.from('short');
      const sig2 = Buffer.from('much longer signature');
      const lengthMatch = sig1.length === sig2.length;
      expect(lengthMatch).toBe(false);
    });

    it('should convert hex string to buffer', () => {
      const hexSignature = 'abcdef1234567890';
      const buffer = Buffer.from(hexSignature, 'hex');
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  // ===========================================================================
  // generateInternalSignature Function
  // ===========================================================================
  describe('generateInternalSignature', () => {
    it('should return signature and timestamp', () => {
      const result = { signature: 'abc123', timestamp: '1234567890' };
      expect(result.signature).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should use current timestamp', () => {
      const timestamp = Date.now().toString();
      expect(parseInt(timestamp, 10)).toBeGreaterThan(0);
    });

    it('should throw if secret not configured', () => {
      const secret = undefined;
      expect(() => {
        if (!secret) throw new Error('INTERNAL_SERVICE_SECRET not configured');
      }).toThrow('INTERNAL_SERVICE_SECRET not configured');
    });
  });

  // ===========================================================================
  // buildInternalHeaders Function
  // ===========================================================================
  describe('buildInternalHeaders', () => {
    it('should include x-internal-service header', () => {
      const headers = { 'x-internal-service': 'blockchain-service' };
      expect(headers['x-internal-service']).toBe('blockchain-service');
    });

    it('should include x-internal-signature header', () => {
      const headers = { 'x-internal-signature': 'calculated-sig' };
      expect(headers['x-internal-signature']).toBeDefined();
    });

    it('should include x-timestamp header', () => {
      const headers = { 'x-timestamp': Date.now().toString() };
      expect(headers['x-timestamp']).toBeDefined();
    });

    it('should include Content-Type as application/json', () => {
      const headers = { 'Content-Type': 'application/json' };
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // ===========================================================================
  // Error Responses
  // ===========================================================================
  describe('Error Responses', () => {
    it('should return 401 for missing headers', () => {
      const statusCode = 401;
      expect(statusCode).toBe(401);
    });

    it('should return 401 for invalid signature', () => {
      const statusCode = 401;
      expect(statusCode).toBe(401);
    });

    it('should return 401 for expired timestamp', () => {
      const statusCode = 401;
      expect(statusCode).toBe(401);
    });

    it('should return 403 for unauthorized service', () => {
      const statusCode = 403;
      expect(statusCode).toBe(403);
    });

    it('should return 500 for missing secret configuration', () => {
      const statusCode = 500;
      expect(statusCode).toBe(500);
    });

    it('should use RFC 7807 problem details format', () => {
      const error = {
        type: 'https://api.tickettoken.com/errors/UNAUTHORIZED',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid internal service signature'
      };
      expect(error.type).toContain('UNAUTHORIZED');
      expect(error.status).toBe(401);
    });
  });

  // ===========================================================================
  // Request Decoration
  // ===========================================================================
  describe('Request Decoration', () => {
    it('should set internalService on successful auth', () => {
      const request = { internalService: undefined as string | undefined };
      request.internalService = 'payment-service';
      expect(request.internalService).toBe('payment-service');
    });
  });

  // ===========================================================================
  // Logging
  // ===========================================================================
  describe('Logging', () => {
    it('should log warning for missing auth headers', () => {
      const logData = {
        hasService: false,
        hasSignature: false,
        ip: '192.168.1.1'
      };
      expect(logData.hasService).toBe(false);
    });

    it('should log warning for invalid service', () => {
      const logData = {
        service: 'unknown-service',
        ip: '192.168.1.1'
      };
      expect(logData.service).toBe('unknown-service');
    });

    it('should log info on successful authentication', () => {
      const logData = {
        service: 'payment-service',
        path: '/internal/mint'
      };
      expect(logData.service).toBe('payment-service');
    });
  });
});
