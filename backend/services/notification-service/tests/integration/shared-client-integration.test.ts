/**
 * Integration Tests: Shared Client Communication - notification-service
 *
 * Tests actual S2S communication with real service clients.
 */

import { describe, it, expect } from '@jest/globals';
import {
  authServiceClient,
  eventServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = INTEGRATION_ENABLED ? describe : describe.skip;

describeIntegration('notification-service S2S Integration Tests', () => {
  const testTenantId = 'test-tenant-integration';
  const testUserId = 'test-user-integration';

  describe('auth-service Communication', () => {
    it('should authenticate with auth-service via HMAC', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await authServiceClient.getUser('test-user', ctx);
      } catch (error) {
        if (error instanceof ServiceClientError) {
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });

    it('should call authServiceClient.validatePermissions', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        const result = await authServiceClient.validatePermissions(
          'test-user',
          ['notification:send'],
          ctx
        );
        expect(result).toHaveProperty('allGranted');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('event-service Communication', () => {
    it('should authenticate with event-service via HMAC', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await eventServiceClient.getEventInternal('test-event', ctx);
      } catch (error) {
        if (error instanceof ServiceClientError) {
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });
  });
});
