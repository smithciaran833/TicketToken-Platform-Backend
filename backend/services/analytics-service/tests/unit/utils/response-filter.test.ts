/**
 * Response Filter Unit Tests
 */

import {
  filterResponse,
  filterError,
  safeResponse,
} from '../../../src/utils/response-filter';

describe('Response Filter', () => {
  describe('filterResponse', () => {
    it('should remove sensitive fields', () => {
      const data = {
        username: 'john_doe',
        email: 'john@example.com',
        password: 'secret123',
        apiKey: 'api_key_abc',
        token: 'jwt_token_xyz',
      };

      const filtered = filterResponse(data);

      expect(filtered).toHaveProperty('username', 'john_doe');
      expect(filtered).toHaveProperty('email');
      expect(filtered).not.toHaveProperty('password');
      expect(filtered).not.toHaveProperty('apiKey');
      expect(filtered).not.toHaveProperty('token');
    });

    it('should mask partial fields', () => {
      const data = {
        name: 'John Doe',
        phone: '1234567890',
        email: 'john@example.com',
      };

      const filtered = filterResponse(data);

      // Phone: 1234567890 (10 chars) -> mask first 6, show last 4
      expect(filtered.phone).toBe('******7890');
      
      // Email: john@example.com (16 chars) -> mask first 12, show last 4
      expect(filtered.email).toBe('************.com');
      expect(filtered.email.endsWith('.com')).toBe(true);
      expect(filtered.email).toContain('*');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'Jane',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
          profile: {
            bio: 'Hello world',
          },
        },
      };

      const filtered = filterResponse(data);

      expect(filtered.user.name).toBe('Jane');
      expect(filtered.user.profile.bio).toBe('Hello world');
      expect(filtered.user.credentials).toEqual({});
    });

    it('should handle arrays', () => {
      const data = {
        users: [
          { name: 'Alice', password: 'pass1' },
          { name: 'Bob', password: 'pass2' },
        ],
      };

      const filtered = filterResponse(data);

      expect(filtered.users).toHaveLength(2);
      expect(filtered.users[0]).toHaveProperty('name', 'Alice');
      expect(filtered.users[0]).not.toHaveProperty('password');
      expect(filtered.users[1]).toHaveProperty('name', 'Bob');
      expect(filtered.users[1]).not.toHaveProperty('password');
    });

    it('should handle null and undefined', () => {
      expect(filterResponse(null)).toBeNull();
      expect(filterResponse(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(filterResponse('string')).toBe('string');
      expect(filterResponse(123)).toBe(123);
      expect(filterResponse(true)).toBe(true);
    });

    it('should prevent deep recursion', () => {
      const deepObject: any = { level: 0 };
      let current = deepObject;
      for (let i = 1; i <= 15; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      expect(() => filterResponse(deepObject)).not.toThrow();
    });

    it('should remove various sensitive field patterns', () => {
      const data = {
        secret: 'secret',
        api_key: 'key',
        privateKey: 'private',
        ssn: '123-45-6789',
        credit_card: '1234-5678-9012-3456',
        authToken: 'token',
        refresh_token: 'refresh',
        encryption_key: 'encrypt',
        salt: 'salt123',
        hash: 'hash456',
        internal_id: 'internal',
        _id: 'mongodb_id',
        __v: 0,
      };

      const filtered = filterResponse(data);

      expect(Object.keys(filtered)).toHaveLength(0);
    });

    it('should handle case-insensitive field matching', () => {
      const data = {
        PASSWORD: 'secret',
        ApiKey: 'key',
        Secret: 'confidential',
      };

      const filtered = filterResponse(data);

      expect(Object.keys(filtered)).toHaveLength(0);
    });

    it('should mask strings shorter than 4 characters', () => {
      const data = {
        phone: '123',
      };

      const filtered = filterResponse(data);

      expect(filtered.phone).toBe('****');
    });

    it('should mask account numbers showing last 4 digits', () => {
      const data = {
        account_number: '1234567890123456',
      };

      const filtered = filterResponse(data);

      // 16 chars -> mask first 12, show last 4
      expect(filtered.account_number).toBe('************3456');
      expect(filtered.account_number.endsWith('3456')).toBe(true);
    });
  });

  describe('filterError', () => {
    it('should remove stack trace in production', () => {
      const error = {
        message: 'Something went wrong',
        stack: 'Error at line 42...',
        code: 'ERR_001',
      };

      const filtered = filterError(error, true);

      expect(filtered).toHaveProperty('message');
      expect(filtered).toHaveProperty('code');
      expect(filtered).not.toHaveProperty('stack');
    });

    it('should keep stack trace in development', () => {
      const error = {
        message: 'Debug this',
        stack: 'Error at line 42...',
      };

      const filtered = filterError(error, false);

      expect(filtered).toHaveProperty('stack');
    });

    it('should remove cause and originalError', () => {
      const error = {
        message: 'Error',
        cause: new Error('Root cause'),
        originalError: 'Original',
      };

      const filtered = filterError(error, true);

      expect(filtered).toHaveProperty('message');
      expect(filtered).not.toHaveProperty('cause');
      expect(filtered).not.toHaveProperty('originalError');
    });

    it('should preserve custom error properties', () => {
      const error = {
        message: 'Custom error',
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        stack: 'stack trace',
      };

      const filtered = filterError(error, true);

      expect(filtered).toHaveProperty('message');
      expect(filtered).toHaveProperty('statusCode');
      expect(filtered).toHaveProperty('errorCode');
      expect(filtered).not.toHaveProperty('stack');
    });
  });

  describe('safeResponse', () => {
    it('should filter and return safe response', () => {
      const data = {
        user: {
          name: 'Alice',
          email: 'alice@example.com',
          password: 'secret',
        },
      };

      const safe = safeResponse(data);

      expect(safe.user).toHaveProperty('name');
      expect(safe.user).not.toHaveProperty('password');
    });

    it('should remove null values by default', () => {
      const data = {
        name: 'Bob',
        age: null,
        city: 'NYC',
        country: undefined,
      };

      const safe = safeResponse(data);

      expect(safe).toHaveProperty('name');
      expect(safe).toHaveProperty('city');
      expect(safe).not.toHaveProperty('age');
      expect(safe).not.toHaveProperty('country');
    });

    it('should keep null values when includeNull is true', () => {
      const data = {
        name: 'Charlie',
        age: null,
      };

      const safe = safeResponse(data, { includeNull: true });

      expect(safe).toHaveProperty('age', null);
    });

    it('should handle nested nulls', () => {
      const data = {
        user: {
          name: 'Dave',
          profile: null,
          settings: {
            theme: null,
            language: 'en',
          },
        },
      };

      const safe = safeResponse(data);

      expect(safe.user).toHaveProperty('name');
      expect(safe.user).not.toHaveProperty('profile');
      expect(safe.user.settings).toHaveProperty('language');
      expect(safe.user.settings).not.toHaveProperty('theme');
    });

    it('should handle arrays with nulls', () => {
      const data = {
        items: ['a', null, 'b', undefined, 'c'],
      };

      const safe = safeResponse(data);

      expect(safe.items).toEqual(['a', 'b', 'c']);
    });

    it('should combine filtering and null removal', () => {
      const data = {
        username: 'user123',
        password: 'secret',
        email: null,
        verified: true,
        token: 'jwt_token',
      };

      const safe = safeResponse(data);

      expect(safe).toHaveProperty('username');
      expect(safe).toHaveProperty('verified');
      expect(safe).not.toHaveProperty('password');
      expect(safe).not.toHaveProperty('email');
      expect(safe).not.toHaveProperty('token');
    });
  });
});
