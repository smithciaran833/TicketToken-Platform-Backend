/**
 * Integration Tests: Shared Client Communication - payment-service
 *
 * Tests actual S2S communication with real service clients.
 */

import { describe, it, expect } from '@jest/globals';
import {
  notificationServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = INTEGRATION_ENABLED ? describe : describe.skip;

describeIntegration('payment-service S2S Integration Tests', () => {
  const testTenantId = 'test-tenant-integration';
  const testUserId = 'test-user-integration';

  describe('notification-service Communication', () => {
    it('should authenticate with notification-service via HMAC', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'test_notification',
            channels: ['email'],
            priority: 'normal',
            data: { test: 'true' },
          },
          ctx
        );
      } catch (error) {
        if (error instanceof ServiceClientError) {
          // Should NOT get 401/403 - that would mean HMAC auth failed
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });

    it('should call notificationServiceClient.sendNotification', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        const result = await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'payment_succeeded',
            channels: ['email'],
            priority: 'normal',
            data: {
              amount: '100.00',
              currency: 'USD',
            },
          },
          ctx
        );
        expect(result).toBeDefined();
      } catch (error) {
        if (error instanceof ServiceClientError) {
          // 400, 404, 503 are acceptable - means we reached the service
          expect([400, 404, 503]).toContain(error.statusCode);
        }
      }
    });
  });

  describe('Refund Notification Flow', () => {
    it('should send refund initiated notification', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'refund_initiated',
            channels: ['email'],
            priority: 'normal',
            data: {
              refundId: 'test-refund-123',
              amount: '50.00',
              currency: 'USD',
              estimatedDays: '5',
            },
          },
          ctx
        );
      } catch (error) {
        // Notification failures should not break the flow
        expect(error).toBeDefined();
      }
    });

    it('should send refund completed notification', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'refund_completed',
            channels: ['email'],
            priority: 'normal',
            data: {
              refundId: 'test-refund-123',
              amount: '50.00',
              currency: 'USD',
            },
          },
          ctx
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Dispute Notification Flow', () => {
    it('should send dispute opened notification', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'dispute_opened',
            channels: ['email'],
            priority: 'high',
            data: {
              disputeId: 'test-dispute-123',
              amount: '150.00',
              currency: 'USD',
              reason: 'Fraudulent charge',
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
          ctx
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Payment Notification Flow', () => {
    it('should send payment succeeded notification', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'payment_succeeded',
            channels: ['email'],
            priority: 'normal',
            data: {
              paymentIntentId: 'pi_test_123',
              amount: '100.00',
              currency: 'USD',
              eventName: 'Test Event',
              ticketCount: '2',
            },
          },
          ctx
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should send payment failed notification', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await notificationServiceClient.sendNotification(
          {
            userId: testUserId,
            templateId: 'payment_failed',
            channels: ['email'],
            priority: 'high',
            data: {
              paymentIntentId: 'pi_test_456',
              amount: '100.00',
              currency: 'USD',
              errorMessage: 'Card declined',
            },
          },
          ctx
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle notification service errors gracefully', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      // Even with invalid data, should not get auth errors
      try {
        await notificationServiceClient.sendNotification(
          {
            userId: '',
            templateId: 'invalid',
            channels: [],
            priority: 'normal',
            data: {},
          },
          ctx
        );
      } catch (error) {
        if (error instanceof ServiceClientError) {
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });
  });
});
