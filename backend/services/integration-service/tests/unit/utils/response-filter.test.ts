// Mock config
jest.mock('../../../src/config/index', () => ({
  isProduction: jest.fn().mockReturnValue(false),
}));

import {
  filterSensitiveFields,
  buildSuccessResponse,
  buildPaginatedResponse,
  buildErrorResponse,
  buildValidationErrorResponse,
  filterIntegrationResponse,
  filterWebhookResponse,
  filterSyncJobResponse,
  filterFieldMappingResponse,
  ApiResponse,
  ValidationError,
} from '../../../src/utils/response-filter';
import { isProduction } from '../../../src/config/index';

describe('Response Filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isProduction as jest.Mock).mockReturnValue(false);
  });

  describe('filterSensitiveFields', () => {
    it('should remove password fields', () => {
      const input = { username: 'john', password: 'secret123' };
      const result = filterSensitiveFields(input);

      expect(result.username).toBe('john');
      expect(result.password).toBeUndefined();
    });

    it('should remove all sensitive field variations', () => {
      const input = {
        accessToken: 'token123',
        access_token: 'token456',
        refreshToken: 'refresh123',
        refresh_token: 'refresh456',
        apiKey: 'key123',
        api_key: 'key456',
        clientSecret: 'secret123',
        client_secret: 'secret456',
        privateKey: 'private123',
        private_key: 'private456',
        webhookSecret: 'webhook123',
        webhook_secret: 'webhook456',
        encryptionKey: 'enc123',
        stripeSecretKey: 'sk_test_123',
        squareAccessToken: 'sq_token',
        mailchimpApiKey: 'mc_key',
        quickbooksRefreshToken: 'qb_refresh',
      };

      const result = filterSensitiveFields(input);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should mask email fields', () => {
      const input = { email: 'john.doe@example.com' };
      const result = filterSensitiveFields(input);

      expect(result.email).not.toBe('john.doe@example.com');
      expect(result.email).toContain('****');
    });

    it('should mask phone fields', () => {
      const input = { phone: '555-123-4567' };
      const result = filterSensitiveFields(input);

      expect(result.phone).toContain('****');
    });

    it('should mask card numbers', () => {
      const input = { cardNumber: '4111111111111111' };
      const result = filterSensitiveFields(input);

      expect(result.cardNumber).toContain('****');
      expect(result.cardNumber).not.toBe('4111111111111111');
    });

    it('should handle short strings for masking', () => {
      const input = { email: 'ab' };
      const result = filterSensitiveFields(input);

      expect(result.email).toBe('[MASKED]');
    });

    it('should handle medium strings for masking', () => {
      const input = { email: 'abcdef' };
      const result = filterSensitiveFields(input);

      expect(result.email).toBe('ab****');
    });

    it('should handle long strings for masking', () => {
      const input = { email: 'abcdefghij' };
      const result = filterSensitiveFields(input);

      expect(result.email).toBe('ab****ij');
    });

    it('should recursively filter nested objects', () => {
      const input = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
        },
      };

      const result = filterSensitiveFields(input);

      expect(result.user.name).toBe('John');
      expect(result.user.credentials.password).toBeUndefined();
      expect(result.user.credentials.apiKey).toBeUndefined();
    });

    it('should filter arrays of objects', () => {
      const input = [
        { name: 'John', password: 'pass1' },
        { name: 'Jane', password: 'pass2' },
      ];

      const result = filterSensitiveFields(input);

      expect(result[0].name).toBe('John');
      expect(result[0].password).toBeUndefined();
      expect(result[1].name).toBe('Jane');
      expect(result[1].password).toBeUndefined();
    });

    it('should handle null values', () => {
      const result = filterSensitiveFields(null as any);
      expect(result).toBeNull();
    });

    it('should handle undefined values', () => {
      const result = filterSensitiveFields(undefined as any);
      expect(result).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(filterSensitiveFields('string' as any)).toBe('string');
      expect(filterSensitiveFields(123 as any)).toBe(123);
      expect(filterSensitiveFields(true as any)).toBe(true);
    });

    it('should handle deeply nested objects with depth limit', () => {
      let deepObject: any = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        deepObject = { nested: deepObject, password: 'secret' };
      }

      // Should not throw
      const result = filterSensitiveFields(deepObject);
      expect(result).toBeDefined();
    });

    it('should preserve non-sensitive fields', () => {
      const input = {
        id: '123',
        name: 'Test',
        status: 'active',
        count: 42,
        enabled: true,
        tags: ['a', 'b'],
      };

      const result = filterSensitiveFields(input);

      expect(result.id).toBe('123');
      expect(result.name).toBe('Test');
      expect(result.status).toBe('active');
      expect(result.count).toBe(42);
      expect(result.enabled).toBe(true);
      expect(result.tags).toEqual(['a', 'b']);
    });
  });

  describe('buildSuccessResponse', () => {
    it('should build success response with data', () => {
      const data = { id: '123', name: 'Test' };
      const response = buildSuccessResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta).toBeDefined();
      expect(response.meta?.timestamp).toBeDefined();
      expect(response.meta?.version).toBe('1.0.0');
    });

    it('should include requestId in meta', () => {
      const response = buildSuccessResponse({ id: '1' }, { requestId: 'req-123' });

      expect(response.meta?.requestId).toBe('req-123');
    });

    it('should include pagination in meta', () => {
      const pagination = {
        page: 1,
        limit: 10,
        total: 100,
        totalPages: 10,
        hasNext: true,
        hasPrevious: false,
      };

      const response = buildSuccessResponse({ items: [] }, { pagination });

      expect(response.meta?.pagination).toEqual(pagination);
    });

    it('should include tenant in meta', () => {
      const response = buildSuccessResponse({ id: '1' }, { tenant: 'tenant-123' });

      expect(response.meta?.tenant).toBe('tenant-123');
    });

    it('should filter sensitive fields from data', () => {
      const data = { id: '123', password: 'secret' };
      const response = buildSuccessResponse(data);

      expect(response.data?.id).toBe('123');
      expect((response.data as any)?.password).toBeUndefined();
    });
  });

  describe('buildPaginatedResponse', () => {
    it('should build paginated response', () => {
      const items = [{ id: '1' }, { id: '2' }];
      const pagination = { page: 1, limit: 10, total: 50 };

      const response = buildPaginatedResponse(items, pagination);

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.meta?.pagination).toBeDefined();
    });

    it('should calculate pagination metadata', () => {
      const items = [{ id: '1' }];
      const pagination = { page: 2, limit: 10, total: 35 };

      const response = buildPaginatedResponse(items, pagination);

      expect(response.meta?.pagination?.page).toBe(2);
      expect(response.meta?.pagination?.limit).toBe(10);
      expect(response.meta?.pagination?.total).toBe(35);
      expect(response.meta?.pagination?.totalPages).toBe(4);
      expect(response.meta?.pagination?.hasNext).toBe(true);
      expect(response.meta?.pagination?.hasPrevious).toBe(true);
    });

    it('should handle first page', () => {
      const response = buildPaginatedResponse([], { page: 1, limit: 10, total: 20 });

      expect(response.meta?.pagination?.hasPrevious).toBe(false);
      expect(response.meta?.pagination?.hasNext).toBe(true);
    });

    it('should handle last page', () => {
      const response = buildPaginatedResponse([], { page: 2, limit: 10, total: 20 });

      expect(response.meta?.pagination?.hasPrevious).toBe(true);
      expect(response.meta?.pagination?.hasNext).toBe(false);
    });

    it('should filter sensitive fields from items', () => {
      const items = [
        { id: '1', apiKey: 'secret1' },
        { id: '2', apiKey: 'secret2' },
      ];

      const response = buildPaginatedResponse(items, { page: 1, limit: 10, total: 2 });

      expect(response.data?.[0].id).toBe('1');
      expect((response.data?.[0] as any).apiKey).toBeUndefined();
    });

    it('should include requestId and tenant', () => {
      const response = buildPaginatedResponse(
        [],
        { page: 1, limit: 10, total: 0 },
        { requestId: 'req-123', tenant: 'tenant-456' }
      );

      expect(response.meta?.requestId).toBe('req-123');
      expect(response.meta?.tenant).toBe('tenant-456');
    });
  });

  describe('buildErrorResponse', () => {
    it('should build error response with status and title', () => {
      const response = buildErrorResponse(404, 'Not Found');

      expect(response.success).toBe(false);
      expect(response.error?.status).toBe(404);
      expect(response.error?.title).toBe('Not Found');
    });

    it('should include default error type', () => {
      const response = buildErrorResponse(500, 'Internal Error');

      expect(response.error?.type).toBe('urn:error:integration-service:500');
    });

    it('should allow custom error type', () => {
      const response = buildErrorResponse(400, 'Bad Request', {
        type: 'urn:error:custom:validation',
      });

      expect(response.error?.type).toBe('urn:error:custom:validation');
    });

    it('should include detail', () => {
      const response = buildErrorResponse(400, 'Bad Request', {
        detail: 'The request body was malformed',
      });

      expect(response.error?.detail).toBe('The request body was malformed');
    });

    it('should include instance', () => {
      const response = buildErrorResponse(500, 'Error', {
        instance: '/api/users/123',
      });

      expect(response.error?.instance).toBe('/api/users/123');
    });

    it('should include validation errors', () => {
      const errors: ValidationError[] = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'name', message: 'Required field' },
      ];

      const response = buildErrorResponse(400, 'Validation Failed', { errors });

      expect(response.error?.errors).toHaveLength(2);
      expect(response.error?.errors?.[0].field).toBe('email');
    });

    it('should include meta with timestamp', () => {
      const response = buildErrorResponse(500, 'Error');

      expect(response.meta?.timestamp).toBeDefined();
      expect(response.meta?.version).toBe('1.0.0');
    });
  });

  describe('buildValidationErrorResponse', () => {
    it('should build validation error response', () => {
      const errors: ValidationError[] = [
        { field: 'email', message: 'Invalid' },
      ];

      const response = buildValidationErrorResponse(errors);

      expect(response.success).toBe(false);
      expect(response.error?.status).toBe(400);
      expect(response.error?.title).toBe('Validation Failed');
      expect(response.error?.type).toBe('urn:error:integration-service:validation_error');
    });

    it('should include error count in detail', () => {
      const errors: ValidationError[] = [
        { field: 'email', message: 'Invalid' },
        { field: 'name', message: 'Required' },
        { field: 'phone', message: 'Invalid format' },
      ];

      const response = buildValidationErrorResponse(errors);

      expect(response.error?.detail).toBe('3 validation error(s) occurred');
    });

    it('should include requestId as instance', () => {
      const response = buildValidationErrorResponse([], 'req-456');

      expect(response.error?.instance).toBe('req-456');
    });
  });

  describe('filterIntegrationResponse', () => {
    it('should filter integration response', () => {
      const integration = {
        id: 'int-123',
        tenant_id: 'tenant-456',
        provider: 'stripe',
        name: 'My Stripe',
        description: 'Description',
        enabled: true,
        status: 'active',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        config: { key: 'value', apiKey: 'secret' },
        last_sync_at: '2024-01-02',
        accessToken: 'should-be-removed',
      };

      const result = filterIntegrationResponse(integration);

      expect(result.id).toBe('int-123');
      expect(result.tenantId).toBe('tenant-456');
      expect(result.provider).toBe('stripe');
      expect(result.config?.key).toBe('value');
      expect((result.config as any)?.apiKey).toBeUndefined();
      expect((result as any).accessToken).toBeUndefined();
    });

    it('should handle camelCase field names', () => {
      const integration = {
        id: 'int-123',
        tenantId: 'tenant-456',
        provider: 'stripe',
        name: 'Test',
        enabled: true,
        status: 'active',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        lastSyncAt: '2024-01-02',
      };

      const result = filterIntegrationResponse(integration);

      expect(result.tenantId).toBe('tenant-456');
      expect(result.createdAt).toBe('2024-01-01');
      expect(result.lastSyncAt).toBe('2024-01-02');
    });
  });

  describe('filterWebhookResponse', () => {
    it('should filter webhook response', () => {
      const webhook = {
        id: 'wh-123',
        integration_id: 'int-456',
        provider: 'stripe',
        events: ['payment.succeeded', 'payment.failed'],
        status: 'active',
        created_at: '2024-01-01',
        last_received_at: '2024-01-02',
        signingSecret: 'should-be-removed',
      };

      const result = filterWebhookResponse(webhook);

      expect(result.id).toBe('wh-123');
      expect(result.integrationId).toBe('int-456');
      expect(result.events).toEqual(['payment.succeeded', 'payment.failed']);
      expect((result as any).signingSecret).toBeUndefined();
    });

    it('should handle empty events array', () => {
      const webhook = {
        id: 'wh-123',
        provider: 'stripe',
        status: 'active',
        created_at: '2024-01-01',
      };

      const result = filterWebhookResponse(webhook);

      expect(result.events).toEqual([]);
    });
  });

  describe('filterSyncJobResponse', () => {
    it('should filter sync job response', () => {
      const job = {
        id: 'job-123',
        integration_id: 'int-456',
        sync_type: 'full',
        status: 'completed',
        progress: 100,
        records_processed: 500,
        records_failed: 5,
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T01:00:00Z',
        error_message: 'Some error',
      };

      const result = filterSyncJobResponse(job);

      expect(result.id).toBe('job-123');
      expect(result.integrationId).toBe('int-456');
      expect(result.syncType).toBe('full');
      expect(result.recordsProcessed).toBe(500);
      expect(result.recordsFailed).toBe(5);
    });

    it('should include error message in non-production', () => {
      (isProduction as jest.Mock).mockReturnValue(false);

      const job = {
        id: 'job-123',
        status: 'failed',
        error_message: 'Database connection failed',
      };

      const result = filterSyncJobResponse(job);

      expect(result.errorMessage).toBe('Database connection failed');
    });

    it('should hide error message in production', () => {
      (isProduction as jest.Mock).mockReturnValue(true);

      const job = {
        id: 'job-123',
        status: 'failed',
        error_message: 'Database connection failed',
      };

      const result = filterSyncJobResponse(job);

      expect(result.errorMessage).toBeUndefined();
    });

    it('should default numeric fields to 0', () => {
      const job = {
        id: 'job-123',
        status: 'pending',
      };

      const result = filterSyncJobResponse(job);

      expect(result.progress).toBe(0);
      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsFailed).toBe(0);
    });
  });

  describe('filterFieldMappingResponse', () => {
    it('should filter field mapping response', () => {
      const mapping = {
        id: 'map-123',
        integration_id: 'int-456',
        source_field: 'customer.email',
        target_field: 'email_address',
        transformer: 'lowercase',
        required: true,
        enabled: true,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      };

      const result = filterFieldMappingResponse(mapping);

      expect(result.id).toBe('map-123');
      expect(result.integrationId).toBe('int-456');
      expect(result.sourceField).toBe('customer.email');
      expect(result.targetField).toBe('email_address');
      expect(result.transformer).toBe('lowercase');
      expect(result.required).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it('should handle camelCase field names', () => {
      const mapping = {
        id: 'map-123',
        integrationId: 'int-456',
        sourceField: 'name',
        targetField: 'fullName',
        transformer: 'none',
        required: false,
        enabled: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      const result = filterFieldMappingResponse(mapping);

      expect(result.sourceField).toBe('name');
      expect(result.targetField).toBe('fullName');
    });
  });
});
