import { FastifyRequest, FastifyReply } from 'fastify';
import {
  validate,
  schemas,
  sanitizeString,
  isValidUUID,
  isValidDateRange,
} from '../../../src/middleware/validation.middleware';

jest.mock('../../../src/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { logger } from '../../../src/logger';

describe('Validation Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockRequest = {
      query: {},
      body: {},
      params: {},
      url: '/test-endpoint',
    };

    mockReply = {
      status: mockStatus,
      send: mockSend,
    };

    jest.clearAllMocks();
  });

  describe('validate factory function', () => {
    describe('schema lookup', () => {
      it('should return 500 for non-existent schema', async () => {
        const middleware = validate('nonExistentSchema' as any);

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Internal validation error' });
        expect(logger.error).toHaveBeenCalledWith('Validation schema not found: nonExistentSchema');
      });
    });

    describe('data location selection', () => {
      it('should validate query parameters by default', async () => {
        mockRequest.query = { status: 'active' };
        const middleware = validate('alertsQuery');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should validate query when location is "query"', async () => {
        mockRequest.query = { status: 'active' };
        const middleware = validate('alertsQuery', 'query');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should validate body when location is "body"', async () => {
        mockRequest.body = {
          alertId: '550e8400-e29b-41d4-a716-446655440000',
          acknowledgedBy: 'admin-user',
        };
        const middleware = validate('acknowledgeAlertBody', 'body');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should validate params when location is "params"', async () => {
        mockRequest.params = { id: '123' };
        const middleware = validate('alertsQuery', 'params');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        // alertsQuery applied to params - will apply defaults
        expect(mockStatus).not.toHaveBeenCalled();
      });
    });

    describe('validation success', () => {
      it('should replace query with validated/sanitized data', async () => {
        mockRequest.query = {
          status: 'active',
          limit: '25',
          unknownField: 'should-be-stripped',
        };
        const middleware = validate('alertsQuery', 'query');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect((mockRequest as any).query).toEqual({
          status: 'active',
          severity: 'all',
          limit: 25,
          offset: 0,
          sortBy: 'timestamp',
          sortOrder: 'desc',
        });
        expect((mockRequest as any).query.unknownField).toBeUndefined();
      });

      it('should replace body with validated/sanitized data', async () => {
        mockRequest.body = {
          alertId: '550e8400-e29b-41d4-a716-446655440000',
          acknowledgedBy: 'admin',
          comment: 'Acknowledged',
          extraField: 'stripped',
        };
        const middleware = validate('acknowledgeAlertBody', 'body');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect((mockRequest as any).body.extraField).toBeUndefined();
        expect((mockRequest as any).body.alertId).toBe('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should apply default values', async () => {
        mockRequest.query = {};
        const middleware = validate('alertsQuery', 'query');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect((mockRequest as any).query).toEqual({
          status: 'active',
          severity: 'all',
          limit: 50,
          offset: 0,
          sortBy: 'timestamp',
          sortOrder: 'desc',
        });
      });

      it('should convert string numbers to numbers', async () => {
        mockRequest.query = { limit: '75', offset: '10' };
        const middleware = validate('alertsQuery', 'query');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect((mockRequest as any).query.limit).toBe(75);
        expect((mockRequest as any).query.offset).toBe(10);
        expect(typeof (mockRequest as any).query.limit).toBe('number');
      });
    });

    describe('validation errors', () => {
      it('should return 400 with error details for invalid data', async () => {
        mockRequest.query = { status: 'invalid-status' };
        const middleware = validate('alertsQuery', 'query');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              field: 'status',
              type: expect.any(String),
            }),
          ]),
        });
      });

      it('should return all validation errors (abortEarly: false)', async () => {
        mockRequest.body = {
          alertId: 'not-a-uuid',
          // missing acknowledgedBy (required)
        };
        const middleware = validate('acknowledgeAlertBody', 'body');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(400);
        const sendCall = mockSend.mock.calls[0][0];
        expect(sendCall.details.length).toBeGreaterThanOrEqual(2);
      });

      it('should log validation errors with endpoint info', async () => {
        mockRequest.url = '/api/alerts';
        mockRequest.query = { limit: 'not-a-number' };
        const middleware = validate('alertsQuery', 'query');

        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Validation error:',
          expect.objectContaining({
            endpoint: '/api/alerts',
            errors: expect.any(Array),
          })
        );
      });
    });

    describe('exception handling', () => {
      it('should return 500 when validation throws unexpected error', async () => {
        // Create a schema that will throw
        const originalSchema = schemas.alertsQuery;
        (schemas as any).alertsQuery = {
          validate: () => { throw new Error('Unexpected error'); },
        };

        const middleware = validate('alertsQuery', 'query');
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Validation error' });
        expect(logger.error).toHaveBeenCalled();

        // Restore
        (schemas as any).alertsQuery = originalSchema;
      });
    });
  });

  describe('schemas', () => {
    describe('businessMetricsQuery', () => {
      it('should validate correct business metrics query', () => {
        const data = {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
          granularity: 'week',
          metrics: 'revenue,transactions',
        };

        const { error, value } = schemas.businessMetricsQuery.validate(data);

        expect(error).toBeUndefined();
        expect(value.granularity).toBe('week');
      });

      it('should reject endDate before startDate', () => {
        const data = {
          startDate: '2024-01-31T00:00:00Z',
          endDate: '2024-01-01T00:00:00Z',
        };

        const { error } = schemas.businessMetricsQuery.validate(data);

        expect(error).toBeDefined();
      });

      it('should reject invalid granularity', () => {
        const data = { granularity: 'minute' };

        const { error } = schemas.businessMetricsQuery.validate(data);

        expect(error).toBeDefined();
      });

      it('should default granularity to "day"', () => {
        const { value } = schemas.businessMetricsQuery.validate({});

        expect(value.granularity).toBe('day');
      });

      it('should reject invalid metrics format', () => {
        const data = { metrics: 'revenue,INVALID,123' };

        const { error } = schemas.businessMetricsQuery.validate(data);

        expect(error).toBeDefined();
      });
    });

    describe('alertsQuery', () => {
      it('should validate correct alerts query', () => {
        const data = {
          status: 'resolved',
          severity: 'critical',
          limit: 25,
          offset: 50,
          sortBy: 'severity',
          sortOrder: 'asc',
        };

        const { error, value } = schemas.alertsQuery.validate(data);

        expect(error).toBeUndefined();
        expect(value).toMatchObject(data);
      });

      it('should enforce limit max of 100', () => {
        const { error } = schemas.alertsQuery.validate({ limit: 150 });

        expect(error).toBeDefined();
        expect(error?.message).toContain('100');
      });

      it('should enforce limit min of 1', () => {
        const { error } = schemas.alertsQuery.validate({ limit: 0 });

        expect(error).toBeDefined();
      });

      it('should enforce offset min of 0', () => {
        const { error } = schemas.alertsQuery.validate({ offset: -1 });

        expect(error).toBeDefined();
      });

      it('should accept all valid status values', () => {
        const statuses = ['active', 'resolved', 'acknowledged', 'all'];

        statuses.forEach(status => {
          const { error } = schemas.alertsQuery.validate({ status });
          expect(error).toBeUndefined();
        });
      });

      it('should accept all valid severity values', () => {
        const severities = ['critical', 'high', 'medium', 'low', 'all'];

        severities.forEach(severity => {
          const { error } = schemas.alertsQuery.validate({ severity });
          expect(error).toBeUndefined();
        });
      });
    });

    describe('acknowledgeAlertBody', () => {
      it('should validate correct acknowledge body', () => {
        const data = {
          alertId: '550e8400-e29b-41d4-a716-446655440000',
          acknowledgedBy: 'admin@example.com',
          comment: 'Investigating the issue',
        };

        const { error } = schemas.acknowledgeAlertBody.validate(data);

        expect(error).toBeUndefined();
      });

      it('should require alertId', () => {
        const data = { acknowledgedBy: 'admin' };

        const { error } = schemas.acknowledgeAlertBody.validate(data);

        expect(error).toBeDefined();
        expect(error?.message).toContain('alertId');
      });

      it('should require valid UUID for alertId', () => {
        const data = {
          alertId: 'not-a-uuid',
          acknowledgedBy: 'admin',
        };

        const { error } = schemas.acknowledgeAlertBody.validate(data);

        expect(error).toBeDefined();
      });

      it('should require acknowledgedBy', () => {
        const data = { alertId: '550e8400-e29b-41d4-a716-446655440000' };

        const { error } = schemas.acknowledgeAlertBody.validate(data);

        expect(error).toBeDefined();
      });

      it('should enforce comment max length of 1000', () => {
        const data = {
          alertId: '550e8400-e29b-41d4-a716-446655440000',
          acknowledgedBy: 'admin',
          comment: 'x'.repeat(1001),
        };

        const { error } = schemas.acknowledgeAlertBody.validate(data);

        expect(error).toBeDefined();
      });
    });

    describe('metricsHistoryQuery', () => {
      it('should validate correct metrics history query', () => {
        const data = {
          metricName: 'cpu_usage',
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-01T12:00:00Z',
          aggregation: 'max',
          interval: '15m',
        };

        const { error } = schemas.metricsHistoryQuery.validate(data);

        expect(error).toBeUndefined();
      });

      it('should require all mandatory fields', () => {
        const { error } = schemas.metricsHistoryQuery.validate({});

        expect(error).toBeDefined();
      });

      it('should reject endTime before startTime', () => {
        const data = {
          metricName: 'cpu',
          startTime: '2024-01-02T00:00:00Z',
          endTime: '2024-01-01T00:00:00Z',
        };

        const { error } = schemas.metricsHistoryQuery.validate(data);

        expect(error).toBeDefined();
      });

      it('should accept all valid aggregation types', () => {
        const aggregations = ['avg', 'sum', 'min', 'max', 'count'];

        aggregations.forEach(aggregation => {
          const data = {
            metricName: 'test',
            startTime: '2024-01-01T00:00:00Z',
            endTime: '2024-01-02T00:00:00Z',
            aggregation,
          };
          const { error } = schemas.metricsHistoryQuery.validate(data);
          expect(error).toBeUndefined();
        });
      });

      it('should accept all valid interval values', () => {
        const intervals = ['1m', '5m', '15m', '1h', '6h', '1d'];

        intervals.forEach(interval => {
          const data = {
            metricName: 'test',
            startTime: '2024-01-01T00:00:00Z',
            endTime: '2024-01-02T00:00:00Z',
            interval,
          };
          const { error } = schemas.metricsHistoryQuery.validate(data);
          expect(error).toBeUndefined();
        });
      });
    });

    describe('customMetricBody', () => {
      it('should validate correct custom metric', () => {
        const data = {
          name: 'custom_metric_name',
          value: 42.5,
          type: 'gauge',
          tags: { env: 'production', service: 'api' },
          timestamp: '2024-01-01T12:00:00Z',
        };

        const { error } = schemas.customMetricBody.validate(data);

        expect(error).toBeUndefined();
      });

      it('should require name to start with letter or underscore', () => {
        const invalid = ['123metric', '-metric', '.metric'];

        invalid.forEach(name => {
          const { error } = schemas.customMetricBody.validate({
            name,
            value: 1,
            type: 'counter',
          });
          expect(error).toBeDefined();
        });
      });

      it('should allow valid metric names', () => {
        const valid = ['metric', '_metric', 'metric_123', 'a'];

        valid.forEach(name => {
          const { error } = schemas.customMetricBody.validate({
            name,
            value: 1,
            type: 'counter',
          });
          expect(error).toBeUndefined();
        });
      });

      it('should accept all valid metric types', () => {
        const types = ['counter', 'gauge', 'histogram'];

        types.forEach(type => {
          const { error } = schemas.customMetricBody.validate({
            name: 'test',
            value: 1,
            type,
          });
          expect(error).toBeUndefined();
        });
      });

      it('should require numeric value', () => {
        const { error } = schemas.customMetricBody.validate({
          name: 'test',
          value: 'not-a-number',
          type: 'gauge',
        });

        expect(error).toBeDefined();
      });
    });

    describe('alertRuleBody', () => {
      it('should validate correct alert rule', () => {
        const data = {
          name: 'High CPU Alert',
          metric: 'cpu_usage',
          condition: 'gt',
          threshold: 90,
          duration: '5m',
          severity: 'critical',
          enabled: true,
          notificationChannels: ['email', 'slack'],
        };

        const { error } = schemas.alertRuleBody.validate(data);

        expect(error).toBeUndefined();
      });

      it('should accept all valid conditions', () => {
        const conditions = ['gt', 'lt', 'eq', 'gte', 'lte'];

        conditions.forEach(condition => {
          const data = {
            name: 'Test',
            metric: 'test',
            condition,
            threshold: 50,
            duration: '1m',
            severity: 'low',
            notificationChannels: ['email'],
          };
          const { error } = schemas.alertRuleBody.validate(data);
          expect(error).toBeUndefined();
        });
      });

      it('should require at least one notification channel', () => {
        const data = {
          name: 'Test',
          metric: 'test',
          condition: 'gt',
          threshold: 50,
          duration: '1m',
          severity: 'low',
          notificationChannels: [],
        };

        const { error } = schemas.alertRuleBody.validate(data);

        expect(error).toBeDefined();
      });

      it('should validate duration format', () => {
        const validDurations = ['1s', '30s', '1m', '5m', '1h', '24h'];
        const invalidDurations = ['1', 'm', '1d', '1x'];

        validDurations.forEach(duration => {
          const data = {
            name: 'Test',
            metric: 'test',
            condition: 'gt',
            threshold: 50,
            duration,
            severity: 'low',
            notificationChannels: ['email'],
          };
          const { error } = schemas.alertRuleBody.validate(data);
          expect(error).toBeUndefined();
        });

        invalidDurations.forEach(duration => {
          const data = {
            name: 'Test',
            metric: 'test',
            condition: 'gt',
            threshold: 50,
            duration,
            severity: 'low',
            notificationChannels: ['email'],
          };
          const { error } = schemas.alertRuleBody.validate(data);
          expect(error).toBeDefined();
        });
      });

      it('should only accept valid notification channels', () => {
        const data = {
          name: 'Test',
          metric: 'test',
          condition: 'gt',
          threshold: 50,
          duration: '1m',
          severity: 'low',
          notificationChannels: ['email', 'invalid-channel'],
        };

        const { error } = schemas.alertRuleBody.validate(data);

        expect(error).toBeDefined();
      });
    });
  });

  describe('sanitizeString', () => {
    it('should remove HTML angle brackets', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
    });

    it('should remove single and double quotes', () => {
      expect(sanitizeString("it's a \"test\"")).toBe('its a test');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello world  ')).toBe('hello world');
    });

    it('should truncate to 1000 characters', () => {
      const longString = 'a'.repeat(1500);
      expect(sanitizeString(longString).length).toBe(1000);
    });

    it('should return non-strings unchanged', () => {
      expect(sanitizeString(123 as any)).toBe(123);
      expect(sanitizeString(null as any)).toBe(null);
      expect(sanitizeString(undefined as any)).toBe(undefined);
    });

    it('should handle empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should handle combined dangerous characters', () => {
      expect(sanitizeString('<div onclick="alert(\'xss\')">test</div>')).toBe(
        'div onclick=alert(xss)test/div'
      );
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid v4 UUIDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should return false for invalid UUIDs', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400e29b41d4a716446655440000',
        '550e8400-e29b-41d4-a716-44665544000g',
        '',
        '550e8400-e29b-61d4-a716-446655440000', // invalid version (6)
        '550e8400-e29b-41d4-c716-446655440000', // invalid variant (c)
      ];

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });

    it('should be case-insensitive', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });
  });

  describe('isValidDateRange', () => {
    it('should return true for valid date ranges', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');

      expect(isValidDateRange(start, end)).toBe(true);
    });

    it('should return true when start equals end', () => {
      const date = new Date('2024-01-01');

      expect(isValidDateRange(date, date)).toBe(true);
    });

    it('should return false when end is before start', () => {
      const start = new Date('2024-01-31');
      const end = new Date('2024-01-01');

      expect(isValidDateRange(start, end)).toBe(false);
    });

    it('should return false when range exceeds maxDays (default 90)', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-05-01'); // ~120 days

      expect(isValidDateRange(start, end)).toBe(false);
    });

    it('should return true when range equals maxDays', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-03-31'); // exactly 90 days

      expect(isValidDateRange(start, end, 90)).toBe(true);
    });

    it('should respect custom maxDays parameter', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-08'); // 7 days

      expect(isValidDateRange(start, end, 7)).toBe(true);
      expect(isValidDateRange(start, end, 5)).toBe(false);
    });

    it('should handle dates with time components', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T23:59:59Z');

      expect(isValidDateRange(start, end)).toBe(true);
    });
  });
});
