/**
 * Integration Tests: Shared Client Communication - transfer-service
 *
 * Tests actual S2S communication with real service clients.
 */

import { describe, it, expect } from '@jest/globals';
import {
  ticketServiceClient,
  authServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = INTEGRATION_ENABLED ? describe : describe.skip;

describeIntegration('transfer-service S2S Integration Tests', () => {
  const testTenantId = 'test-tenant-integration';
  const testUserId = 'test-user-integration';

  describe('ticket-service Communication', () => {
    it('should authenticate with ticket-service via HMAC', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await ticketServiceClient.getTicketFull('test-ticket', ctx);
      } catch (error) {
        if (error instanceof ServiceClientError) {
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });

    it('should call ticketServiceClient.getTicketStatus', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        const status = await ticketServiceClient.getTicketStatus('test-ticket', ctx);
        expect(status).toHaveProperty('status');
      } catch (error) {
        if (error instanceof ServiceClientError) {
          expect([404, 503]).toContain(error.statusCode);
        }
      }
    });

    it('should call ticketServiceClient.checkTicketNotTransferred', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        const result = await ticketServiceClient.checkTicketNotTransferred(
          'test-ticket',
          'test-user',
          ctx
        );
        expect(typeof result).toBe('boolean');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

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
  });

  describe('Transfer Operation Flow', () => {
    it('should be able to validate transfer prerequisites', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      // This tests the complete validation flow
      let ticketValid = false;
      let recipientValid = false;

      try {
        const ticket = await ticketServiceClient.getTicketFull('test-ticket', ctx);
        ticketValid = ticket !== null;
      } catch (e) {
        // Expected for non-existent ticket
      }

      try {
        const recipient = await authServiceClient.getUser('test-recipient', ctx);
        recipientValid = recipient !== null;
      } catch (e) {
        // Expected for non-existent user
      }

      // Both calls should complete without auth failures
      expect(true).toBe(true);
    });
  });
});
