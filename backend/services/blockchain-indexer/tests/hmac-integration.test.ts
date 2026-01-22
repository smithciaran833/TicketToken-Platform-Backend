// @ts-nocheck
/**
 * HMAC Integration Tests - blockchain-indexer
 *
 * Tests for HMAC authentication on service-to-service communication.
 * Phase A HMAC Standardization - Week 1
 */

import {
  HmacSigner,
  HmacValidator,
  createHmacSigner,
  HMAC_HEADER_NAMES,
  NonceStore,
} from '@tickettoken/shared';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.SERVICE_NAME = 'blockchain-indexer';
process.env.USE_NEW_HMAC = 'true';

// In-memory nonce store for testing
class MockNonceStore {
  private usedNonces = new Set<string>();

  async isNonceUsed(nonce: string, serviceName: string): Promise<boolean> {
    const key = `${serviceName}:${nonce}`;
    if (this.usedNonces.has(key)) {
      return true;
    }
    this.usedNonces.add(key);
    return false;
  }

  clear(): void {
    this.usedNonces.clear();
  }
}

function toMutableHeaders(headers: ReturnType<HmacSigner['sign']>): Record<string, string | undefined> {
  return { ...headers } as Record<string, string | undefined>;
}

describe('HMAC Integration Tests - blockchain-indexer', () => {
  const testSecret = 'test-secret-key-must-be-32-chars-long';
  let signer: HmacSigner;
  let validator: HmacValidator;
  let mockNonceStore: MockNonceStore;

  beforeAll(() => {
    // Use real timers for HMAC tests
    jest.useRealTimers();

    mockNonceStore = new MockNonceStore();

    signer = createHmacSigner({
      secret: testSecret,
      serviceName: 'blockchain-indexer',
    });

    validator = new HmacValidator(
      { secret: testSecret },
      mockNonceStore as unknown as NonceStore
    );
  });

  beforeEach(() => {
    jest.useRealTimers();
    mockNonceStore.clear();
  });

  // =========================================================================
  // OUTGOING CALLS - HMAC Headers Present
  // =========================================================================

  describe('Outgoing calls include HMAC headers', () => {
    test('should generate all required HMAC headers for GET request', () => {
      const headers = signer.sign('GET', '/api/v1/indexer/status');

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('blockchain-indexer');
      expect(headers[HMAC_HEADER_NAMES.TIMESTAMP]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.NONCE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toHaveLength(64);
    });

    test('should generate body hash header for POST request with body', () => {
      const body = { tokenId: 'token-123', chainId: 'solana-mainnet' };
      const headers = signer.sign('POST', '/api/v1/indexer/process', body);

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('blockchain-indexer');
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toHaveLength(64);
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
    });

    test('should generate unique nonce for each request', () => {
      const headers1 = signer.sign('POST', '/api/v1/indexer/sync');
      const headers2 = signer.sign('POST', '/api/v1/indexer/sync');

      expect(headers1[HMAC_HEADER_NAMES.NONCE]).not.toBe(headers2[HMAC_HEADER_NAMES.NONCE]);
      expect(headers1[HMAC_HEADER_NAMES.SIGNATURE]).not.toBe(headers2[HMAC_HEADER_NAMES.SIGNATURE]);
    });
  });

  // =========================================================================
  // INCOMING CALLS - HMAC Validation
  // =========================================================================

  describe('Incoming calls validate HMAC', () => {
    test('should validate correctly signed request', async () => {
      const method = 'POST';
      const path = '/internal/indexer/process';
      const headers = toMutableHeaders(signer.sign(method, path));

      const result = await validator.validate(headers, method, path);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('blockchain-indexer');
    });

    test('should validate correctly signed POST request with body', async () => {
      const method = 'POST';
      const path = '/internal/indexer/nft-metadata';
      const body = { tokenId: 'token-456', metadata: { name: 'Test NFT' } };
      const headers = toMutableHeaders(signer.sign(method, path, body));

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('blockchain-indexer');
    });

    test('should extract service name from validated request', async () => {
      const ticketServiceSigner = createHmacSigner({
        secret: testSecret,
        serviceName: 'ticket-service',
      });

      const headers = toMutableHeaders(ticketServiceSigner.sign('POST', '/internal/indexer/check'));
      const result = await validator.validate(headers, 'POST', '/internal/indexer/check');

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('ticket-service');
    });
  });

  // =========================================================================
  // SECURITY TESTS
  // =========================================================================

  describe('Security - Replay attack prevention', () => {
    test('should reject request with reused nonce', async () => {
      const method = 'POST';
      const path = '/internal/indexer/secure';
      const headers = toMutableHeaders(signer.sign(method, path));

      const result1 = await validator.validate(headers, method, path);
      expect(result1.valid).toBe(true);

      const result2 = await validator.validate(headers, method, path);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('nonce');
    });
  });

  describe('Security - Invalid signature detection', () => {
    test('should reject request with tampered signature', async () => {
      const method = 'POST';
      const path = '/internal/indexer/tampered';
      const headers = toMutableHeaders(signer.sign(method, path));

      headers[HMAC_HEADER_NAMES.SIGNATURE] = 'tampered-invalid-signature-that-wont-match';

      const result = await validator.validate(headers, method, path);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject request signed with wrong secret', async () => {
      const wrongSigner = createHmacSigner({
        secret: 'different-secret-wrong-key-32chars',
        serviceName: 'attacker-service',
      });

      const headers = toMutableHeaders(wrongSigner.sign('POST', '/internal/indexer/hack'));
      const result = await validator.validate(headers, 'POST', '/internal/indexer/hack');

      expect(result.valid).toBe(false);
    });
  });

  describe('Security - Missing headers detection', () => {
    test('should reject request missing service header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/internal/indexer/test'));
      delete headers[HMAC_HEADER_NAMES.SERVICE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing signature header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/internal/indexer/test'));
      delete headers[HMAC_HEADER_NAMES.SIGNATURE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing timestamp header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/internal/indexer/test'));
      delete headers[HMAC_HEADER_NAMES.TIMESTAMP];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });
  });
});
