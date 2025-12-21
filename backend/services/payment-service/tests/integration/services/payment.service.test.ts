/**
 * PaymentProcessorService Integration Tests
 * 
 * Tests the core payment processing service
 * Uses src/services/core/payment-processor.service.ts
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db,
  pool,
  createTestOrder,
} from '../setup';
import { DatabaseService } from '../../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

// Mock Stripe before importing PaymentProcessorService
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
      confirm: jest.fn().mockResolvedValue({
        id: 'pi_test_mock_123',
        status: 'succeeded',
      }),
    },
  }));
});

import { PaymentProcessorService } from '../../../src/services/core/payment-processor.service';
import Stripe from 'stripe';

describe('PaymentProcessorService', () => {
  let context: TestContext;
  let paymentProcessor: PaymentProcessorService;
  let mockStripe: Stripe;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.NODE_ENV = 'test';
    await DatabaseService.initialize();
    context = await setupTestApp();
    
    mockStripe = new Stripe('sk_test_mock', { apiVersion: '2023-10-16' as any });
    paymentProcessor = new PaymentProcessorService(mockStripe, pool);
  });

  afterAll(async () => {
    await DatabaseService.close();
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('processPayment', () => {
    it('should be defined', () => {
      expect(paymentProcessor).toBeDefined();
      expect(paymentProcessor.processPayment).toBeDefined();
    });

    it('should have confirmPayment method', () => {
      expect(paymentProcessor.confirmPayment).toBeDefined();
    });
  });

  describe('createPaymentIntent via database', () => {
    it('should create payment intent record in database', async () => {
      const intentId = uuidv4();
      const stripeIntentId = `pi_test_${Date.now()}`;
      
      await pool.query(
        `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, currency, status, tenant_id, venue_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [intentId, context.testOrderId, stripeIntentId, 100.00, 'usd', 'pending', context.testTenantId, context.testVenueId]
      );

      const result = await pool.query(
        'SELECT * FROM payment_intents WHERE id = $1',
        [intentId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].stripe_intent_id).toBe(stripeIntentId);
      expect(parseFloat(result.rows[0].amount)).toBe(100.00);
    });

    it('should handle payment intent with metadata', async () => {
      const intentId = uuidv4();
      const stripeIntentId = `pi_test_${Date.now()}`;
      const metadata = { ticketIds: ['t1', 't2'], eventName: 'Test Concert' };
      
      await pool.query(
        `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, currency, status, tenant_id, venue_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [intentId, context.testOrderId, stripeIntentId, 50.00, 'usd', 'pending', context.testTenantId, context.testVenueId, JSON.stringify(metadata)]
      );

      const result = await pool.query(
        'SELECT * FROM payment_intents WHERE id = $1',
        [intentId]
      );

      expect(result.rows[0].metadata).toEqual(metadata);
    });

    it('should enforce unique stripe_intent_id', async () => {
      const stripeIntentId = `pi_unique_${Date.now()}`;
      
      await pool.query(
        `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, currency, status, tenant_id, venue_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), context.testOrderId, stripeIntentId, 100.00, 'usd', 'pending', context.testTenantId, context.testVenueId]
      );

      // Create another order for second insert
      const order2 = await createTestOrder(context.testTenantId, context.testUserId, context.testEventId);

      await expect(
        pool.query(
          `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, currency, status, tenant_id, venue_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), order2.id, stripeIntentId, 100.00, 'usd', 'pending', context.testTenantId, context.testVenueId]
        )
      ).rejects.toThrow();
    });

    it('should require valid order_id foreign key', async () => {
      const fakeOrderId = uuidv4();
      
      await expect(
        pool.query(
          `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, currency, status, tenant_id, venue_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), fakeOrderId, `pi_test_${Date.now()}`, 100.00, 'usd', 'pending', context.testTenantId, context.testVenueId]
        )
      ).rejects.toThrow();
    });

    it('should store platform_fee correctly', async () => {
      const intentId = uuidv4();
      
      await pool.query(
        `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, platform_fee, currency, status, tenant_id, venue_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [intentId, context.testOrderId, `pi_test_${Date.now()}`, 100.00, 10.00, 'usd', 'pending', context.testTenantId, context.testVenueId]
      );

      const result = await pool.query(
        'SELECT * FROM payment_intents WHERE id = $1',
        [intentId]
      );

      expect(parseFloat(result.rows[0].platform_fee)).toBe(10.00);
    });

    it('should track status changes', async () => {
      const intentId = uuidv4();
      const stripeIntentId = `pi_test_${Date.now()}`;
      
      await pool.query(
        `INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount, currency, status, tenant_id, venue_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [intentId, context.testOrderId, stripeIntentId, 100.00, 'usd', 'pending', context.testTenantId, context.testVenueId]
      );

      // Update status
      await pool.query(
        `UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2`,
        ['succeeded', intentId]
      );

      const result = await pool.query(
        'SELECT status, created_at, updated_at FROM payment_intents WHERE id = $1',
        [intentId]
      );

      expect(result.rows[0].status).toBe('succeeded');
    });
  });

  describe('outbox pattern', () => {
    it('should create outbox entry for payment events', async () => {
      const aggregateId = context.testOrderId;
      
      await pool.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [aggregateId, 'payment', 'payment.created', JSON.stringify({ orderId: aggregateId, amount: 10000 })]
      );

      const result = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [aggregateId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].event_type).toBe('payment.created');
      expect(result.rows[0].processed).toBe(false);
    });

    it('should mark outbox entry as processed', async () => {
      const aggregateId = context.testOrderId;
      
      const insertResult = await pool.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [aggregateId, 'payment', 'payment.confirmed', JSON.stringify({ orderId: aggregateId })]
      );

      await pool.query(
        `UPDATE outbox SET processed = true, processed_at = NOW() WHERE id = $1`,
        [insertResult.rows[0].id]
      );

      const result = await pool.query(
        'SELECT processed, processed_at FROM outbox WHERE id = $1',
        [insertResult.rows[0].id]
      );

      expect(result.rows[0].processed).toBe(true);
      expect(result.rows[0].processed_at).not.toBeNull();
    });
  });
});
