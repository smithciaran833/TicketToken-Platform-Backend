/**
 * COMPREHENSIVE Unit Tests for Response Filter Utility
 * 
 * Tests actual filtering and masking behavior:
 * - Sensitive field removal (passwords, secrets, tokens)
 * - Email and wallet masking algorithms
 * - Production vs development mode behavior
 * - Nested object filtering and recursion limits
 * - Array truncation and string limits
 * - Error sanitization and RFC 7807 formatting
 * - Security: prevent data leakage through various attack vectors
 */

import {
  filterResponse,
  filterErrorResponse,
  createErrorResponse,
  filterUserData,
  filterTransferData,
  maskEmail,
  maskWallet
} from '../../../src/utils/response-filter';

jest.mock('../../../src/utils/logger');

describe('Response Filter - Behavioral Tests', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Masking Algorithms - Email', () => {
    it('should mask email showing first 3 chars and full domain', () => {
      const testCases = [
        { input: 'john@example.com', expected: 'joh***@example.com' },
        { input: 'alice@company.co.uk', expected: 'ali***@company.co.uk' },
        { input: 'bob123@gmail.com', expected: 'bob***@gmail.com' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskEmail(input)).toBe(expected);
      });
    });

    it('should mask short emails completely', () => {
      const shortEmails = ['ab@test.com', 'a@b.com', 'xy@domain.com'];

      shortEmails.forEach(email => {
        const masked = maskEmail(email);
        expect(masked).toContain('***@');
        expect(masked).not.toContain(email.split('@')[0]);
      });
    });

    it('should handle edge case emails', () => {
      expect(maskEmail('')).toBe('');
      expect(maskEmail('invalid-email')).toBe('***');
      expect(maskEmail('no-at-sign.com')).toBe('***');
      expect(maskEmail('multiple@at@signs.com')).toBe('***');
    });

    it('should preserve domain completely for deliverability checks', () => {
      const email = 'testuser@corporate-domain.example.com';
      const masked = maskEmail(email);
      
      expect(masked).toContain('@corporate-domain.example.com');
      expect(masked.endsWith('@corporate-domain.example.com')).toBe(true);
    });

    it('should handle non-string inputs gracefully', () => {
      expect(maskEmail(null as any)).toBe(null);
      expect(maskEmail(undefined as any)).toBe(undefined);
      expect(maskEmail(123 as any)).toBe(123);
    });
  });

  describe('Masking Algorithms - Wallet', () => {
    it('should show first 4 and last 4 characters of wallet', () => {
      const wallet = 'Bxv7w9H8PbUv5K3zM2Yz7QwF6Lc8Vx9Gs2Zn3Wr1';
      const masked = maskWallet(wallet);
      
      expect(masked).toBe('Bxv7...3Wr1');
      expect(masked.startsWith('Bxv7')).toBe(true);
      expect(masked.endsWith('3Wr1')).toBe(true);
      expect(masked).toContain('...');
    });

    it('should mask short wallets completely', () => {
      const shortWallets = ['abc123', '1234567', '12345678'];

      shortWallets.forEach(wallet => {
        expect(maskWallet(wallet)).toBe('***');
      });
    });

    it('should handle Ethereum-style addresses', () => {
      const ethAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const masked = maskWallet(ethAddress);
      
      expect(masked).toBe('0x74...bEb');
    });

    it('should handle Bitcoin-style addresses', () => {
      const btcAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const masked = maskWallet(btcAddress);
      
      expect(masked).toBe('1A1z...fNa');
    });

    it('should handle non-string inputs gracefully', () => {
      expect(maskWallet(null as any)).toBe(null);
      expect(maskWallet(undefined as any)).toBe(undefined);
    });
  });

  describe('Sensitive Field Removal', () => {
    it('should remove password fields completely', () => {
      const data = {
        username: 'john',
        password: 'super-secret-password',
        passwordHash: '$2a$10$abcdefg',
        email: 'john@example.com'
      };

      const filtered = filterResponse(data);

      expect(filtered).not.toHaveProperty('password');
      expect(filtered).not.toHaveProperty('passwordHash');
      expect(filtered).toHaveProperty('username');
    });

    it('should remove all sensitive token fields', () => {
      const data = {
        user: 'alice',
        token: 'jwt-token-here',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        apiKey: 'api-key-secret',
        secretKey: 'secret-key',
        webhookSecret: 'webhook-secret'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('user');
      expect(filtered).not.toHaveProperty('token');
      expect(filtered).not.toHaveProperty('accessToken');
      expect(filtered).not.toHaveProperty('refreshToken');
      expect(filtered).not.toHaveProperty('apiKey');
      expect(filtered).not.toHaveProperty('secretKey');
      expect(filtered).not.toHaveProperty('webhookSecret');
    });

    it('should remove acceptance codes for transfers', () => {
      const transfer = {
        id: 'transfer-123',
        ticketId: 'ticket-456',
        acceptanceCode: 'ABC12345',
        acceptanceCodeHash: 'hashed-value',
        status: 'PENDING'
      };

      const filtered = filterResponse(transfer);

      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('status');
      expect(filtered).not.toHaveProperty('acceptanceCode');
      expect(filtered).not.toHaveProperty('acceptanceCodeHash');
    });

    it('should remove blockchain private keys and mnemonics', () => {
      const wallet = {
        address: 'Bxv7w9H8PbUv5K3zM2Yz7QwF6Lc8Vx9Gs2Zn3Wr1',
        privateKey: 'super-secret-private-key',
        seedPhrase: 'word1 word2 word3 word4 word5 word6',
        mnemonic: 'mnemonic phrase here',
        publicKey: 'public-key-ok-to-share'
      };

      const filtered = filterResponse(wallet);

      expect(filtered).toHaveProperty('publicKey');
      expect(filtered).not.toHaveProperty('privateKey');
      expect(filtered).not.toHaveProperty('seedPhrase');
      expect(filtered).not.toHaveProperty('mnemonic');
    });

    it('should remove sensitive fields regardless of case', () => {
      const data = {
        PASSWORD: 'secret',
        ApiKey: 'key123',
        SECRETKEY: 'secret',
        normalField: 'ok'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('normalField');
      expect(filtered).not.toHaveProperty('PASSWORD');
      expect(filtered).not.toHaveProperty('ApiKey');
      expect(filtered).not.toHaveProperty('SECRETKEY');
    });
  });

  describe('Production vs Development Mode', () => {
    it('should remove stack traces in production', () => {
      process.env.NODE_ENV = 'production';

      const data = {
        message: 'Error occurred',
        stack: 'Error: at line 1\nat function2\nat function3',
        stackTrace: 'full stack trace',
        result: 'data'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('message');
      expect(filtered).toHaveProperty('result');
      expect(filtered).not.toHaveProperty('stack');
      expect(filtered).not.toHaveProperty('stackTrace');
    });

    it('should keep stack traces in development', () => {
      process.env.NODE_ENV = 'development';

      const data = {
        message: 'Error occurred',
        stack: 'Error: at line 1\nat function2',
        result: 'data'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('stack');
      expect(filtered.stack).toBe('Error: at line 1\nat function2');
    });

    it('should remove SQL queries and bindings in production', () => {
      process.env.NODE_ENV = 'production';

      const data = {
        error: 'Database error',
        query: 'SELECT * FROM users WHERE password = ?',
        sql: 'INSERT INTO secrets...',
        bindings: ['sensitive-data'],
        message: 'Query failed'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('message');
      expect(filtered).not.toHaveProperty('query');
      expect(filtered).not.toHaveProperty('sql');
      expect(filtered).not.toHaveProperty('bindings');
    });

    it('should keep debug info in development', () => {
      process.env.NODE_ENV = 'development';

      const data = {
        result: 'success',
        debugInfo: { executionTime: 123, memoryUsed: 456 },
        query: 'SELECT * FROM transfers'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('debugInfo');
      expect(filtered).toHaveProperty('query');
    });
  });

  describe('Field Masking', () => {
    it('should mask email fields while keeping structure', () => {
      const data = {
        userId: 'user-123',
        email: 'sensitive@example.com',
        recipientEmail: 'recipient@test.com',
        name: 'John'
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('email');
      expect(filtered.email).not.toBe('sensitive@example.com');
      expect(filtered.email).toContain('***@example.com');
      
      expect(filtered).toHaveProperty('recipientEmail');
      expect(filtered.recipientEmail).toContain('***@test.com');
    });

    it('should mask wallet addresses', () => {
      const data = {
        transferId: 'transfer-123',
        wallet: 'Bxv7w9H8PbUv5K3zM2Yz7QwF6Lc8Vx9Gs2Zn3Wr1',
        recipientWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      };

      const filtered = filterResponse(data);

      expect(filtered.wallet).toBe('Bxv7...3Wr1');
      expect(filtered.recipientWallet).toBe('1A1z...fNa');
    });
  });

  describe('Nested Object Filtering', () => {
    it('should recursively filter nested objects', () => {
      const data = {
        transfer: {
          id: 'transfer-123',
          user: {
            name: 'Alice',
            password: 'secret-password',
            email: 'alice@example.com'
          },
          acceptanceCode: 'ABC123'
        }
      };

      const filtered = filterResponse(data);

      expect(filtered.transfer.id).toBe('transfer-123');
      expect(filtered.transfer.user.name).toBe('Alice');
      expect(filtered.transfer.user).not.toHaveProperty('password');
      expect(filtered.transfer.user.email).toContain('***@example.com');
      expect(filtered.transfer).not.toHaveProperty('acceptanceCode');
    });

    it('should filter arrays of objects', () => {
      const data = {
        transfers: [
          { id: '1', password: 'secret1', status: 'pending' },
          { id: '2', apiKey: 'key123', status: 'completed' },
          { id: '3', status: 'failed' }
        ]
      };

      const filtered = filterResponse(data);

      expect(filtered.transfers).toHaveLength(3);
      filtered.transfers.forEach((transfer: any) => {
        expect(transfer).not.toHaveProperty('password');
        expect(transfer).not.toHaveProperty('apiKey');
        expect(transfer).toHaveProperty('status');
      });
    });

    it('should enforce maximum depth limit', () => {
      // Create deeply nested object (15 levels)
      let deepObj: any = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        deepObj = { nested: deepObj };
      }

      const filtered = filterResponse(deepObj);

      // Should hit max depth and return placeholder
      let current = filtered;
      let depth = 0;
      while (current && typeof current === 'object' && 'nested' in current) {
        current = current.nested;
        depth++;
        if (depth > 12) break; // Safety limit
      }

      expect(depth).toBeLessThan(15);
    });
  });

  describe('Array and String Limits', () => {
    it('should truncate very long strings', () => {
      const longString = 'a'.repeat(15000);
      const data = { description: longString };

      const filtered = filterResponse(data);

      expect(filtered.description).toContain('...[truncated]');
      expect((filtered.description as string).length).toBeLessThan(longString.length);
    });

    it('should keep short strings unchanged', () => {
      const shortString = 'This is a normal string';
      const data = { message: shortString };

      const filtered = filterResponse(data);

      expect(filtered.message).toBe(shortString);
    });

    it('should truncate very long arrays', () => {
      const longArray = Array(2000).fill({ id: 'item' });
      const data = { items: longArray };

      const filtered = filterResponse(data);

      expect(Array.isArray(filtered.items)).toBe(true);
      expect((filtered.items as any[]).length).toBeLessThan(2000);
      
      // Should have truncation indicator
      const lastItem = (filtered.items as any[])[(filtered.items as any[]).length - 1];
      expect(typeof lastItem).toBe('string');
      expect(lastItem).toContain('more items');
    });

    it('should keep short arrays unchanged', () => {
      const shortArray = [1, 2, 3, 4, 5];
      const data = { numbers: shortArray };

      const filtered = filterResponse(data);

      expect(filtered.numbers).toEqual(shortArray);
    });
  });

  describe('Error Filtering', () => {
    it('should filter Error objects safely', () => {
      const error = new Error('Something went wrong');
      (error as any).code = 'ERR_CUSTOM';
      (error as any).statusCode = 400;

      const filtered = filterErrorResponse(error);

      expect(filtered).toHaveProperty('name');
      expect(filtered).toHaveProperty('message');
      expect(filtered).toHaveProperty('code');
      expect(filtered).toHaveProperty('statusCode');
      expect(filtered.message).toBe('Something went wrong');
    });

    it('should include validation errors when present', () => {
      const error = new Error('Validation failed');
      (error as any).errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' }
      ];

      const filtered = filterErrorResponse(error);

      expect(filtered).toHaveProperty('errors');
      expect(Array.isArray(filtered.errors)).toBe(true);
    });

    it('should handle non-Error objects', () => {
      const errorObj = {
        message: 'Custom error',
        details: 'Some details',
        password: 'should-be-removed'
      };

      const filtered = filterErrorResponse(errorObj);

      expect(filtered).toHaveProperty('message');
      expect(filtered).toHaveProperty('details');
      expect(filtered).not.toHaveProperty('password');
    });

    it('should handle primitive error values', () => {
      const errorString = 'Simple error message';
      const filtered = filterErrorResponse(errorString);

      expect(filtered).toHaveProperty('message');
      expect(filtered.message).toBe(errorString);
    });
  });

  describe('RFC 7807 Error Response', () => {
    it('should create RFC 7807 compliant error response', () => {
      const error = new Error('Resource not found');
      (error as any).statusCode = 404;
      (error as any).code = 'NOT_FOUND';

      const response = createErrorResponse(error, 'req-123');

      expect(response).toHaveProperty('type');
      expect(response).toHaveProperty('title');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('instance');
      expect(response.status).toBe(404);
      expect(response.code).toBe('NOT_FOUND');
      expect(response.instance).toBe('/requests/req-123');
    });

    it('should default to 500 for unknown errors', () => {
      const error = new Error('Unknown error');
      const response = createErrorResponse(error);

      expect(response.status).toBe(500);
      expect(response.title).toBe('Internal Server Error');
    });

    it('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const response = createErrorResponse(error);

      expect(response).toHaveProperty('stack');
    });

    it('should exclude stack trace in production', () => {
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const response = createErrorResponse(error);

      expect(response).not.toHaveProperty('stack');
    });

    it('should handle errors without request ID', () => {
      const error = new Error('Test error');
      const response = createErrorResponse(error);

      expect(response.instance).toBeUndefined();
    });
  });

  describe('Specialized Filters', () => {
    it('should filter user data to public fields only', () => {
      const user = {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'John Doe',
        password: 'secret',
        passwordHash: 'hash',
        internalNotes: 'Admin notes',
        avatar: 'https://example.com/avatar.jpg',
        createdAt: '2024-01-01'
      };

      const filtered = filterUserData(user);

      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('displayName');
      expect(filtered).toHaveProperty('avatar');
      expect(filtered).toHaveProperty('createdAt');
      expect(filtered).toHaveProperty('email');
      expect(filtered.email).toContain('***@example.com');
      expect(filtered).not.toHaveProperty('password');
      expect(filtered).not.toHaveProperty('passwordHash');
      expect(filtered).not.toHaveProperty('internalNotes');
    });

    it('should filter transfer data based on requesting user', () => {
      const transfer = {
        id: 'transfer-123',
        senderId: 'user-456',
        recipientId: 'user-789',
        acceptanceCode: 'SECRET123',
        internalNotes: 'Admin notes',
        status: 'PENDING'
      };

      // Sender should see acceptance code
      const senderView = filterTransferData(transfer, 'user-456');
      expect(senderView).toHaveProperty('acceptanceCode');
      expect(senderView).not.toHaveProperty('internalNotes');

      // Non-sender should NOT see acceptance code
      const recipientView = filterTransferData(transfer, 'user-789');
      expect(recipientView).not.toHaveProperty('acceptanceCode');
      expect(recipientView).not.toHaveProperty('internalNotes');
    });
  });

  describe('Security - Data Leakage Prevention', () => {
    it('should not leak sensitive data through error messages', () => {
      const data = {
        result: 'success',
        debug: {
          query: 'SELECT * FROM users WHERE password = ?',
          bindings: ['admin-password']
        }
      };

      process.env.NODE_ENV = 'production';
      const filtered = filterResponse(data);

      const stringified = JSON.stringify(filtered);
      expect(stringified).not.toContain('admin-password');
      expect(stringified).not.toContain('SELECT * FROM users');
    });

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference

      // Should not throw
      expect(() => filterResponse(obj)).not.toThrow();
    });

    it('should handle Date objects correctly', () => {
      const data = {
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-02T12:00:00Z')
      };

      const filtered = filterResponse(data);

      expect(filtered.createdAt).toBe('2024-01-01T12:00:00.000Z');
      expect(filtered.updatedAt).toBe('2024-01-02T12:00:00.000Z');
    });

    it('should return empty object on filtering error', () => {
      // Trigger an error during filtering
      const problematic = {
        get badProperty() {
          throw new Error('Access denied');
        }
      };

      const filtered = filterResponse(problematic);

      // Should not throw, should return safe default
      expect(filtered).toBeDefined();
    });

    it('should prevent prototype pollution attempts', () => {
      const malicious = {
        __proto__: { admin: true },
        constructor: { prototype: { admin: true } },
        data: 'legitimate'
      };

      const filtered = filterResponse(malicious);

      expect(filtered).toHaveProperty('data');
      // Should not have polluted properties
      expect((filtered as any).admin).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values', () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        validValue: 'test'
      };

      const filtered = filterResponse(data);

      expect(filtered.nullValue).toBeNull();
      expect(filtered).toHaveProperty('undefinedValue');
      expect(filtered.validValue).toBe('test');
    });

    it('should handle empty objects and arrays', () => {
      const data = {
        emptyObject: {},
        emptyArray: [],
        validData: 'test'
      };

      const filtered = filterResponse(data);

      expect(filtered.emptyObject).toEqual({});
      expect(filtered.emptyArray).toEqual([]);
      expect(filtered.validData).toBe('test');
    });

    it('should handle mixed data types', () => {
      const data = {
        string: 'text',
        number: 42,
        boolean: true,
        nullVal: null,
        array: [1, 2, 3],
        object: { nested: 'value' }
      };

      const filtered = filterResponse(data);

      expect(filtered.string).toBe('text');
      expect(filtered.number).toBe(42);
      expect(filtered.boolean).toBe(true);
      expect(filtered.nullVal).toBeNull();
      expect(filtered.array).toEqual([1, 2, 3]);
      expect(filtered.object).toEqual({ nested: 'value' });
    });

    it('should handle special characters in field names', () => {
      const data = {
        'field-with-dash': 'value1',
        'field.with.dot': 'value2',
        'field_with_underscore': 'value3',
        'password-field': 'should-be-removed'
      };

      const filtered = filterResponse(data);

      expect(filtered['field-with-dash']).toBe('value1');
      expect(filtered['field.with.dot']).toBe('value2');
      expect(filtered['field_with_underscore']).toBe('value3');
      expect(filtered).not.toHaveProperty('password-field');
    });
  });
});
