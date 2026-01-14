/**
 * WebhookProcessor Integration Tests
 * 
 * Note: WebhookProcessor now initializes DatabaseService at construction time,
 * so we need to ensure DB is initialized before importing it.
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db,
  pool,
} from '../setup';
import { DatabaseService } from '../../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

// Mock Stripe before any imports that might use it
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_mock_123',
        client_secret: 'pi_test_mock_123_secret',
        status: 'requires_payment_method',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_test_mock_123',
        status: 'succeeded',
      }),
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_123' } },
      }),
    },
  }));
});

describe('WebhookProcessor', () => {
  let context: TestContext;
  let WebhookProcessor: any;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.NODE_ENV = 'test';
    
    // Initialize database BEFORE importing WebhookProcessor
    await DatabaseService.initialize();
    
    // Now safe to import WebhookProcessor
    const webhookModule = await import('../../../src/services/webhookProcessor');
    WebhookProcessor = webhookModule.WebhookProcessor;
    
    context = await setupTestApp();
  });

  afterAll(async () => {
    await DatabaseService.close();
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('verifyStripeSignature', () => {
    it('should return true in mock mode (no webhook secret)', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const result = WebhookProcessor.verifyStripeSignature('payload', 'signature');
      expect(result).toBe(true);
    });
  });

  describe('processStripeWebhook', () => {
    it('should handle non-existent webhook gracefully', async () => {
      const fakeId = uuidv4();
      // Should not throw, just log error
      await WebhookProcessor.processStripeWebhook(fakeId);
    });

    it('should process payment_intent.succeeded webhook', async () => {
      const webhookId = uuidv4();
      const eventId = `evt_test_${Date.now()}`;
      
      // Insert with all required fields
      await pool.query(
        `INSERT INTO webhook_inbox (webhook_id, event_id, provider, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          webhookId,
          eventId,
          'stripe',
          'payment_intent.succeeded',
          JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: 'pi_test_123', metadata: { userId: context.testUserId } } },
          }),
          'pending',
        ]
      );

      await WebhookProcessor.processStripeWebhook(webhookId);

      // Check webhook was marked processed
      const result = await pool.query(
        'SELECT processed_at FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );
      expect(result.rows[0].processed_at).not.toBeNull();
    });

    it('should process payment_intent.payment_failed webhook', async () => {
      const webhookId = uuidv4();
      const eventId = `evt_failed_${Date.now()}`;
      
      await pool.query(
        `INSERT INTO webhook_inbox (webhook_id, event_id, provider, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          webhookId,
          eventId,
          'stripe',
          'payment_intent.payment_failed',
          JSON.stringify({
            type: 'payment_intent.payment_failed',
            data: { object: { id: 'pi_failed_123' } },
          }),
          'pending',
        ]
      );

      await WebhookProcessor.processStripeWebhook(webhookId);

      const result = await pool.query(
        'SELECT processed_at FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );
      expect(result.rows[0].processed_at).not.toBeNull();
    });

    it('should handle unrecognized webhook type', async () => {
      const webhookId = uuidv4();
      const eventId = `evt_other_${Date.now()}`;
      
      await pool.query(
        `INSERT INTO webhook_inbox (webhook_id, event_id, provider, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          webhookId,
          eventId,
          'stripe',
          'customer.created',
          JSON.stringify({
            type: 'customer.created',
            data: { object: { id: 'cus_123' } },
          }),
          'pending',
        ]
      );

      await WebhookProcessor.processStripeWebhook(webhookId);

      // Should still mark as processed
      const result = await pool.query(
        'SELECT processed_at FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );
      expect(result.rows[0].processed_at).not.toBeNull();
    });
  });
});
