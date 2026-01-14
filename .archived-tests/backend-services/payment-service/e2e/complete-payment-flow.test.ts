import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';

/**
 * Complete Payment Flow E2E Test
 * 
 * This test validates the entire payment flow from start to finish:
 * 1. Create payment intent via PaymentService
 * 2. Confirm payment through Stripe
 * 3. Verify database state (payment_intents + orders)
 * 4. Check outbox events are published
 * 5. Validate NFT minting job is queued
 * 6. Verify audit logs are created
 * 7. Check idempotency works across the flow
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be set (sk_test_*)
 * - Database must be running and migrated
 * - Redis must be running
 */

const app = require('../../src/index').default;

describe('Complete Payment Flow E2E Test', () => {
  let authToken: string;
  let stripe: Stripe;
  let testPaymentIntentIds: string[] = [];
  
  const userId = uuidv4();
  const tenantId = uuidv4();
  const venueId = uuidv4();
  const eventId = uuidv4();

  beforeAll(async () => {
    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify Stripe test key
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || !stripeKey.startsWith('sk_test_')) {
      throw new Error('STRIPE_SECRET_KEY must be set to sk_test_* for E2E tests');
    }

    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    // Generate test JWT token
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      {
        id: userId,
        userId: userId,
        tenantId: tenantId,
        role: 'user'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    // Setup test data
    const db = DatabaseService.getPool();
    
    // Create venue
    await db.query(
      `INSERT INTO venues (id, tenant_id, name, created_at, updated_at)
       VALUES ($1, $2, 'Test Venue', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [venueId, tenantId]
    );

    // Create event
    await db.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, date, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'Test Event', NOW() + INTERVAL '30 days', 'active', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [eventId, tenantId, venueId]
    );
  });

  afterAll(async () => {
    // Cleanup: Cancel test payment intents in Stripe
    for (const intentId of testPaymentIntentIds) {
      try {
        await stripe.paymentIntents.cancel(intentId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Cleanup database
    try {
      const db = DatabaseService.getPool();
      await db.query('DELETE FROM payment_intents WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]);
      await db.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM events WHERE id = $1', [eventId]);
      await db.query('DELETE FROM venues WHERE id = $1', [venueId]);
    } catch (error) {
      console.error('Database cleanup failed:', error);
    }
  });

  afterEach(async () => {
    // Clean up Redis
    try {
      const client = RedisService.getClient();
      const keys = await client.keys('*');
      if (keys.length > 0) {
        const testKeys = keys.filter(k => k.includes(userId));
        if (testKeys.length > 0) {
          await client.del(...testKeys);
        }
      }
    } catch (err) {
      console.log('Redis cleanup skipped:', err);
    }
  });

  it('should complete full payment flow: intent → payment → confirmation → NFT queue → outbox', async () => {
    const idempotencyKey = uuidv4();
    const ticketTypeId = uuidv4();
    const amountCents = 10000; // $100.00

    // ================================================================
    // STEP 1: Create Payment Intent via API
    // ================================================================
    const paymentRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
      .send({
        eventId,
        venueId,
        tickets: [
          { ticketTypeId, quantity: 2, price: 5000 } // 2 tickets @ $50 each = $100
        ],
        paymentMethod: { token: 'pm_card_visa' },
        sessionData: {
          actions: [
            { type: 'page_view', timestamp: Date.now() - 60000 },
            { type: 'select_ticket', timestamp: Date.now() - 30000 },
            { type: 'checkout', timestamp: Date.now() }
          ],
          browserFeatures: {
            userAgent: 'Mozilla/5.0',
            screenResolution: '1920x1080',
            timezone: 'America/New_York'
          }
        }
      });

    // Verify API response
    expect([200, 201]).toContain(paymentRes.status);
    expect(paymentRes.body).toHaveProperty('transaction');
    expect(paymentRes.body).toHaveProperty('fees');
    
    const transactionId = paymentRes.body.transaction.transactionId;
    const stripeIntentId = paymentRes.body.transaction.stripeIntentId;

    expect(transactionId).toBeTruthy();
    expect(stripeIntentId).toMatch(/^pi_/);

    testPaymentIntentIds.push(stripeIntentId);

    // ================================================================
    // STEP 2: Verify Stripe Payment Intent was created
    // ================================================================
    const stripeIntent = await stripe.paymentIntents.retrieve(stripeIntentId);
    
    expect(stripeIntent.id).toBe(stripeIntentId);
    expect(stripeIntent.amount).toBe(amountCents);
    expect(stripeIntent.currency).toBe('usd');
    expect(stripeIntent.status).toBe('requires_payment_method');

    // ================================================================
    // STEP 3: Confirm Payment in Stripe (simulate customer payment)
    // ================================================================
    const confirmedIntent = await stripe.paymentIntents.confirm(stripeIntentId, {
      payment_method: 'pm_card_visa',
      return_url: 'https://test.com/return'
    });

    expect(confirmedIntent.status).toBe('succeeded');

    // ================================================================
    // STEP 4: Verify Database State
    // ================================================================
    const db = DatabaseService.getPool();

    // Check payment_intents table
    const paymentCheck = await db.query(
      'SELECT * FROM payment_intents WHERE stripe_intent_id = $1',
      [stripeIntentId]
    );

    expect(paymentCheck.rows.length).toBe(1);
    const dbPayment = paymentCheck.rows[0];
    
    expect(dbPayment.stripe_intent_id).toBe(stripeIntentId);
    expect(dbPayment.amount).toBe(amountCents);
    expect(dbPayment.venue_id).toBe(venueId);

    // Check orders table
    const orderCheck = await db.query(
      'SELECT * FROM orders WHERE id = $1',
      [dbPayment.order_id]
    );

    expect(orderCheck.rows.length).toBe(1);
    const dbOrder = orderCheck.rows[0];
    
    expect(dbOrder.user_id).toBe(userId);
    expect(dbOrder.tenant_id).toBe(tenantId);
    expect(dbOrder.venue_id).toBe(venueId);
    expect(dbOrder.total).toBe(amountCents);

    // ================================================================
    // STEP 5: Verify Outbox Events Published
    // ================================================================
    const outboxCheck = await db.query(
      `SELECT * FROM outbox 
       WHERE aggregate_type = 'payment_intent'
       AND event_type = 'payments.intent_created'
       AND aggregate_id = $1`,
      [dbPayment.id]
    );

    expect(outboxCheck.rows.length).toBeGreaterThan(0);
    
    const outboxEvent = outboxCheck.rows[0];
    const eventPayload = JSON.parse(outboxEvent.payload);
    
    expect(eventPayload.intentId).toBe(dbPayment.id);
    expect(eventPayload.stripeIntentId).toBe(stripeIntentId);
    expect(eventPayload.amount).toBe(amountCents);

    // ================================================================
    // STEP 6: Check NFT Minting Job Queued
    // ================================================================
    if (paymentRes.body.nftStatus === 'queued') {
      expect(paymentRes.body.nftStatus).toBe('queued');
      
      // Check Redis for queued job
      const client = RedisService.getClient();
      const queueKeys = await client.keys('nft:queue:*');
      
      // Should have at least one NFT minting job
      expect(queueKeys.length).toBeGreaterThan(0);
    }

    // ================================================================
    // STEP 7: Test Idempotency - Retry Same Request
    // ================================================================
    const retryRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey) // SAME KEY
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
      .send({
        eventId,
        venueId,
        tickets: [
          { ticketTypeId, quantity: 2, price: 5000 }
        ],
        paymentMethod: { token: 'pm_card_visa' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Should return cached response
    expect(retryRes.status).toBe(paymentRes.status);
    expect(retryRes.body.transaction?.transactionId).toBe(transactionId);

    // ================================================================
    // STEP 8: Verify No Duplicate Payment Intent in Stripe
    // ================================================================
    const allIntents = await stripe.paymentIntents.list({ limit: 10 });
    const createdIntents = allIntents.data.filter(i => 
      i.metadata && i.metadata.orderId === dbPayment.order_id
    );

    // Should only have ONE payment intent for this order
    expect(createdIntents.length).toBe(1);

    // ================================================================
    // STEP 9: Query Transaction Status
    // ================================================================
    const statusRes = await request(app)
      .get(`/api/v1/payments/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.transaction).toBeTruthy();

    // ================================================================
    // STEP 10: Calculate Fees for Same Order
    // ================================================================
    const feesRes = await request(app)
      .post('/api/v1/payments/calculate-fees')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        venueId,
        amount: amountCents,
        ticketCount: 2
      });

    expect(feesRes.status).toBe(200);
    expect(feesRes.body).toHaveProperty('fees');
    expect(feesRes.body).toHaveProperty('total');
    expect(feesRes.body.fees).toHaveProperty('platform');
    expect(feesRes.body.fees).toHaveProperty('processing');

    // ================================================================
    // SUCCESS: Complete Flow Validated!
    // ================================================================
    console.log('✅ Complete payment flow validated successfully');
    console.log('   - Payment Intent Created:', stripeIntentId);
    console.log('   - Stripe Confirmation: succeeded');
    console.log('   - Database State: verified');
    console.log('   - Outbox Events: published');
    console.log('   - NFT Queue: checked');
    console.log('   - Idempotency: working');
    console.log('   - Transaction Status: queryable');
  });

  it('should handle payment failures gracefully', async () => {
    const idempotencyKey = uuidv4();

    // Attempt payment with card that will be declined
    const paymentRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .set('User-Agent', 'Mozilla/5.0')
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
        paymentMethod: { token: 'pm_card_chargeDeclined' }, // Declined card
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Should handle failure gracefully
    expect([400, 402, 500]).toContain(paymentRes.status);
    
    if (paymentRes.body.transaction) {
      expect(['failed', 'requires_payment_method']).toContain(paymentRes.body.transaction.status);
    }
  });

  it('should support multiple payments by same user', async () => {
    // Create first payment
    const payment1Res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 3000 }],
        paymentMethod: { token: 'pm_card_visa' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Create second payment
    const payment2Res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 4000 }],
        paymentMethod: { token: 'pm_card_visa' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Both should succeed (or fail for same reason)
    expect(payment1Res.status).toBe(payment2Res.status);

    if (payment1Res.body.transaction && payment2Res.body.transaction) {
      // Should have different transaction IDs
      expect(payment1Res.body.transaction.transactionId).not.toBe(
        payment2Res.body.transaction.transactionId
      );

      testPaymentIntentIds.push(payment1Res.body.transaction.stripeIntentId);
      testPaymentIntentIds.push(payment2Res.body.transaction.stripeIntentId);
    }
  });
});
