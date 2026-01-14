/**
 * Unit tests for src/schemas/integration.schema.ts
 * Tests provider-specific credential validation (SD6, RD7) and schema security
 */

import {
  createIntegrationSchema,
  updateIntegrationSchema,
  credentialSchemaMap,
} from '../../../src/schemas/integration.schema';

describe('schemas/integration.schema', () => {
  describe('createIntegrationSchema', () => {
    describe('provider field validation', () => {
      it('should accept "provider" field', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: { apiKey: 'pk_test_xxx', secretKey: 'sk_test_xxx' },
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept "type" field as alternative to provider', () => {
        const result = createIntegrationSchema.body.validate({
          type: 'stripe',
          credentials: { apiKey: 'pk_test_xxx', secretKey: 'sk_test_xxx' },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject when neither provider nor type is present', () => {
        const result = createIntegrationSchema.body.validate({
          credentials: { apiKey: 'test' },
        });
        expect(result.error).toBeDefined();
      });

      it('should accept valid provider values', () => {
        const providers = ['stripe', 'square', 'toast', 'mailchimp', 'twilio'];
        
        for (const provider of providers) {
          const credentials = getValidCredentialsForProvider(provider);
          const result = createIntegrationSchema.body.validate({
            provider,
            credentials,
          });
          expect(result.error).toBeUndefined();
        }
      });

      it('should reject invalid provider values', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'invalid-provider',
          credentials: { apiKey: 'test' },
        });
        expect(result.error).toBeDefined();
      });
    });

    describe('Stripe credentials (SD6)', () => {
      it('should validate valid Stripe credentials', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {
            apiKey: 'pk_test_xxx',
            secretKey: 'sk_test_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept optional Stripe fields', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {
            apiKey: 'pk_test_xxx',
            secretKey: 'sk_test_xxx',
            webhookSecret: 'whsec_xxx',
            accountId: 'acct_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject missing required Stripe apiKey', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {
            secretKey: 'sk_test_xxx',
          },
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('apiKey');
      });

      it('should reject missing required Stripe secretKey', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {
            apiKey: 'pk_test_xxx',
          },
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('secretKey');
      });

      it('should strip unknown Stripe credential fields', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {
            apiKey: 'pk_test_xxx',
            secretKey: 'sk_test_xxx',
            unknownField: 'malicious',
          },
        });
        expect(result.error).toBeUndefined();
        expect(result.value.credentials.unknownField).toBeUndefined();
      });
    });

    describe('Square credentials (SD6)', () => {
      it('should validate valid Square credentials', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'square',
          credentials: {
            accessToken: 'sq_xxx',
            applicationId: 'app_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept optional Square fields', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'square',
          credentials: {
            accessToken: 'sq_xxx',
            applicationId: 'app_xxx',
            locationId: 'loc_xxx',
            environment: 'sandbox',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject invalid Square environment', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'square',
          credentials: {
            accessToken: 'sq_xxx',
            applicationId: 'app_xxx',
            environment: 'invalid',
          },
        });
        expect(result.error).toBeDefined();
      });

      it('should accept "production" environment', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'square',
          credentials: {
            accessToken: 'sq_xxx',
            applicationId: 'app_xxx',
            environment: 'production',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject missing required Square accessToken', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'square',
          credentials: {
            applicationId: 'app_xxx',
          },
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('accessToken');
      });
    });

    describe('Toast credentials (SD6)', () => {
      it('should validate valid Toast credentials', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'toast',
          credentials: {
            clientId: 'client_xxx',
            clientSecret: 'secret_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept optional restaurantGuid', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'toast',
          credentials: {
            clientId: 'client_xxx',
            clientSecret: 'secret_xxx',
            restaurantGuid: 'guid_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject missing required Toast clientId', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'toast',
          credentials: {
            clientSecret: 'secret_xxx',
          },
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('clientId');
      });
    });

    describe('Mailchimp credentials (SD6)', () => {
      it('should validate valid Mailchimp credentials', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'mailchimp',
          credentials: {
            apiKey: 'key-us1',
            serverPrefix: 'us1',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept optional listId', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'mailchimp',
          credentials: {
            apiKey: 'key-us1',
            serverPrefix: 'us1',
            listId: 'list_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject missing required Mailchimp serverPrefix', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'mailchimp',
          credentials: {
            apiKey: 'key-us1',
          },
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('serverPrefix');
      });
    });

    describe('Twilio credentials (SD6)', () => {
      it('should validate valid Twilio credentials', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'twilio',
          credentials: {
            accountSid: 'AC_xxx',
            authToken: 'token_xxx',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept optional phoneNumber', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'twilio',
          credentials: {
            accountSid: 'AC_xxx',
            authToken: 'token_xxx',
            phoneNumber: '+1234567890',
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject missing required Twilio accountSid', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'twilio',
          credentials: {
            authToken: 'token_xxx',
          },
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('accountSid');
      });
    });

    describe('config field validation', () => {
      it('should accept valid config object', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
          config: {
            webhookUrl: 'https://example.com/webhook',
            apiVersion: '2023-01-01',
            environment: 'sandbox',
            enabled: true,
          },
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject invalid webhookUrl', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
          config: {
            webhookUrl: 'not-a-url',
          },
        });
        expect(result.error).toBeDefined();
      });

      it('should reject invalid environment in config', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
          config: {
            environment: 'development', // Only sandbox or production allowed
          },
        });
        expect(result.error).toBeDefined();
      });

      it('should limit apiVersion length to 50 chars', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
          config: {
            apiVersion: 'a'.repeat(51),
          },
        });
        expect(result.error).toBeDefined();
      });

      describe('features array (RD7: array size limits)', () => {
        it('should accept features array with up to 20 items', () => {
          const features = Array.from({ length: 20 }, (_, i) => `feature_${i}`);
          const result = createIntegrationSchema.body.validate({
            provider: 'stripe',
            credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
            config: { features },
          });
          expect(result.error).toBeUndefined();
        });

        it('should reject features array with more than 20 items', () => {
          const features = Array.from({ length: 21 }, (_, i) => `feature_${i}`);
          const result = createIntegrationSchema.body.validate({
            provider: 'stripe',
            credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
            config: { features },
          });
          expect(result.error).toBeDefined();
        });

        it('should limit individual feature string length to 100 chars', () => {
          const result = createIntegrationSchema.body.validate({
            provider: 'stripe',
            credentials: { apiKey: 'pk_test', secretKey: 'sk_test' },
            config: {
              features: ['a'.repeat(101)],
            },
          });
          expect(result.error).toBeDefined();
        });
      });
    });

    describe('security tests', () => {
      it('should strip unknown fields from credentials', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {
            apiKey: 'pk_test',
            secretKey: 'sk_test',
            maliciousField: 'attack',
            sensitiveData: 'leaked',
          },
        });
        expect(result.error).toBeUndefined();
        // Unknown fields should be stripped
        expect(result.value.credentials.maliciousField).toBeUndefined();
        expect(result.value.credentials.sensitiveData).toBeUndefined();
        // Required fields should remain
        expect(result.value.credentials.apiKey).toBe('pk_test');
        expect(result.value.credentials.secretKey).toBe('sk_test');
      });

      it('should reject empty credentials object', () => {
        const result = createIntegrationSchema.body.validate({
          provider: 'stripe',
          credentials: {},
        });
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('updateIntegrationSchema', () => {
    it('should accept valid config update', () => {
      const result = updateIntegrationSchema.body.validate({
        config: {
          webhookUrl: 'https://example.com/webhook',
          enabled: true,
        },
      });
      expect(result.error).toBeUndefined();
    });

    it('should accept valid status update', () => {
      const result = updateIntegrationSchema.body.validate({
        status: 'active',
      });
      expect(result.error).toBeUndefined();
    });

    it('should accept "inactive" status', () => {
      const result = updateIntegrationSchema.body.validate({
        status: 'inactive',
      });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid status value', () => {
      const result = updateIntegrationSchema.body.validate({
        status: 'pending',
      });
      expect(result.error).toBeDefined();
    });

    it('should accept credentials update', () => {
      const result = updateIntegrationSchema.body.validate({
        credentials: {
          apiKey: 'new_key',
          secretKey: 'new_secret',
        },
      });
      expect(result.error).toBeUndefined();
    });

    it('should reject empty body', () => {
      const result = updateIntegrationSchema.body.validate({});
      expect(result.error).toBeDefined();
    });

    it('should strip unknown fields', () => {
      const result = updateIntegrationSchema.body.validate({
        status: 'active',
        unknownField: 'value',
      });
      expect(result.error).toBeUndefined();
      expect(result.value.unknownField).toBeUndefined();
    });

    it('should accept multiple valid fields', () => {
      const result = updateIntegrationSchema.body.validate({
        status: 'active',
        config: {
          enabled: true,
        },
        credentials: {
          apiKey: 'updated',
        },
      });
      expect(result.error).toBeUndefined();
    });
  });

  describe('credentialSchemaMap', () => {
    it('should export credential schemas for all supported providers', () => {
      const expectedProviders = ['stripe', 'square', 'toast', 'mailchimp', 'twilio'];
      
      for (const provider of expectedProviders) {
        expect(credentialSchemaMap[provider]).toBeDefined();
      }
    });

    it('should have 5 provider schemas', () => {
      expect(Object.keys(credentialSchemaMap)).toHaveLength(5);
    });

    it('should return undefined for unknown provider', () => {
      expect(credentialSchemaMap['unknown']).toBeUndefined();
    });

    describe('individual schema validation', () => {
      it('should validate Stripe schema directly', () => {
        const result = credentialSchemaMap.stripe.validate({
          apiKey: 'pk_test',
          secretKey: 'sk_test',
        });
        expect(result.error).toBeUndefined();
      });

      it('should validate Square schema directly', () => {
        const result = credentialSchemaMap.square.validate({
          accessToken: 'token',
          applicationId: 'app_id',
        });
        expect(result.error).toBeUndefined();
      });

      it('should validate Toast schema directly', () => {
        const result = credentialSchemaMap.toast.validate({
          clientId: 'client',
          clientSecret: 'secret',
        });
        expect(result.error).toBeUndefined();
      });

      it('should validate Mailchimp schema directly', () => {
        const result = credentialSchemaMap.mailchimp.validate({
          apiKey: 'key',
          serverPrefix: 'us1',
        });
        expect(result.error).toBeUndefined();
      });

      it('should validate Twilio schema directly', () => {
        const result = credentialSchemaMap.twilio.validate({
          accountSid: 'AC_xxx',
          authToken: 'token',
        });
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle null credentials', () => {
      const result = createIntegrationSchema.body.validate({
        provider: 'stripe',
        credentials: null,
      });
      expect(result.error).toBeDefined();
    });

    it('should handle undefined credentials', () => {
      const result = createIntegrationSchema.body.validate({
        provider: 'stripe',
        credentials: undefined,
      });
      expect(result.error).toBeDefined();
    });

    it('should handle both provider and type present (uses provider)', () => {
      const result = createIntegrationSchema.body.validate({
        provider: 'stripe',
        type: 'square',
        credentials: {
          apiKey: 'pk_test',
          secretKey: 'sk_test',
        },
      });
      // Should validate against Stripe (provider takes precedence)
      expect(result.error).toBeUndefined();
    });
  });
});

// Helper function for tests
function getValidCredentialsForProvider(provider: string): Record<string, string> {
  switch (provider) {
    case 'stripe':
      return { apiKey: 'pk_test', secretKey: 'sk_test' };
    case 'square':
      return { accessToken: 'token', applicationId: 'app_id' };
    case 'toast':
      return { clientId: 'client', clientSecret: 'secret' };
    case 'mailchimp':
      return { apiKey: 'key', serverPrefix: 'us1' };
    case 'twilio':
      return { accountSid: 'AC_xxx', authToken: 'token' };
    default:
      return {};
  }
}
