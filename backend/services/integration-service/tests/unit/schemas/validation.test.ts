import Joi from 'joi';
import {
  uuidSchema,
  optionalUuidSchema,
  paginationSchema,
  dateRangeSchema,
  idParamSchema,
  providerParamSchema,
  integrationParamSchema,
  createIntegrationSchema,
  updateIntegrationSchema,
  oauthAuthorizeSchema,
  oauthCallbackSchema,
  oauthRefreshSchema,
  registerWebhookSchema,
  webhookEventSchema,
  createFieldMappingSchema,
  updateFieldMappingSchema,
  startSyncSchema,
  syncStatusSchema,
  stripeConfigSchema,
  squareConfigSchema,
  ticketmasterConfigSchema,
  eventbriteConfigSchema,
  listIntegrationsQuerySchema,
  listWebhooksQuerySchema,
  listSyncHistoryQuerySchema,
  validate,
  strict,
  toFastifySchema,
} from '../../../src/schemas/validation';

describe('Validation Schemas', () => {
  describe('Base Schemas', () => {
    describe('uuidSchema', () => {
      it('should accept valid UUID v4', () => {
        const { error } = uuidSchema.validate('123e4567-e89b-42d3-a456-556642440000');
        expect(error).toBeUndefined();
      });

      it('should reject invalid UUID', () => {
        const { error } = uuidSchema.validate('not-a-uuid');
        expect(error).toBeDefined();
        expect(error!.message).toContain('UUID');
      });

      it('should reject empty string', () => {
        const { error } = uuidSchema.validate('');
        expect(error).toBeDefined();
      });

      it('should reject undefined', () => {
        const { error } = uuidSchema.validate(undefined);
        expect(error).toBeDefined();
      });
    });

    describe('optionalUuidSchema', () => {
      it('should accept valid UUID', () => {
        const { error } = optionalUuidSchema.validate('123e4567-e89b-42d3-a456-556642440000');
        expect(error).toBeUndefined();
      });

      it('should accept null', () => {
        const { error } = optionalUuidSchema.validate(null);
        expect(error).toBeUndefined();
      });

      it('should accept undefined', () => {
        const { error } = optionalUuidSchema.validate(undefined);
        expect(error).toBeUndefined();
      });
    });

    describe('paginationSchema', () => {
      it('should accept valid pagination params', () => {
        const { error, value } = paginationSchema.validate({
          page: 2,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'asc',
        });

        expect(error).toBeUndefined();
        expect(value.page).toBe(2);
        expect(value.limit).toBe(50);
      });

      it('should use defaults', () => {
        const { value } = paginationSchema.validate({});

        expect(value.page).toBe(1);
        expect(value.limit).toBe(20);
        expect(value.sortOrder).toBe('desc');
      });

      it('should reject page less than 1', () => {
        const { error } = paginationSchema.validate({ page: 0 });
        expect(error).toBeDefined();
      });

      it('should reject limit greater than 100', () => {
        const { error } = paginationSchema.validate({ limit: 101 });
        expect(error).toBeDefined();
      });

      it('should reject invalid sortOrder', () => {
        const { error } = paginationSchema.validate({ sortOrder: 'invalid' });
        expect(error).toBeDefined();
      });

      it('should reject unknown fields', () => {
        const { error } = paginationSchema.validate({ unknown: 'field' });
        expect(error).toBeDefined();
      });
    });

    describe('dateRangeSchema', () => {
      it('should accept valid date range', () => {
        const { error } = dateRangeSchema.validate({
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
        });
        expect(error).toBeUndefined();
      });

      it('should reject endDate before startDate', () => {
        const { error } = dateRangeSchema.validate({
          startDate: '2024-01-31T00:00:00Z',
          endDate: '2024-01-01T00:00:00Z',
        });
        expect(error).toBeDefined();
      });

      it('should accept empty object', () => {
        const { error } = dateRangeSchema.validate({});
        expect(error).toBeUndefined();
      });
    });
  });

  describe('ID Params', () => {
    describe('idParamSchema', () => {
      it('should accept valid id', () => {
        const { error } = idParamSchema.validate({
          id: '123e4567-e89b-42d3-a456-556642440000',
        });
        expect(error).toBeUndefined();
      });

      it('should reject missing id', () => {
        const { error } = idParamSchema.validate({});
        expect(error).toBeDefined();
      });

      it('should reject unknown fields', () => {
        const { error } = idParamSchema.validate({
          id: '123e4567-e89b-42d3-a456-556642440000',
          extra: 'field',
        });
        expect(error).toBeDefined();
      });
    });

    describe('providerParamSchema', () => {
      it('should accept valid providers', () => {
        const validProviders = ['stripe', 'square', 'ticketmaster', 'eventbrite', 'mailchimp', 'quickbooks'];

        validProviders.forEach((provider) => {
          const { error } = providerParamSchema.validate({ provider });
          expect(error).toBeUndefined();
        });
      });

      it('should reject invalid provider', () => {
        const { error } = providerParamSchema.validate({ provider: 'invalid' });
        expect(error).toBeDefined();
      });
    });

    describe('integrationParamSchema', () => {
      it('should accept valid integrationId', () => {
        const { error } = integrationParamSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Integration Schemas', () => {
    describe('createIntegrationSchema', () => {
      it('should accept valid integration', () => {
        const { error, value } = createIntegrationSchema.validate({
          provider: 'stripe',
          name: 'My Stripe Integration',
          description: 'Payment processing',
        });

        expect(error).toBeUndefined();
        expect(value.provider).toBe('stripe');
        expect(value.config).toEqual({});
      });

      it('should reject name too short', () => {
        const { error } = createIntegrationSchema.validate({
          provider: 'stripe',
          name: 'AB',
        });
        expect(error).toBeDefined();
        expect(error!.message).toContain('3 characters');
      });

      it('should reject name too long', () => {
        const { error } = createIntegrationSchema.validate({
          provider: 'stripe',
          name: 'A'.repeat(101),
        });
        expect(error).toBeDefined();
      });

      it('should reject invalid provider', () => {
        const { error } = createIntegrationSchema.validate({
          provider: 'invalid',
          name: 'Test Integration',
        });
        expect(error).toBeDefined();
        expect(error!.message).toContain('Provider must be one of');
      });

      it('should reject unknown fields', () => {
        const { error } = createIntegrationSchema.validate({
          provider: 'stripe',
          name: 'Test',
          unknown: 'field',
        });
        expect(error).toBeDefined();
      });
    });

    describe('updateIntegrationSchema', () => {
      it('should accept partial update', () => {
        const { error } = updateIntegrationSchema.validate({
          name: 'Updated Name',
        });
        expect(error).toBeUndefined();
      });

      it('should accept enabled toggle', () => {
        const { error } = updateIntegrationSchema.validate({
          enabled: false,
        });
        expect(error).toBeUndefined();
      });

      it('should accept empty object', () => {
        const { error } = updateIntegrationSchema.validate({});
        expect(error).toBeUndefined();
      });
    });
  });

  describe('OAuth Schemas', () => {
    describe('oauthAuthorizeSchema', () => {
      it('should accept valid authorize request', () => {
        const { error } = oauthAuthorizeSchema.validate({
          provider: 'stripe',
          returnUrl: 'https://example.com/callback',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid URL scheme', () => {
        const { error } = oauthAuthorizeSchema.validate({
          provider: 'stripe',
          returnUrl: 'ftp://example.com/callback',
        });
        expect(error).toBeDefined();
        expect(error!.message).toContain('http');
      });

      it('should accept optional state', () => {
        const { error } = oauthAuthorizeSchema.validate({
          provider: 'stripe',
          returnUrl: 'https://example.com/callback',
          state: 'custom-state-123',
        });
        expect(error).toBeUndefined();
      });
    });

    describe('oauthCallbackSchema', () => {
      it('should accept valid callback', () => {
        const { error } = oauthCallbackSchema.validate({
          code: 'auth-code-123',
          state: 'state-token',
        });
        expect(error).toBeUndefined();
      });

      it('should accept error response', () => {
        const { error } = oauthCallbackSchema.validate({
          code: 'code',
          state: 'state',
          error: 'access_denied',
          error_description: 'User denied access',
        });
        expect(error).toBeUndefined();
      });

      it('should reject missing code', () => {
        const { error } = oauthCallbackSchema.validate({
          state: 'state-token',
        });
        expect(error).toBeDefined();
      });
    });

    describe('oauthRefreshSchema', () => {
      it('should accept valid integrationId', () => {
        const { error } = oauthRefreshSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Webhook Schemas', () => {
    describe('registerWebhookSchema', () => {
      it('should accept valid webhook registration', () => {
        const { error } = registerWebhookSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          events: ['payment.created', 'payment.updated'],
          callbackUrl: 'https://example.com/webhook',
        });
        expect(error).toBeUndefined();
      });

      it('should reject HTTP callback URL', () => {
        const { error } = registerWebhookSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          events: ['event'],
          callbackUrl: 'http://example.com/webhook',
        });
        expect(error).toBeDefined();
        expect(error!.message).toContain('https');
      });

      it('should reject empty events array', () => {
        const { error } = registerWebhookSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          events: [],
          callbackUrl: 'https://example.com/webhook',
        });
        expect(error).toBeDefined();
      });

      it('should reject more than 50 events', () => {
        const { error } = registerWebhookSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          events: Array(51).fill('event'),
          callbackUrl: 'https://example.com/webhook',
        });
        expect(error).toBeDefined();
      });
    });

    describe('webhookEventSchema', () => {
      it('should accept various webhook formats', () => {
        // Stripe format
        const { error: stripeError } = webhookEventSchema.validate({
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          created: 1234567890,
          data: { object: {} },
          livemode: false,
        });
        expect(stripeError).toBeUndefined();

        // Square format
        const { error: squareError } = webhookEventSchema.validate({
          event: 'payment.completed',
          data: { id: 'pay_123' },
        });
        expect(squareError).toBeUndefined();
      });

      it('should allow unknown fields for provider flexibility', () => {
        const { error } = webhookEventSchema.validate({
          type: 'event',
          custom_field: 'value',
          nested: { data: 'here' },
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Field Mapping Schemas', () => {
    describe('createFieldMappingSchema', () => {
      it('should accept valid field mapping', () => {
        const { error, value } = createFieldMappingSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          sourceField: 'customer.email',
          targetField: 'email_address',
          transformer: 'string',
        });

        expect(error).toBeUndefined();
        expect(value.required).toBe(false);
      });

      it('should use defaults', () => {
        const { value } = createFieldMappingSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          sourceField: 'field1',
          targetField: 'field2',
        });

        expect(value.transformer).toBe('none');
        expect(value.transformerConfig).toEqual({});
        expect(value.required).toBe(false);
      });

      it('should reject invalid transformer', () => {
        const { error } = createFieldMappingSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          sourceField: 'field1',
          targetField: 'field2',
          transformer: 'invalid',
        });
        expect(error).toBeDefined();
      });
    });

    describe('updateFieldMappingSchema', () => {
      it('should accept partial update', () => {
        const { error } = updateFieldMappingSchema.validate({
          enabled: false,
        });
        expect(error).toBeUndefined();
      });

      it('should accept defaultValue of any type', () => {
        const testCases = [
          { defaultValue: 'string' },
          { defaultValue: 123 },
          { defaultValue: true },
          { defaultValue: null },
          { defaultValue: { nested: 'object' } },
        ];

        testCases.forEach(({ defaultValue }) => {
          const { error } = updateFieldMappingSchema.validate({ defaultValue });
          expect(error).toBeUndefined();
        });
      });
    });
  });

  describe('Sync Schemas', () => {
    describe('startSyncSchema', () => {
      it('should accept valid sync request', () => {
        const { error, value } = startSyncSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          syncType: 'full',
          options: {
            batchSize: 500,
            dryRun: true,
          },
        });

        expect(error).toBeUndefined();
        expect(value.options.batchSize).toBe(500);
      });

      it('should use defaults', () => {
        const { value } = startSyncSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
        });

        expect(value.syncType).toBe('incremental');
        expect(value.options).toEqual({});
      });

      it('should reject invalid syncType', () => {
        const { error } = startSyncSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          syncType: 'invalid',
        });
        expect(error).toBeDefined();
      });

      it('should reject batchSize out of range', () => {
        const { error: tooSmall } = startSyncSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          options: { batchSize: 0 },
        });
        expect(tooSmall).toBeDefined();

        const { error: tooLarge } = startSyncSchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          options: { batchSize: 1001 },
        });
        expect(tooLarge).toBeDefined();
      });
    });

    describe('syncStatusSchema', () => {
      it('should accept valid syncId', () => {
        const { error } = syncStatusSchema.validate({
          syncId: '123e4567-e89b-42d3-a456-556642440000',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Provider Config Schemas', () => {
    describe('stripeConfigSchema', () => {
      it('should accept valid config', () => {
        const { error } = stripeConfigSchema.validate({
          webhookEndpoint: 'https://example.com/webhook',
          paymentMethods: ['card', 'ach_debit'],
          currency: 'USD',
          statementDescriptor: 'My Company',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid payment method', () => {
        const { error } = stripeConfigSchema.validate({
          paymentMethods: ['invalid_method'],
        });
        expect(error).toBeDefined();
      });

      it('should reject statement descriptor over 22 chars', () => {
        const { error } = stripeConfigSchema.validate({
          statementDescriptor: 'A'.repeat(23),
        });
        expect(error).toBeDefined();
      });
    });

    describe('squareConfigSchema', () => {
      it('should accept valid config', () => {
        const { error } = squareConfigSchema.validate({
          locationId: 'loc_123',
          environment: 'sandbox',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid environment', () => {
        const { error } = squareConfigSchema.validate({
          environment: 'test',
        });
        expect(error).toBeDefined();
      });
    });

    describe('ticketmasterConfigSchema', () => {
      it('should accept valid config', () => {
        const { error } = ticketmasterConfigSchema.validate({
          venueId: 'venue_123',
          eventFilters: {
            genres: ['rock', 'pop'],
            startDate: '2024-01-01T00:00:00Z',
          },
        });
        expect(error).toBeUndefined();
      });
    });

    describe('eventbriteConfigSchema', () => {
      it('should accept valid config', () => {
        const { error } = eventbriteConfigSchema.validate({
          organizationId: 'org_123',
          webhookSecret: 'secret_key',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Query Schemas', () => {
    describe('listIntegrationsQuerySchema', () => {
      it('should accept valid query', () => {
        const { error, value } = listIntegrationsQuerySchema.validate({
          provider: 'stripe',
          enabled: true,
          page: 2,
          limit: 50,
        });

        expect(error).toBeUndefined();
        expect(value.provider).toBe('stripe');
      });

      it('should use defaults', () => {
        const { value } = listIntegrationsQuerySchema.validate({});

        expect(value.page).toBe(1);
        expect(value.limit).toBe(20);
      });
    });

    describe('listWebhooksQuerySchema', () => {
      it('should accept valid query', () => {
        const { error } = listWebhooksQuerySchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          status: 'active',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid status', () => {
        const { error } = listWebhooksQuerySchema.validate({
          status: 'invalid',
        });
        expect(error).toBeDefined();
      });
    });

    describe('listSyncHistoryQuerySchema', () => {
      it('should accept valid query', () => {
        const { error } = listSyncHistoryQuerySchema.validate({
          integrationId: '123e4567-e89b-42d3-a456-556642440000',
          status: 'completed',
          syncType: 'full',
          startDate: '2024-01-01T00:00:00Z',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Validation Helpers', () => {
    describe('validate', () => {
      it('should validate with strict options', () => {
        const schema = Joi.object({ name: Joi.string().required() }).unknown(false);
        const { error } = validate(schema, { name: 'test', extra: 'field' });

        expect(error).toBeDefined();
      });

      it('should return all errors', () => {
        const schema = Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required(),
        });

        const { error } = validate(schema, {});

        expect(error).toBeDefined();
        expect(error!.details.length).toBe(2);
      });
    });

    describe('strict', () => {
      it('should create strict schema', () => {
        const baseSchema = Joi.object({ name: Joi.string() });
        const strictSchema = strict(baseSchema);

        expect(strictSchema).toBeDefined();
      });
    });

    describe('toFastifySchema', () => {
      it('should convert to Fastify format', () => {
        const result = toFastifySchema({
          params: idParamSchema,
          body: createIntegrationSchema,
        });

        expect(result).toHaveProperty('params');
        expect(result).toHaveProperty('body');
        expect(result).toHaveProperty('querystring');
        expect(result).toHaveProperty('headers');
      });
    });
  });
});
