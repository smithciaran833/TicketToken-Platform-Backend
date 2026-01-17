/**
 * Unit Tests for Response Filter Utility
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Response Filter', () => {
  let responseFilter: typeof import('../../../src/utils/response-filter');
  let logger: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    responseFilter = await import('../../../src/utils/response-filter');
  });

  afterEach(() => {
    jest.resetModules();
  });

  // ===========================================================================
  // filterResponse - Basic Functionality
  // ===========================================================================
  describe('filterResponse', () => {
    describe('null and undefined handling', () => {
      it('should return null as-is', () => {
        const result = responseFilter.filterResponse(null);
        expect(result).toBeNull();
      });

      it('should return undefined as-is', () => {
        const result = responseFilter.filterResponse(undefined);
        expect(result).toBeUndefined();
      });
    });

    describe('primitive values', () => {
      it('should return strings as-is', () => {
        const result = responseFilter.filterResponse('hello');
        expect(result).toBe('hello');
      });

      it('should return numbers as-is', () => {
        const result = responseFilter.filterResponse(42);
        expect(result).toBe(42);
      });

      it('should return booleans as-is', () => {
        const result = responseFilter.filterResponse(true);
        expect(result).toBe(true);
      });
    });

    describe('PII field redaction', () => {
      it('should redact EIN', () => {
        const data = { name: 'Test Corp', ein: '12-3456789' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ name: 'Test Corp', ein: '[REDACTED]' });
      });

      it('should redact SSN', () => {
        const data = { name: 'John', ssn: '123-45-6789' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ name: 'John', ssn: '[REDACTED]' });
      });

      it('should redact taxId and tax_id', () => {
        const data = { taxId: '123', tax_id: '456' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ taxId: '[REDACTED]', tax_id: '[REDACTED]' });
      });

      it('should redact socialSecurityNumber', () => {
        const data = { socialSecurityNumber: '123-45-6789' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ socialSecurityNumber: '[REDACTED]' });
      });
    });

    describe('bank information redaction', () => {
      it('should redact accountNumber and account_number', () => {
        const data = { accountNumber: '1234567890', account_number: '0987654321' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          accountNumber: '[REDACTED]',
          account_number: '[REDACTED]'
        });
      });

      it('should redact routingNumber and routing_number', () => {
        const data = { routingNumber: '021000021', routing_number: '021000021' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          routingNumber: '[REDACTED]',
          routing_number: '[REDACTED]'
        });
      });

      it('should redact iban and swiftCode', () => {
        const data = { iban: 'DE89370400440532013000', swiftCode: 'COBADEFFXXX' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ iban: '[REDACTED]', swiftCode: '[REDACTED]' });
      });
    });

    describe('credential redaction', () => {
      it('should redact password', () => {
        const data = { username: 'user', password: 'secret123' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ username: 'user', password: '[REDACTED]' });
      });

      it('should redact API keys', () => {
        const data = { apiKey: 'sk-123', api_key: 'pk-456' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ apiKey: '[REDACTED]', api_key: '[REDACTED]' });
      });

      it('should redact tokens', () => {
        const data = {
          accessToken: 'token1',
          access_token: 'token2',
          refreshToken: 'token3',
          refresh_token: 'token4'
        };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          accessToken: '[REDACTED]',
          access_token: '[REDACTED]',
          refreshToken: '[REDACTED]',
          refresh_token: '[REDACTED]'
        });
      });

      it('should redact private keys', () => {
        const data = { privateKey: '-----BEGIN', private_key: '-----BEGIN' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          privateKey: '[REDACTED]',
          private_key: '[REDACTED]'
        });
      });
    });

    describe('internal field redaction', () => {
      it('should redact internal IDs', () => {
        const data = { id: '123', internalId: 'int-123', internal_id: 'int-456' };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          id: '123',
          internalId: '[REDACTED]',
          internal_id: '[REDACTED]'
        });
      });

      it('should redact Plaid and Stripe secrets', () => {
        const data = {
          plaidAccessToken: 'access-sandbox-123',
          plaid_access_token: 'access-sandbox-456',
          stripeSecretKey: 'sk_test_123',
          stripe_secret_key: 'sk_test_456'
        };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          plaidAccessToken: '[REDACTED]',
          plaid_access_token: '[REDACTED]',
          stripeSecretKey: '[REDACTED]',
          stripe_secret_key: '[REDACTED]'
        });
      });
    });

    describe('partial redaction', () => {
      it('should partially redact email', () => {
        const data = { email: 'john.doe@example.com' };
        const result = responseFilter.filterResponse(data);
        expect(result.email).toBe('jo***@example.com');
      });

      it('should partially redact phone numbers', () => {
        const data = {
          phone: '555-123-4567',
          phoneNumber: '555-987-6543',
          phone_number: '555-111-2222'
        };
        const result = responseFilter.filterResponse(data);
        expect(result.phone).toBe('555****4567');
        expect(result.phoneNumber).toBe('555****6543');
        expect(result.phone_number).toBe('555****2222');
      });
    });

    describe('nested object handling', () => {
      it('should filter nested objects', () => {
        const data = {
          user: {
            name: 'John',
            ssn: '123-45-6789',
            profile: {
              email: 'john@example.com',
              password: 'secret'
            }
          }
        };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({
          user: {
            name: 'John',
            ssn: '[REDACTED]',
            profile: {
              email: 'jo***@example.com',
              password: '[REDACTED]'
            }
          }
        });
      });

      it('should handle deeply nested structures', () => {
        const data = {
          level1: {
            level2: {
              level3: {
                apiKey: 'secret-key'
              }
            }
          }
        };
        const result = responseFilter.filterResponse(data);
        expect(result.level1.level2.level3.apiKey).toBe('[REDACTED]');
      });
    });

    describe('array handling', () => {
      it('should filter arrays of objects', () => {
        const data = [
          { name: 'User 1', ssn: '111-11-1111' },
          { name: 'User 2', ssn: '222-22-2222' }
        ];
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual([
          { name: 'User 1', ssn: '[REDACTED]' },
          { name: 'User 2', ssn: '[REDACTED]' }
        ]);
      });

      it('should filter nested arrays', () => {
        const data = {
          users: [
            { email: 'a@test.com' },
            { email: 'b@test.com' }
          ]
        };
        const result = responseFilter.filterResponse(data);
        expect(result.users[0].email).toBe('a***@test.com');
        expect(result.users[1].email).toBe('b***@test.com');
      });

      it('should handle arrays of primitives', () => {
        const data = { tags: ['one', 'two', 'three'] };
        const result = responseFilter.filterResponse(data);
        expect(result).toEqual({ tags: ['one', 'two', 'three'] });
      });
    });

    describe('options', () => {
      it('should redact additional fields when specified', () => {
        const data = { customSecret: 'secret-value', name: 'Test' };
        const result = responseFilter.filterResponse(data, {
          additionalFields: ['customSecret']
        });
        expect(result).toEqual({ customSecret: '[REDACTED]', name: 'Test' });
      });

      it('should exclude fields from filtering when specified', () => {
        const data = { ssn: '123-45-6789', name: 'Test' };
        const result = responseFilter.filterResponse(data, {
          excludeFields: ['ssn']
        });
        expect(result).toEqual({ ssn: '123-45-6789', name: 'Test' });
      });

      it('should log redactions when logRedactions is true', () => {
        const data = { password: 'secret' };
        responseFilter.filterResponse(data, { logRedactions: true });
        expect(logger.debug).toHaveBeenCalledWith(
          { field: 'password' },
          'Redacted sensitive field from response'
        );
      });

      it('should not log redactions by default', () => {
        const data = { password: 'secret' };
        responseFilter.filterResponse(data);
        expect(logger.debug).not.toHaveBeenCalled();
      });

      it('should not log for null/undefined values even with logRedactions', () => {
        const data = { password: null, apiKey: undefined };
        responseFilter.filterResponse(data, { logRedactions: true });
        expect(logger.debug).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Compliance-Specific Filters
  // ===========================================================================
  describe('filterW9Response', () => {
    it('should redact W9-specific fields', () => {
      const data = {
        name: 'Test Corp',
        einFull: '12-3456789',
        einOriginal: '123456789',
        ein: '**-***6789'
      };
      const result = responseFilter.filterW9Response(data);
      expect(result).toEqual({
        name: 'Test Corp',
        einFull: '[REDACTED]',
        einOriginal: '[REDACTED]',
        ein: '[REDACTED]'
      });
    });
  });

  describe('filterTaxResponse', () => {
    it('should redact tax-specific fields', () => {
      const data = {
        year: 2024,
        internalTaxId: 'tax-123',
        irsSubmissionId: 'irs-456',
        amount: 50000
      };
      const result = responseFilter.filterTaxResponse(data);
      expect(result).toEqual({
        year: 2024,
        internalTaxId: '[REDACTED]',
        irsSubmissionId: '[REDACTED]',
        amount: 50000
      });
    });
  });

  describe('filterBankResponse', () => {
    it('should redact bank-specific fields', () => {
      const data = {
        bankName: 'Test Bank',
        plaidItemId: 'item-123',
        processorToken: 'processor-456',
        fullAccountNumber: '1234567890',
        accountNumber: '****7890'
      };
      const result = responseFilter.filterBankResponse(data);
      expect(result).toEqual({
        bankName: 'Test Bank',
        plaidItemId: '[REDACTED]',
        processorToken: '[REDACTED]',
        fullAccountNumber: '[REDACTED]',
        accountNumber: '[REDACTED]'
      });
    });
  });

  describe('filterGDPRExportResponse', () => {
    it('should keep user PII for GDPR export', () => {
      const data = {
        email: 'john@example.com',
        phone: '555-123-4567',
        phoneNumber: '555-987-6543',
        dateOfBirth: '1990-01-01'
      };
      const result = responseFilter.filterGDPRExportResponse(data);
      expect(result).toEqual({
        email: 'john@example.com',
        phone: '555-123-4567',
        phoneNumber: '555-987-6543',
        dateOfBirth: '1990-01-01'
      });
    });

    it('should redact internal system fields', () => {
      const data = {
        email: 'john@example.com',
        internalProcessId: 'proc-123',
        systemNotes: 'Internal note',
        password: 'secret'
      };
      const result = responseFilter.filterGDPRExportResponse(data);
      expect(result).toEqual({
        email: 'john@example.com',
        internalProcessId: '[REDACTED]',
        systemNotes: '[REDACTED]',
        password: '[REDACTED]'
      });
    });
  });

  // ===========================================================================
  // responseFilterMiddleware
  // ===========================================================================
  describe('responseFilterMiddleware', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: jest.Mock;

    beforeEach(() => {
      mockReq = {};
      mockNext = jest.fn();
      mockRes = {
        json: jest.fn()
      };
    });

    it('should wrap res.json to filter responses', () => {
      const middleware = responseFilter.responseFilterMiddleware();
      const originalJson = mockRes.json;

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.json).not.toBe(originalJson);
    });

    it('should filter sensitive data in json response', () => {
      const middleware = responseFilter.responseFilterMiddleware();
      let capturedData: any;

      mockRes.json = jest.fn((data: any) => {
        capturedData = data;
        return mockRes;
      });

      middleware(mockReq, mockRes, mockNext);

      // Call the wrapped json
      mockRes.json({ name: 'Test', password: 'secret123' });

      expect(capturedData).toEqual({ name: 'Test', password: '[REDACTED]' });
    });

    it('should apply additional fields option', () => {
      const middleware = responseFilter.responseFilterMiddleware({
        additionalFields: ['customField']
      });
      let capturedData: any;

      mockRes.json = jest.fn((data: any) => {
        capturedData = data;
        return mockRes;
      });

      middleware(mockReq, mockRes, mockNext);
      mockRes.json({ name: 'Test', customField: 'secret' });

      expect(capturedData).toEqual({ name: 'Test', customField: '[REDACTED]' });
    });

    it('should apply exclude fields option', () => {
      const middleware = responseFilter.responseFilterMiddleware({
        excludeFields: ['password']
      });
      let capturedData: any;

      mockRes.json = jest.fn((data: any) => {
        capturedData = data;
        return mockRes;
      });

      middleware(mockReq, mockRes, mockNext);
      mockRes.json({ name: 'Test', password: 'allowed' });

      expect(capturedData).toEqual({ name: 'Test', password: 'allowed' });
    });
  });

  // ===========================================================================
  // Default Export
  // ===========================================================================
  describe('default export', () => {
    it('should export all filter functions', () => {
      expect(responseFilter.default).toBeDefined();
      expect(responseFilter.default.filterResponse).toBe(responseFilter.filterResponse);
      expect(responseFilter.default.filterW9Response).toBe(responseFilter.filterW9Response);
      expect(responseFilter.default.filterTaxResponse).toBe(responseFilter.filterTaxResponse);
      expect(responseFilter.default.filterBankResponse).toBe(responseFilter.filterBankResponse);
      expect(responseFilter.default.filterGDPRExportResponse).toBe(responseFilter.filterGDPRExportResponse);
      expect(responseFilter.default.responseFilterMiddleware).toBe(responseFilter.responseFilterMiddleware);
    });
  });
});
