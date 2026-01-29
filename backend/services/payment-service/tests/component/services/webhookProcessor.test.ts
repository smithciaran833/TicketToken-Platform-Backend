/**
 * COMPONENT TEST: WebhookProcessor
 *
 * Tests webhook processing with REAL Database and MOCKED Stripe/PaymentProcessor
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  }
  return sharedPool;
}

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => getSharedPool(),
  },
}));

// Mock PaymentProcessorService
const mockConfirmPayment = jest.fn();
jest.mock('../../../src/services/core/payment-processor.service', () => ({
  PaymentProcessorService: jest.fn().mockImplementation(() => ({
    confirmPayment: mockConfirmPayment,
  })),
}));

// Mock Stripe
const mockConstructEvent = jest.fn();
const mockStripe = jest.fn().mockImplementation(() => ({
  webhooks: {
    constructEvent: mockConstructEvent,
  },
}));
jest.mock('stripe', () => mockStripe);

import { WebhookProcessor } from '../../../src/services/webhookProcessor';

describe('WebhookProcessor Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();

    // Clear mocks
    jest.clearAllMocks();
    mockConstructEvent.mockReturnValue({ verified: true });
    mockConfirmPayment.mockResolvedValue({ success: true });

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM webhook_inbox WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // PAYMENT SUCCESS WEBHOOK
  // ===========================================================================
  describe('processStripeWebhook() - payment_intent.succeeded', () => {
    it('should process payment success webhook', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            amount: 10000,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              userId,
              orderId: uuidv4(),
            },
          },
        },
      };

      // Insert webhook into inbox
      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.succeeded', $5, 'pending', NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      // Process webhook
      await WebhookProcessor.processStripeWebhook(webhookId);

      // Verify confirmPayment was called
      expect(mockConfirmPayment).toHaveBeenCalledWith(paymentIntentId, userId);

      // Verify webhook marked as processed
      const result = await pool.query(
        'SELECT processed_at FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );

      expect(result.rows[0].processed_at).not.toBeNull();
    });

    it('should handle payment success with user_id in metadata', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            metadata: {
              user_id: userId, // Alternative key
            },
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.succeeded', $5, 'pending', NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      await WebhookProcessor.processStripeWebhook(webhookId);

      expect(mockConfirmPayment).toHaveBeenCalledWith(paymentIntentId, userId);
    });

    it('should handle payment success without userId in metadata', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            metadata: {}, // No userId
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.succeeded', $5, 'pending', NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      await WebhookProcessor.processStripeWebhook(webhookId);

      // Should call confirmPayment with undefined userId
      expect(mockConfirmPayment).toHaveBeenCalledWith(paymentIntentId, undefined);
    });
  });

  // ===========================================================================
  // PAYMENT FAILED WEBHOOK
  // ===========================================================================
  describe('processStripeWebhook() - payment_intent.payment_failed', () => {
    it('should process payment failed webhook', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      const payload = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: paymentIntentId,
            status: 'failed',
            last_payment_error: {
              message: 'Card declined',
            },
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.payment_failed', $5, 'pending', NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      await WebhookProcessor.processStripeWebhook(webhookId);

      // Verify webhook marked as processed (even though handler doesn't do much yet)
      const result = await pool.query(
        'SELECT processed_at FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );

      expect(result.rows[0].processed_at).not.toBeNull();
    });
  });

  // ===========================================================================
  // UNHANDLED WEBHOOK TYPES
  // ===========================================================================
  describe('processStripeWebhook() - unhandled types', () => {
    it('should mark unhandled webhook types as processed', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;

      const payload = {
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test_123',
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, created_at
        )
        VALUES ($1, $2, 'stripe', 'evt_test', $3, 'customer.created', $4, 'pending', NOW())
      `, [uuidv4(), tenantId, webhookId, JSON.stringify(payload)]);

      await WebhookProcessor.processStripeWebhook(webhookId);

      // Should still mark as processed
      const result = await pool.query(
        'SELECT processed_at FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );

      expect(result.rows[0].processed_at).not.toBeNull();
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('processStripeWebhook() - error handling', () => {
    it('should increment attempts on processing error', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      // Make confirmPayment throw error
      mockConfirmPayment.mockRejectedValueOnce(new Error('Database connection failed'));

      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            metadata: { userId },
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, attempts, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.succeeded', $5, 'pending', 0, NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      await WebhookProcessor.processStripeWebhook(webhookId);

      // Verify attempts incremented and error logged
      const result = await pool.query(
        'SELECT attempts, error FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );

      expect(result.rows[0].attempts).toBe(1);
      expect(result.rows[0].error).toContain('Database connection failed');
    });

    it('should handle webhook not found', async () => {
      const webhookId = 'nonexistent_webhook_id';

      // Should not throw
      await expect(
        WebhookProcessor.processStripeWebhook(webhookId)
      ).resolves.not.toThrow();
    });

    it('should handle multiple processing errors', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      mockConfirmPayment.mockRejectedValue(new Error('Persistent error'));

      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            metadata: { userId },
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, attempts, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.succeeded', $5, 'pending', 0, NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      // Process multiple times
      await WebhookProcessor.processStripeWebhook(webhookId);
      await WebhookProcessor.processStripeWebhook(webhookId);
      await WebhookProcessor.processStripeWebhook(webhookId);

      // Verify attempts incremented each time
      const result = await pool.query(
        'SELECT attempts FROM webhook_inbox WHERE webhook_id = $1',
        [webhookId]
      );

      expect(result.rows[0].attempts).toBe(3);
    });
  });

  // ===========================================================================
  // SIGNATURE VERIFICATION
  // ===========================================================================
  describe('verifyStripeSignature()', () => {
    it('should verify valid signature', () => {
      mockConstructEvent.mockReturnValue({ verified: true });

      const payload = JSON.stringify({ type: 'test' });
      const signature = 'valid_signature';

      const result = WebhookProcessor.verifyStripeSignature(payload, signature);

      expect(result).toBe(true);
      expect(mockConstructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    });

    it('should reject invalid signature', () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const payload = JSON.stringify({ type: 'test' });
      const signature = 'invalid_signature';

      const result = WebhookProcessor.verifyStripeSignature(payload, signature);

      expect(result).toBe(false);
    });

    it('should throw if STRIPE_WEBHOOK_SECRET not set', () => {
      const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      expect(() => {
        WebhookProcessor.verifyStripeSignature('payload', 'signature');
      }).toThrow('STRIPE_WEBHOOK_SECRET is required');

      // Restore
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    });
  });

  // ===========================================================================
  // IDEMPOTENCY
  // ===========================================================================
  describe('webhook idempotency', () => {
    it('should handle duplicate webhook processing attempts', async () => {
      const webhookId = `wh_${uuidv4().slice(0, 16)}`;
      const paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            metadata: { userId },
          },
        },
      };

      await pool.query(`
        INSERT INTO webhook_inbox (
          id, tenant_id, provider, event_id, webhook_id, event_type, payload, status, created_at
        )
        VALUES ($1, $2, 'stripe', $3, $4, 'payment_intent.succeeded', $5, 'pending', NOW())
      `, [uuidv4(), tenantId, paymentIntentId, webhookId, JSON.stringify(payload)]);

      // Process same webhook twice
      await WebhookProcessor.processStripeWebhook(webhookId);
      await WebhookProcessor.processStripeWebhook(webhookId);

      // confirmPayment should be called twice (not idempotent at this level)
      expect(mockConfirmPayment).toHaveBeenCalledTimes(2);
    });
  });
});
