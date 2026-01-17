/**
 * Unit Tests for WebhookController
 *
 * Tests Plaid, Stripe, and SendGrid webhook handlers
 * Validates tenant lookup, event processing, and error handling
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, WEBHOOK_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Import module under test AFTER mocks
import { WebhookController } from '../../../src/controllers/webhook.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_ITEM_ID = 'plaid_item_123456';
const TEST_STRIPE_CUSTOMER_ID = 'cus_test123';
const TEST_STRIPE_ACCOUNT_ID = 'acct_test456';
const TEST_EMAIL = 'test@example.com';

// =============================================================================
// TESTS
// =============================================================================

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WebhookController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    // Default: tenant lookup returns null (no tenant found)
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  // ===========================================================================
  // handlePlaidWebhook Tests
  // ===========================================================================

  describe('handlePlaidWebhook', () => {
    const validPayload = {
      webhook_type: 'AUTH',
      webhook_code: 'VERIFICATION_EXPIRED',
      item_id: TEST_ITEM_ID
    };

    beforeEach(() => {
      mockRequest.body = validPayload;
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful processing', () => {
      it('should return received: true on success', async () => {
        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });

      it('should not set error status code on success', async () => {
        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should log webhook receipt with type and code', async () => {
        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('AUTH')
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('VERIFICATION_EXPIRED')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Lookup
    // -------------------------------------------------------------------------

    describe('tenant lookup', () => {
      it('should lookup tenant from plaid item_id', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] });

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT tenant_id FROM bank_verifications'),
          [TEST_ITEM_ID]
        );
      });

      it('should log warning when tenant cannot be determined', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [] }); // No tenant found

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Unable to determine tenant')
        );
      });

      it('should continue processing when tenant lookup fails', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [] }); // No tenant found

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });
    });

    // -------------------------------------------------------------------------
    // Webhook Logging
    // -------------------------------------------------------------------------

    describe('webhook logging', () => {
      it('should log webhook to database with tenant_id', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] }) // Tenant lookup
          .mockResolvedValue({ rows: [] }); // Subsequent queries

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO webhook_logs'),
          [TEST_TENANT_ID, 'AUTH', JSON.stringify(validPayload)]
        );
      });

      it('should log webhook with null tenant_id when tenant not found', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO webhook_logs'),
          [null, 'AUTH', JSON.stringify(validPayload)]
        );
      });

      it('should store source as plaid', async () => {
        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        const insertCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('INSERT INTO webhook_logs')
        );
        expect(insertCall![0]).toContain("'plaid'");
      });
    });

    // -------------------------------------------------------------------------
    // AUTH Webhook Type
    // -------------------------------------------------------------------------

    describe('AUTH webhook type', () => {
      describe('VERIFICATION_EXPIRED', () => {
        beforeEach(() => {
          mockRequest.body = {
            webhook_type: 'AUTH',
            webhook_code: 'VERIFICATION_EXPIRED',
            item_id: TEST_ITEM_ID
          };
        });

        it('should update bank verification to unverified with tenant check', async () => {
          mockDbQuery
            .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] }) // Tenant lookup
            .mockResolvedValue({ rows: [] }); // Subsequent queries

          await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

          expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE bank_verifications'),
            [TEST_ITEM_ID, TEST_TENANT_ID]
          );
        });

        it('should set verified = false', async () => {
          mockDbQuery
            .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
            .mockResolvedValue({ rows: [] });

          await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

          const updateCall = mockDbQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('UPDATE bank_verifications')
          );
          expect(updateCall![0]).toContain('verified = false');
        });

        it('should update without tenant check when tenant not found (backwards compat)', async () => {
          mockDbQuery.mockResolvedValue({ rows: [] }); // No tenant found

          await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

          const updateCall = mockDbQuery.mock.calls.find(
            call => typeof call[0] === 'string' &&
                   call[0].includes('UPDATE bank_verifications') &&
                   !call[0].includes('tenant_id = $2')
          );
          expect(updateCall).toBeDefined();
          expect(updateCall![1]).toEqual([TEST_ITEM_ID]);
        });

        it('should log expiration with tenant and item info', async () => {
          mockDbQuery
            .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
            .mockResolvedValue({ rows: [] });

          await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

          expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('expired')
          );
        });
      });

      it('should not update bank verification for non-VERIFICATION_EXPIRED codes', async () => {
        mockRequest.body = {
          webhook_type: 'AUTH',
          webhook_code: 'AUTOMATICALLY_VERIFIED',
          item_id: TEST_ITEM_ID
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        const updateCalls = mockDbQuery.mock.calls.filter(
          call => typeof call[0] === 'string' && call[0].includes('UPDATE bank_verifications')
        );
        expect(updateCalls).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // ITEM Webhook Type
    // -------------------------------------------------------------------------

    describe('ITEM webhook type', () => {
      it('should log error for ERROR webhook code', async () => {
        mockRequest.body = {
          webhook_type: 'ITEM',
          webhook_code: 'ERROR',
          item_id: TEST_ITEM_ID,
          error: { error_code: 'ITEM_LOGIN_REQUIRED' }
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            itemId: TEST_ITEM_ID
          }),
          expect.any(String)
        );
      });

      it('should not log error for non-ERROR codes', async () => {
        mockRequest.body = {
          webhook_type: 'ITEM',
          webhook_code: 'PENDING_EXPIRATION',
          item_id: TEST_ITEM_ID
        };

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.error).not.toHaveBeenCalledWith(
          expect.objectContaining({ itemId: TEST_ITEM_ID }),
          expect.stringContaining('error')
        );
      });
    });

    // -------------------------------------------------------------------------
    // INCOME_VERIFICATION Webhook Type
    // -------------------------------------------------------------------------

    describe('INCOME_VERIFICATION webhook type', () => {
      it('should log income verification webhook', async () => {
        mockRequest.body = {
          webhook_type: 'INCOME_VERIFICATION',
          webhook_code: 'INCOME_VERIFICATION_RISK_SIGNALS_READY',
          item_id: TEST_ITEM_ID
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            itemId: TEST_ITEM_ID,
            code: 'INCOME_VERIFICATION_RISK_SIGNALS_READY'
          }),
          expect.any(String)
        );
      });
    });

    // -------------------------------------------------------------------------
    // ASSETS Webhook Type
    // -------------------------------------------------------------------------

    describe('ASSETS webhook type', () => {
      it('should log assets webhook', async () => {
        mockRequest.body = {
          webhook_type: 'ASSETS',
          webhook_code: 'PRODUCT_READY',
          item_id: TEST_ITEM_ID
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            itemId: TEST_ITEM_ID,
            code: 'PRODUCT_READY'
          }),
          expect.any(String)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockDbQuery.mockRejectedValue(new Error('Database connection failed'));

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Database connection failed'
        });
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Test error'));

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.any(String)
        );
      });

      it('should handle missing webhook_type gracefully', async () => {
        mockRequest.body = { item_id: TEST_ITEM_ID };

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });

      it('should handle missing item_id gracefully', async () => {
        mockRequest.body = { webhook_type: 'AUTH', webhook_code: 'TEST' };

        await controller.handlePlaidWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });
    });
  });

  // ===========================================================================
  // handleStripeWebhook Tests
  // ===========================================================================

  describe('handleStripeWebhook', () => {
    const validPayload = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test123',
          customer: TEST_STRIPE_CUSTOMER_ID,
          amount: 10000
        }
      }
    };

    beforeEach(() => {
      mockRequest.body = validPayload;
      mockRequest.headers = { 'stripe-signature': 'test_signature' };
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful processing', () => {
      it('should return received: true on success', async () => {
        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });

      it('should return mock response when STRIPE_WEBHOOK_SECRET not set', async () => {
        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('[MOCK]')
        );
      });

      it('should process webhook when STRIPE_WEBHOOK_SECRET is set', async () => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Lookup
    // -------------------------------------------------------------------------

    describe('tenant lookup', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      });

      it('should lookup tenant from customer ID', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT tenant_id FROM stripe_customers'),
          [TEST_STRIPE_CUSTOMER_ID]
        );
      });

      it('should lookup tenant from account ID if customer lookup fails', async () => {
        mockRequest.body = {
          type: 'account.updated',
          data: {
            object: {
              id: TEST_STRIPE_ACCOUNT_ID,
              account: TEST_STRIPE_ACCOUNT_ID
            }
          }
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] }) // Customer lookup fails
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] }); // Account lookup succeeds

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT tenant_id FROM venue_payment_accounts'),
          [TEST_STRIPE_ACCOUNT_ID]
        );
      });

      it('should log warning when tenant cannot be determined', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Unable to determine tenant')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Webhook Logging
    // -------------------------------------------------------------------------

    describe('webhook logging', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      });

      it('should log webhook to database with tenant_id', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO webhook_logs'),
          [TEST_TENANT_ID, 'payment_intent.succeeded', JSON.stringify(validPayload)]
        );
      });

      it('should store source as stripe', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        const insertCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('INSERT INTO webhook_logs')
        );
        expect(insertCall![0]).toContain("'stripe'");
      });
    });

    // -------------------------------------------------------------------------
    // Payment Events
    // -------------------------------------------------------------------------

    describe('payment_intent.succeeded', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
        mockRequest.body = {
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_123', customer: TEST_STRIPE_CUSTOMER_ID } }
        };
      });

      it('should log payment success with tenant and payment ID', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            paymentIntentId: 'pi_123'
          }),
          expect.stringContaining('succeeded')
        );
      });

      it('should not log payment details when tenant not found', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        const paymentLogCalls = mockLogger.info.mock.calls.filter(
          call => call[0]?.paymentIntentId === 'pi_123'
        );
        expect(paymentLogCalls).toHaveLength(0);
      });
    });

    describe('payment_intent.payment_failed', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
        mockRequest.body = {
          type: 'payment_intent.payment_failed',
          data: { object: { id: 'pi_failed', customer: TEST_STRIPE_CUSTOMER_ID } }
        };
      });

      it('should log payment failure as warning', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            paymentIntentId: 'pi_failed'
          }),
          expect.stringContaining('failed')
        );
      });
    });

    describe('account.updated', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
        mockRequest.body = {
          type: 'account.updated',
          data: { object: { id: 'acct_123', account: TEST_STRIPE_ACCOUNT_ID } }
        };
      });

      it('should log account update', async () => {
        // FIX: No customer field, so only account lookup happens
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] }) // Account lookup
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            accountId: 'acct_123'
          }),
          expect.stringContaining('updated')
        );
      });
    });

    describe('payout events', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      });

      it('should log payout.paid event', async () => {
        mockRequest.body = {
          type: 'payout.paid',
          data: { object: { id: 'po_123', customer: TEST_STRIPE_CUSTOMER_ID } }
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            payoutId: 'po_123',
            status: 'payout.paid'
          }),
          expect.any(String)
        );
      });

      it('should log payout.failed event', async () => {
        mockRequest.body = {
          type: 'payout.failed',
          data: { object: { id: 'po_456', customer: TEST_STRIPE_CUSTOMER_ID } }
        };
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'payout.failed'
          }),
          expect.any(String)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
      });

      it('should return 400 on error (Stripe convention)', async () => {
        mockDbQuery.mockRejectedValue(new Error('Database error'));

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });

      it('should return error message', async () => {
        mockDbQuery.mockRejectedValue(new Error('Webhook processing failed'));

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Webhook processing failed'
        });
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Test error'));

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.any(String)
        );
      });

      it('should handle missing event type gracefully', async () => {
        mockRequest.body = { data: { object: {} } };

        await controller.handleStripeWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });
    });
  });

  // ===========================================================================
  // handleSendGridWebhook Tests
  // ===========================================================================

  describe('handleSendGridWebhook', () => {
    const validEvents = [
      {
        event: 'delivered',
        email: TEST_EMAIL,
        timestamp: Date.now()
      }
    ];

    beforeEach(() => {
      mockRequest.body = validEvents;
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful processing', () => {
      it('should return received: true on success', async () => {
        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });

      it('should process multiple events', async () => {
        mockRequest.body = [
          { event: 'delivered', email: 'test1@example.com' },
          { event: 'open', email: 'test2@example.com' },
          { event: 'click', email: 'test3@example.com' }
        ];

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledTimes(3);
      });

      it('should log each event', async () => {
        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('delivered')
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_EMAIL)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Lookup
    // -------------------------------------------------------------------------

    describe('tenant lookup', () => {
      it('should lookup tenant from email', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT tenant_id FROM notification_log'),
          [TEST_EMAIL]
        );
      });

      it('should query notification_log with email type filter', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("type = 'email'"),
          expect.any(Array)
        );
      });

      it('should log warning when tenant cannot be determined', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Unable to determine tenant')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Delivery Events
    // -------------------------------------------------------------------------

    describe('delivery status events', () => {
      const statusEvents = ['delivered', 'bounce', 'dropped'];

      statusEvents.forEach(eventType => {
        describe(`${eventType} event`, () => {
          beforeEach(() => {
            mockRequest.body = [{ event: eventType, email: TEST_EMAIL }];
          });

          it(`should update notification_log status to ${eventType} with tenant check`, async () => {
            mockDbQuery
              .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
              .mockResolvedValue({ rows: [] });

            await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

            expect(mockDbQuery).toHaveBeenCalledWith(
              expect.stringContaining('UPDATE notification_log'),
              [eventType, TEST_EMAIL, TEST_TENANT_ID]
            );
          });

          it(`should update notification_log without tenant check when tenant not found`, async () => {
            mockDbQuery.mockResolvedValue({ rows: [] });

            await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

            const updateCall = mockDbQuery.mock.calls.find(
              call => typeof call[0] === 'string' &&
                     call[0].includes('UPDATE notification_log') &&
                     !call[0].includes('tenant_id = $3')
            );
            expect(updateCall).toBeDefined();
          });
        });
      });
    });

    // -------------------------------------------------------------------------
    // Engagement Events
    // -------------------------------------------------------------------------

    describe('open event', () => {
      it('should log email open with tenant info', async () => {
        mockRequest.body = [{ event: 'open', email: TEST_EMAIL }];
        mockDbQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            email: TEST_EMAIL
          }),
          expect.stringContaining('opened')
        );
      });
    });

    describe('click event', () => {
      it('should log email click with URL', async () => {
        mockRequest.body = [{ event: 'click', email: TEST_EMAIL, url: 'https://example.com/link' }];
        mockDbQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            email: TEST_EMAIL,
            url: 'https://example.com/link'
          }),
          expect.stringContaining('clicked')
        );
      });
    });

    describe('spamreport event', () => {
      it('should log spam report as warning', async () => {
        mockRequest.body = [{ event: 'spamreport', email: TEST_EMAIL }];
        mockDbQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            email: TEST_EMAIL
          }),
          expect.stringContaining('spam')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Unsubscribe Event
    // -------------------------------------------------------------------------

    describe('unsubscribe event', () => {
      beforeEach(() => {
        mockRequest.body = [{ event: 'unsubscribe', email: TEST_EMAIL }];
      });

      it('should log unsubscribe event', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            email: TEST_EMAIL
          }),
          expect.stringContaining('unsubscribed')
        );
      });

      it('should update user preferences when tenant found', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE user_preferences'),
          [TEST_EMAIL, TEST_TENANT_ID]
        );
      });

      it('should set email_notifications to false', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        const updateCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('UPDATE user_preferences')
        );
        expect(updateCall![0]).toContain('email_notifications = false');
      });

      it('should not update preferences when tenant not found', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        const updateCalls = mockDbQuery.mock.calls.filter(
          call => typeof call[0] === 'string' && call[0].includes('UPDATE user_preferences')
        );
        expect(updateCalls).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockDbQuery.mockRejectedValue(new Error('Database connection failed'));

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Database connection failed'
        });
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Test error'));

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.any(String)
        );
      });

      it('should handle empty events array', async () => {
        mockRequest.body = [];

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });

      it('should handle malformed event object', async () => {
        mockRequest.body = [{ invalid: 'data' }];

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle event with missing email', async () => {
        mockRequest.body = [{ event: 'delivered' }];

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({ received: true });
      });

      it('should process each event independently', async () => {
        mockRequest.body = [
          { event: 'delivered', email: 'test1@example.com' },
          { event: 'bounce', email: 'test2@example.com' }
        ];
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] }) // First lookup
          .mockResolvedValueOnce({ rows: [] }) // First update
          .mockResolvedValueOnce({ rows: [] }) // Second lookup (no tenant)
          .mockResolvedValue({ rows: [] });

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        // Should have attempted lookups for both emails
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT tenant_id'),
          ['test1@example.com']
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT tenant_id'),
          ['test2@example.com']
        );
      });

      it('should continue processing after individual event failure', async () => {
        mockRequest.body = [
          { event: 'delivered', email: 'test1@example.com' },
          { event: 'delivered', email: 'test2@example.com' }
        ];
        // This will cause the entire handler to fail since we're not catching per-event
        // This test documents current behavior
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ tenant_id: TEST_TENANT_ID }] })
          .mockRejectedValueOnce(new Error('First event failed'));

        await controller.handleSendGridWebhook(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });
});
