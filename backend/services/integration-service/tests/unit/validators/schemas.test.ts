import {
  queueSyncSchema,
  getSyncHistorySchema,
  retrySyncSchema,
  cancelSyncSchema,
  initiateOAuthSchema,
  oauthCallbackParamsSchema,
  oauthCallbackQuerySchema,
  refreshTokenSchema,
  createConnectionSchema,
  updateConnectionSchema,
  deleteConnectionSchema,
  getConnectionSchema,
  createMappingSchema,
  updateMappingSchema,
  deleteMappingSchema,
  getMappingSchema,
  webhookParamsSchema,
  getIntegrationStatusSchema,
  testConnectionSchema,
  rotateCredentialsSchema,
  paginationSchema,
} from '../../../src/validators/schemas';

describe('Validator Schemas', () => {
  const validUuid = '123e4567-e89b-42d3-a456-556642440000';

  describe('Sync Schemas', () => {
    describe('queueSyncSchema', () => {
      it('should accept valid sync request', () => {
        const { error } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          syncType: 'full',
          direction: 'inbound',
        });
        expect(error).toBeUndefined();
      });

      it('should accept optional fields', () => {
        const { error } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'square',
          syncType: 'incremental',
          direction: 'outbound',
          priority: 'high',
          scheduledFor: new Date(),
          metadata: { key: 'value' },
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid provider', () => {
        const { error } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'invalid',
          syncType: 'full',
          direction: 'inbound',
        });
        expect(error).toBeDefined();
      });

      it('should reject invalid direction', () => {
        const { error } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          syncType: 'full',
          direction: 'invalid',
        });
        expect(error).toBeDefined();
      });

      it('should reject invalid priority', () => {
        const { error } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          syncType: 'full',
          direction: 'inbound',
          priority: 'invalid',
        });
        expect(error).toBeDefined();
      });

      it('should validate syncType length', () => {
        const { error: tooShort } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          syncType: '',
          direction: 'inbound',
        });
        expect(tooShort).toBeDefined();

        const { error: tooLong } = queueSyncSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          syncType: 'a'.repeat(101),
          direction: 'inbound',
        });
        expect(tooLong).toBeDefined();
      });
    });

    describe('getSyncHistorySchema', () => {
      it('should accept valid request', () => {
        const { error } = getSyncHistorySchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          limit: 50,
        });
        expect(error).toBeUndefined();
      });

      it('should accept venueId only', () => {
        const { error } = getSyncHistorySchema.validate({
          venueId: validUuid,
        });
        expect(error).toBeUndefined();
      });

      it('should reject limit out of range', () => {
        const { error: tooSmall } = getSyncHistorySchema.validate({
          venueId: validUuid,
          limit: 0,
        });
        expect(tooSmall).toBeDefined();

        const { error: tooLarge } = getSyncHistorySchema.validate({
          venueId: validUuid,
          limit: 101,
        });
        expect(tooLarge).toBeDefined();
      });
    });

    describe('retrySyncSchema', () => {
      it('should accept valid jobId', () => {
        const { error } = retrySyncSchema.validate({ jobId: validUuid });
        expect(error).toBeUndefined();
      });

      it('should reject invalid jobId', () => {
        const { error } = retrySyncSchema.validate({ jobId: 'invalid' });
        expect(error).toBeDefined();
      });
    });

    describe('cancelSyncSchema', () => {
      it('should accept valid jobId', () => {
        const { error } = cancelSyncSchema.validate({ jobId: validUuid });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('OAuth Schemas', () => {
    describe('initiateOAuthSchema', () => {
      it('should accept valid request', () => {
        const { error } = initiateOAuthSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          userId: validUuid,
        });
        expect(error).toBeUndefined();
      });

      it('should reject missing fields', () => {
        const { error } = initiateOAuthSchema.validate({
          venueId: validUuid,
        });
        expect(error).toBeDefined();
      });
    });

    describe('oauthCallbackParamsSchema', () => {
      it('should accept valid provider', () => {
        const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

        providers.forEach((provider) => {
          const { error } = oauthCallbackParamsSchema.validate({ provider });
          expect(error).toBeUndefined();
        });
      });
    });

    describe('oauthCallbackQuerySchema', () => {
      it('should accept valid callback', () => {
        const { error } = oauthCallbackQuerySchema.validate({
          code: 'auth_code_123',
          state: 'state_token',
        });
        expect(error).toBeUndefined();
      });

      it('should accept error parameters', () => {
        const { error } = oauthCallbackQuerySchema.validate({
          code: 'code',
          state: 'state',
          error: 'access_denied',
          error_description: 'User denied',
        });
        expect(error).toBeUndefined();
      });

      it('should reject empty code', () => {
        const { error } = oauthCallbackQuerySchema.validate({
          code: '',
          state: 'state',
        });
        expect(error).toBeDefined();
      });
    });

    describe('refreshTokenSchema', () => {
      it('should accept valid request', () => {
        const { error } = refreshTokenSchema.validate({
          venueId: validUuid,
          provider: 'stripe',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Connection Schemas', () => {
    describe('createConnectionSchema', () => {
      it('should accept valid connection', () => {
        const { error } = createConnectionSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          config: {
            syncEnabled: true,
            syncInterval: 3600,
          },
        });
        expect(error).toBeUndefined();
      });

      it('should accept credentials', () => {
        const { error } = createConnectionSchema.validate({
          venueId: validUuid,
          integrationType: 'mailchimp',
          credentials: {
            apiKey: 'key-123',
            apiSecret: 'secret-456',
          },
        });
        expect(error).toBeUndefined();
      });

      it('should validate syncInterval range', () => {
        const { error: tooSmall } = createConnectionSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          config: { syncInterval: 30 },
        });
        expect(tooSmall).toBeDefined();

        const { error: tooLarge } = createConnectionSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          config: { syncInterval: 100000 },
        });
        expect(tooLarge).toBeDefined();
      });
    });

    describe('updateConnectionSchema', () => {
      it('should accept valid update', () => {
        const { error } = updateConnectionSchema.validate({
          connectionId: validUuid,
          config: { syncEnabled: false },
          status: 'disconnected',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid status', () => {
        const { error } = updateConnectionSchema.validate({
          connectionId: validUuid,
          status: 'invalid',
        });
        expect(error).toBeDefined();
      });
    });

    describe('deleteConnectionSchema', () => {
      it('should accept valid connectionId', () => {
        const { error } = deleteConnectionSchema.validate({
          connectionId: validUuid,
        });
        expect(error).toBeUndefined();
      });
    });

    describe('getConnectionSchema', () => {
      it('should accept venueId only', () => {
        const { error } = getConnectionSchema.validate({
          venueId: validUuid,
        });
        expect(error).toBeUndefined();
      });

      it('should accept with integrationType', () => {
        const { error } = getConnectionSchema.validate({
          venueId: validUuid,
          integrationType: 'square',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Mapping Schemas', () => {
    describe('createMappingSchema', () => {
      it('should accept valid mapping', () => {
        const { error } = createMappingSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          entityType: 'customer',
          direction: 'inbound',
          fieldMappings: [
            { sourceField: 'email', targetField: 'email_address' },
          ],
        });
        expect(error).toBeUndefined();
      });

      it('should accept transformations', () => {
        const { error } = createMappingSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          entityType: 'customer',
          direction: 'outbound',
          fieldMappings: [
            {
              sourceField: 'phone',
              targetField: 'phone_number',
              transformation: 'format_phone',
              defaultValue: 'N/A',
              required: true,
            },
          ],
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid entityType', () => {
        const { error } = createMappingSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          entityType: 'invalid',
          direction: 'inbound',
          fieldMappings: [{ sourceField: 'a', targetField: 'b' }],
        });
        expect(error).toBeDefined();
      });

      it('should reject empty fieldMappings', () => {
        const { error } = createMappingSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          entityType: 'customer',
          direction: 'inbound',
          fieldMappings: [],
        });
        expect(error).toBeDefined();
      });

      it('should reject invalid transformation', () => {
        const { error } = createMappingSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          entityType: 'customer',
          direction: 'inbound',
          fieldMappings: [
            { sourceField: 'a', targetField: 'b', transformation: 'invalid' },
          ],
        });
        expect(error).toBeDefined();
      });

      it('should validate all entity types', () => {
        const entityTypes = ['customer', 'product', 'order', 'invoice', 'payment', 'contact'];

        entityTypes.forEach((entityType) => {
          const { error } = createMappingSchema.validate({
            venueId: validUuid,
            integrationType: 'stripe',
            entityType,
            direction: 'bidirectional',
            fieldMappings: [{ sourceField: 'a', targetField: 'b' }],
          });
          expect(error).toBeUndefined();
        });
      });
    });

    describe('updateMappingSchema', () => {
      it('should accept valid update', () => {
        const { error } = updateMappingSchema.validate({
          mappingId: validUuid,
          isActive: false,
        });
        expect(error).toBeUndefined();
      });

      it('should accept fieldMappings update', () => {
        const { error } = updateMappingSchema.validate({
          mappingId: validUuid,
          fieldMappings: [
            { sourceField: 'new_field', targetField: 'new_target' },
          ],
        });
        expect(error).toBeUndefined();
      });
    });

    describe('deleteMappingSchema', () => {
      it('should accept valid mappingId', () => {
        const { error } = deleteMappingSchema.validate({
          mappingId: validUuid,
        });
        expect(error).toBeUndefined();
      });
    });

    describe('getMappingSchema', () => {
      it('should accept venueId only', () => {
        const { error } = getMappingSchema.validate({
          venueId: validUuid,
        });
        expect(error).toBeUndefined();
      });

      it('should accept all filters', () => {
        const { error } = getMappingSchema.validate({
          venueId: validUuid,
          integrationType: 'stripe',
          entityType: 'customer',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Webhook Schema', () => {
    describe('webhookParamsSchema', () => {
      it('should accept valid params', () => {
        const { error } = webhookParamsSchema.validate({
          provider: 'stripe',
          venueId: validUuid,
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Admin Schemas', () => {
    describe('getIntegrationStatusSchema', () => {
      it('should accept venueId only', () => {
        const { error } = getIntegrationStatusSchema.validate({
          venueId: validUuid,
        });
        expect(error).toBeUndefined();
      });

      it('should accept with integrationType', () => {
        const { error } = getIntegrationStatusSchema.validate({
          venueId: validUuid,
          integrationType: 'square',
        });
        expect(error).toBeUndefined();
      });
    });

    describe('testConnectionSchema', () => {
      it('should accept valid request', () => {
        const { error } = testConnectionSchema.validate({
          venueId: validUuid,
          integrationType: 'mailchimp',
        });
        expect(error).toBeUndefined();
      });
    });

    describe('rotateCredentialsSchema', () => {
      it('should accept valid request', () => {
        const { error } = rotateCredentialsSchema.validate({
          venueId: validUuid,
          integrationType: 'quickbooks',
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Pagination Schema', () => {
    describe('paginationSchema', () => {
      it('should use defaults', () => {
        const { value } = paginationSchema.validate({});

        expect(value.page).toBe(1);
        expect(value.limit).toBe(20);
        expect(value.sortOrder).toBe('desc');
      });

      it('should accept valid pagination', () => {
        const { error, value } = paginationSchema.validate({
          page: 5,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'asc',
        });

        expect(error).toBeUndefined();
        expect(value.page).toBe(5);
        expect(value.limit).toBe(50);
        expect(value.sortBy).toBe('createdAt');
        expect(value.sortOrder).toBe('asc');
      });

      it('should reject invalid sortOrder', () => {
        const { error } = paginationSchema.validate({
          sortOrder: 'invalid',
        });
        expect(error).toBeDefined();
      });

      it('should reject page less than 1', () => {
        const { error } = paginationSchema.validate({ page: 0 });
        expect(error).toBeDefined();
      });

      it('should reject limit greater than 100', () => {
        const { error } = paginationSchema.validate({ limit: 101 });
        expect(error).toBeDefined();
      });
    });
  });
});
