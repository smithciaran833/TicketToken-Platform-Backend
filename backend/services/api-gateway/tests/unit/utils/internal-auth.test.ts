import crypto from 'crypto';
import { generateInternalAuthHeaders, verifyInternalSignature } from '../../../src/utils/internal-auth';

describe('internal-auth.ts', () => {
  const originalDateNow = Date.now;

  beforeEach(() => {
    Date.now = jest.fn(() => 1609459200000); // Fixed timestamp: 2021-01-01 00:00:00
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('generateInternalAuthHeaders', () => {
    it('generates headers with service name, timestamp, and signature', () => {
      const headers = generateInternalAuthHeaders('GET', '/api/test');

      expect(headers['x-internal-service']).toBe('api-gateway');
      expect(headers['x-internal-timestamp']).toBe('1609459200000');
      expect(headers['x-internal-signature']).toBeDefined();
      expect(typeof headers['x-internal-signature']).toBe('string');
      expect(headers['x-internal-signature'].length).toBe(64); // SHA256 hex = 64 chars
    });

    it('includes body in signature calculation', () => {
      const body = { userId: '123', action: 'create' };
      const headers1 = generateInternalAuthHeaders('POST', '/api/test', body);
      const headers2 = generateInternalAuthHeaders('POST', '/api/test', { different: 'body' });

      expect(headers1['x-internal-signature']).not.toBe(headers2['x-internal-signature']);
    });

    it('generates different signatures for different methods', () => {
      const headers1 = generateInternalAuthHeaders('GET', '/api/test');
      const headers2 = generateInternalAuthHeaders('POST', '/api/test');

      expect(headers1['x-internal-signature']).not.toBe(headers2['x-internal-signature']);
    });

    it('generates different signatures for different URLs', () => {
      const headers1 = generateInternalAuthHeaders('GET', '/api/test1');
      const headers2 = generateInternalAuthHeaders('GET', '/api/test2');

      expect(headers1['x-internal-signature']).not.toBe(headers2['x-internal-signature']);
    });

    it('handles undefined body', () => {
      const headers = generateInternalAuthHeaders('GET', '/api/test');
      expect(headers['x-internal-signature']).toBeDefined();
    });
  });

  describe('verifyInternalSignature', () => {
    it('returns true for valid signature', () => {
      const timestamp = Date.now().toString();
      const method = 'GET';
      const url = '/api/test';
      const body = { test: 'data' };

      // Generate a valid signature
      const headers = generateInternalAuthHeaders(method, url, body);
      
      const isValid = verifyInternalSignature(
        'api-gateway',
        timestamp,
        headers['x-internal-signature'],
        method,
        url,
        body
      );

      expect(isValid).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const timestamp = Date.now().toString();
      const isValid = verifyInternalSignature(
        'api-gateway',
        timestamp,
        'invalid-signature-123',
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(false);
    });

    it('returns false for expired timestamp (> 5 minutes)', () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const headers = generateInternalAuthHeaders('GET', '/api/test');

      const isValid = verifyInternalSignature(
        'api-gateway',
        oldTimestamp,
        headers['x-internal-signature'],
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(false);
    });

    it('returns false for future timestamp (> 5 minutes)', () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
      const headers = generateInternalAuthHeaders('GET', '/api/test');

      const isValid = verifyInternalSignature(
        'api-gateway',
        futureTimestamp,
        headers['x-internal-signature'],
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(false);
    });

    it('returns true for timestamp within 5 minutes', () => {
      const recentTimestamp = (Date.now() - 4 * 60 * 1000).toString(); // 4 minutes ago
      
      // Need to generate signature at the same time
      Date.now = jest.fn(() => parseInt(recentTimestamp));
      const headers = generateInternalAuthHeaders('GET', '/api/test');
      
      // Reset to current time for verification
      Date.now = jest.fn(() => 1609459200000);

      const isValid = verifyInternalSignature(
        'api-gateway',
        recentTimestamp,
        headers['x-internal-signature'],
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(true);
    });

    it('returns false for mismatched service name', () => {
      const timestamp = Date.now().toString();
      const headers = generateInternalAuthHeaders('GET', '/api/test');

      const isValid = verifyInternalSignature(
        'different-service',
        timestamp,
        headers['x-internal-signature'],
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(false);
    });

    it('returns false for mismatched method', () => {
      const timestamp = Date.now().toString();
      const headers = generateInternalAuthHeaders('GET', '/api/test');

      const isValid = verifyInternalSignature(
        'api-gateway',
        timestamp,
        headers['x-internal-signature'],
        'POST', // Different method
        '/api/test'
      );

      expect(isValid).toBe(false);
    });

    it('returns false for mismatched URL', () => {
      const timestamp = Date.now().toString();
      const headers = generateInternalAuthHeaders('GET', '/api/test');

      const isValid = verifyInternalSignature(
        'api-gateway',
        timestamp,
        headers['x-internal-signature'],
        'GET',
        '/api/different' // Different URL
      );

      expect(isValid).toBe(false);
    });

    it('returns false for mismatched body', () => {
      const timestamp = Date.now().toString();
      const headers = generateInternalAuthHeaders('POST', '/api/test', { test: 'data' });

      const isValid = verifyInternalSignature(
        'api-gateway',
        timestamp,
        headers['x-internal-signature'],
        'POST',
        '/api/test',
        { different: 'body' } // Different body
      );

      expect(isValid).toBe(false);
    });

    it('returns false for invalid timestamp format', () => {
      const isValid = verifyInternalSignature(
        'api-gateway',
        'not-a-number',
        'some-signature',
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(false);
    });

    it('returns false when timingSafeEqual throws error (signature length mismatch)', () => {
      const timestamp = Date.now().toString();
      
      const isValid = verifyInternalSignature(
        'api-gateway',
        timestamp,
        'short', // Too short to compare
        'GET',
        '/api/test'
      );

      expect(isValid).toBe(false);
    });
  });
});
