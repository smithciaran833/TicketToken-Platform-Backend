import {
  filterResponse,
  filterNotificationResponse,
  filterPreferenceResponse,
  filterWebhookPayload,
  successResponse,
  errorResponse,
  paginatedResponse,
} from '../../../src/utils/response-filter';

describe('Response Filter', () => {
  describe('filterResponse()', () => {
    it('should remove blocked fields', () => {
      const data = {
        name: 'John',
        password: 'secret123',
        apiKey: 'key-abc123',
        email: 'john@example.com',
      };

      const result = filterResponse(data);

      expect(result.name).toBe('John');
      expect(result.password).toBeUndefined();
      expect(result.apiKey).toBeUndefined();
      expect(result.email).toMatch(/jo\*\*\*@example.com/);
    });

    it('should mask sensitive fields', () => {
      const data = {
        email: 'user@example.com',
        phone: '1234567890',
      };

      const result = filterResponse(data);

      expect(result.email).toBe('us***@example.com');
      expect(result.phone).toBe('123****7890');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'John',
          password: 'secret',
          profile: {
            email: 'john@example.com',
          },
        },
      };

      const result = filterResponse(data);

      expect(result.user.name).toBe('John');
      expect(result.user.password).toBeUndefined();
      expect(result.user.profile.email).toMatch(/jo\*\*\*@example.com/);
    });

    it('should handle arrays', () => {
      const data = {
        users: [
          { name: 'John', password: 'secret1' },
          { name: 'Jane', apiKey: 'key-123' },
        ],
      };

      const result = filterResponse(data);

      expect(result.users).toHaveLength(2);
      expect(result.users[0].name).toBe('John');
      expect(result.users[0].password).toBeUndefined();
      expect(result.users[1].apiKey).toBeUndefined();
    });

    it('should handle null and undefined', () => {
      const data = {
        name: 'John',
        value: null,
        other: undefined,
      };

      const result = filterResponse(data);

      expect(result.name).toBe('John');
      expect(result.value).toBeNull();
      expect(result.other).toBeUndefined();
    });

    it('should convert dates to ISO strings', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const data = { createdAt: date };

      const result = filterResponse(data);

      expect(result.createdAt).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should respect allowFields option', () => {
      const data = {
        name: 'John',
        password: 'secret123',
      };

      const result = filterResponse(data, { allowFields: ['password'] });

      expect(result.password).toBe('secret123');
    });

    it('should respect blockFields option', () => {
      const data = {
        name: 'John',
        customField: 'sensitive',
      };

      const result = filterResponse(data, { blockFields: ['customField'] });

      expect(result.name).toBe('John');
      expect(result.customField).toBeUndefined();
    });

    it('should skip masking when option is set', () => {
      const data = {
        email: 'user@example.com',
      };

      const result = filterResponse(data, { skipMasking: true });

      expect(result.email).toBe('user@example.com');
    });

    it('should prevent infinite recursion', () => {
      const data = {
        name: 'John',
        deep: {} as any,
      };
      // Create deep nesting
      let current = data.deep;
      for (let i = 0; i < 25; i++) {
        current.level = {};
        current = current.level;
      }

      const result = filterResponse(data);

      expect(result.name).toBe('John');
      // Should handle deep nesting without crashing
    });

    it('should mask credit card numbers', () => {
      const data = {
        creditCard: '4111111111111111',
      };

      const result = filterResponse(data);

      expect(result.creditCard).toBe('**** **** **** 1111');
    });

    it('should mask wallet addresses', () => {
      const data = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const result = filterResponse(data);

      expect(result.walletAddress).toBe('0x1234...5678');
    });

    it('should block snake_case sensitive fields', () => {
      const data = {
        user_name: 'John',
        password_hash: 'hashed',
        api_key: 'key123',
      };

      const result = filterResponse(data);

      expect(result.user_name).toBe('John');
      expect(result.password_hash).toBeUndefined();
      expect(result.api_key).toBeUndefined();
    });
  });

  describe('filterNotificationResponse()', () => {
    it('should block notification-specific fields', () => {
      const data = {
        id: '123',
        message: 'Hello',
        rawPayload: { secret: 'data' },
        webhookSecret: 'secret123',
      };

      const result = filterNotificationResponse(data);

      expect(result.id).toBe('123');
      expect(result.message).toBe('Hello');
      expect(result.rawPayload).toBeUndefined();
      expect(result.webhookSecret).toBeUndefined();
    });

    it('should mask email addresses', () => {
      const data = {
        recipient: 'user@example.com',
      };

      const result = filterNotificationResponse(data);

      expect(result.recipient).toMatch(/us\*\*\*@example.com/);
    });
  });

  describe('filterPreferenceResponse()', () => {
    it('should show full data for own data', () => {
      const data = {
        email: 'user@example.com',
        phone: '1234567890',
      };

      const result = filterPreferenceResponse(data, true);

      expect(result.email).toBe('user@example.com');
      expect(result.phone).toBe('1234567890');
    });

    it('should mask data for other users', () => {
      const data = {
        email: 'user@example.com',
        phone: '1234567890',
      };

      const result = filterPreferenceResponse(data, false);

      expect(result.email).toMatch(/us\*\*\*@example.com/);
      expect(result.phone).toMatch(/123\*\*\*\*7890/);
    });

    it('should block internal fields even for own data', () => {
      const data = {
        email: 'user@example.com',
        _internal: 'secret',
        auditLog: ['entry1'],
      };

      const result = filterPreferenceResponse(data, true);

      expect(result.email).toBe('user@example.com');
      expect(result._internal).toBeUndefined();
      expect(result.auditLog).toBeUndefined();
    });
  });

  describe('filterWebhookPayload()', () => {
    it('should block webhook-specific fields', () => {
      const payload = {
        event: 'delivered',
        signature: 'sig-123',
        webhookSignature: 'webhook-sig',
        verificationToken: 'token-123',
        data: { message: 'Hello' },
      };

      const result = filterWebhookPayload(payload);

      expect(result.event).toBe('delivered');
      expect(result.data).toEqual({ message: 'Hello' });
      expect(result.signature).toBeUndefined();
      expect(result.webhookSignature).toBeUndefined();
      expect(result.verificationToken).toBeUndefined();
    });
  });

  describe('successResponse()', () => {
    it('should create success response', () => {
      const data = { id: '123', name: 'Test' };
      
      const result = successResponse(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '123', name: 'Test' });
      expect(result.error).toBeUndefined();
    });

    it('should include metadata', () => {
      const data = { id: '123' };
      const meta = { requestId: 'req-123' };
      
      const result = successResponse(data, meta);

      expect(result.meta).toEqual({ requestId: 'req-123' });
    });

    it('should filter data in response', () => {
      const data = { id: '123', password: 'secret' };
      
      const result = successResponse(data);

      expect(result.data?.id).toBe('123');
      expect((result.data as any)?.password).toBeUndefined();
    });
  });

  describe('errorResponse()', () => {
    it('should create error response', () => {
      const result = errorResponse('ERR_001', 'Something went wrong');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ERR_001');
      expect(result.error?.message).toBe('Something went wrong');
      expect(result.data).toBeUndefined();
    });

    it('should include error details', () => {
      const details = { field: 'email', reason: 'invalid' };
      
      const result = errorResponse('ERR_VALIDATION', 'Validation failed', details);

      expect(result.error?.details).toEqual({ field: 'email', reason: 'invalid' });
    });

    it('should filter sensitive data in details', () => {
      const details = { field: 'email', password: 'secret' };
      
      const result = errorResponse('ERR_001', 'Error', details);

      expect(result.error?.details?.field).toBe('email');
      expect(result.error?.details?.password).toBeUndefined();
    });
  });

  describe('paginatedResponse()', () => {
    it('should create paginated response', () => {
      const data = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      
      const result = paginatedResponse(data, 1, 10, 50);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.meta?.page).toBe(1);
      expect(result.meta?.pageSize).toBe(10);
      expect(result.meta?.total).toBe(50);
    });

    it('should filter each item in data array', () => {
      const data = [
        { id: '1', password: 'secret1' },
        { id: '2', password: 'secret2' },
      ];
      
      const result = paginatedResponse(data, 1, 10, 2);

      expect(result.data?.[0].id).toBe('1');
      expect((result.data?.[0] as any)?.password).toBeUndefined();
      expect(result.data?.[1].id).toBe('2');
      expect((result.data?.[1] as any)?.password).toBeUndefined();
    });

    it('should include request ID', () => {
      const result = paginatedResponse([], 1, 10, 0, 'req-123');

      expect(result.meta?.requestId).toBe('req-123');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const result = filterResponse({});
      
      expect(result).toEqual({});
    });

    it('should handle primitive values', () => {
      const result = filterResponse({ value: 'string' } as any);
      
      expect(result.value).toBe('string');
    });

    it('should handle mixed nested structures', () => {
      const data = {
        users: [
          {
            name: 'John',
            credentials: {
              password: 'secret',
              apiKey: 'key123',
            },
            contacts: [
              { email: 'john@example.com' },
            ],
          },
        ],
      };

      const result = filterResponse(data);

      expect(result.users[0].name).toBe('John');
      expect(result.users[0].credentials.password).toBeUndefined();
      expect(result.users[0].credentials.apiKey).toBeUndefined();
      expect(result.users[0].contacts[0].email).toMatch(/jo\*\*\*@example.com/);
    });
  });
});
