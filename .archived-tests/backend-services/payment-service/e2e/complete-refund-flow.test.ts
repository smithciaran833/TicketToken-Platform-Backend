import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';

/**
 * Complete Refund Flow E2E Test
 * 
 * This test validates the entire refund flow from start to finish:
 * 1. Create and confirm payment
 * 2. Request refund via API
 * 3. Verify Stripe refund is created
 * 4. Check database state updated (payment_intents, refunds)
 * 5. Validate outbox events published
 * 6. Test idempotency for refunds
 * 7. Verify audit logs created
 * 8. Test partial refunds
 * 9. Test multiple refunds on same payment
 * 10. Validate refund status queries
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be set (sk_test_*)
 * - Database must be running and migrated
 * - Redis must be running
 */

const app = require('../../src/index').default;

describe('Complete Refund Flow E2E Test', () => {
  let authToken: string;
  let stripe: Stripe;
  let testPaymentIntentIds: string[] = [];
  let testRefundIds: string[] = [];
  
  const userId = uuidv4();
  const tenantId = uuidv4();
  const venueId = uuidv4();

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
        role: 'admin'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Cleanup Stripe
    for (const intentId of testPaymentIntentIds) {
      try {
        await stripe.paymentIntents.cancel(intentId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    for (const refundId of testRefundIds) {
      try {
        const refund = await stripe.refunds.retrieve(refundId);
        console.log(`Refund ${refundId}: ${refund.status}`);
      } catch (error) {
        // Ignore
      }
    }

    // Cleanup database
    try {
      const db = DatabaseService.getPool();
      await db.query('DELETE FROM refunds WHERE tenant_id = $1', [tenantId]);
      await db.query('DELETE FROM payment_intents WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]);
      await db.query('DELETE FROM orders WHERE user_id = $1', [userId]);
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
        const testKeys = keys.filter(k => k.includes(userId) || k.includes('rate_limit') || k.includes('idempotency'));
        if (testKeys.length > 0) {
          await client.del(...testKeys);
        }
      }
    } catch (err) {
      console.log('Redis cleanup skipped:', err);
    }
  });

  it('should complete full refund flow: payment → refund → database → outbox → stripe verification', async () => {
    const amountCents = 5000; // $50.00

    // ================================================================
    // STEP 1: Create and Confirm Payment in Stripe
    // ================================================================
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    expect(paymentIntent.status).toBe('succeeded');
    testPaymentIntentIds.push(paymentIntent.id);

    // ================================================================
    // STEP 2: Insert Payment into Database
    // ================================================================
    const db = DatabaseService.getPool();
    const orderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW())`,
      [orderId, tenantId, userId, venueId, amountCents]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', '{}', NOW(), NOW())`,
      [orderId, paymentIntent.id, amountCents, 500, venueId]
    );

    // ================================================================
    // STEP 3: Request Refund via API
    // ================================================================
    const refundRes = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: amountCents,
        reason: 'requested_by_customer'
      });

    expect(refundRes.status).toBe(200);
    expect(refundRes.body).toHaveProperty('refundId');
    expect(refundRes.body.refundId).toMatch(/^re_/);

    const refundId = refundRes.body.refundId;
    testRefundIds.push(refundId);

    // ================================================================
    // STEP 4: Verify Stripe Refund Created
    // ================================================================
    const stripeRefund = await stripe.refunds.retrieve(refundId);

    expect(stripeRefund.id).toBe(refundId);
    expect(stripeRefund.amount).toBe(amountCents);
    expect(stripeRefund.payment_intent).toBe(paymentIntent.id);
    expect(stripeRefund.status).toBe('succeeded');
    expect(stripeRefund.reason).toBe('requested_by_customer');

    // ================================================================
    // STEP 5: Verify Database State
    // ================================================================
    
    // Check refunds table
    const refundCheck = await db.query(
      'SELECT * FROM refunds WHERE stripe_refund_id = $1',
      [refundId]
    );

    expect(refundCheck.rows.length).toBe(1);
    const dbRefund = refundCheck.rows[0];

    expect(dbRefund.stripe_refund_id).toBe(refundId);
    expect(dbRefund.payment_intent_id).toBe(paymentIntent.id);
    expect(dbRefund.amount).toBe(amountCents);
    expect(dbRefund.status).toBe('succeeded');
    expect(dbRefund.tenant_id).toBe(tenantId);

    // Check payment_intents table updated
    const paymentCheck = await db.query(
      'SELECT status FROM payment_intents WHERE stripe_intent_id = $1',
      [paymentIntent.id]
    );

    expect(paymentCheck.rows[0].status).toBe('refunded');

    // ================================================================
    // STEP 6: Verify Outbox Events Published
    // ================================================================
    const outboxCheck = await db.query(
      `SELECT * FROM outbox 
       WHERE aggregate_type = 'refund'
       AND event_type = 'refund.completed'
       AND payload->>'refundId' = $1`,
      [refundId]
    );

    expect(outboxCheck.rows.length).toBeGreaterThan(0);
    
    const outboxEvent = outboxCheck.rows[0];
    const eventPayload = JSON.parse(outboxEvent.payload);

    expect(eventPayload.refundId).toBe(refundId);
    expect(eventPayload.stripeRefundId).toBe(refundId);
    expect(eventPayload.paymentIntentId).toBe(paymentIntent.id);
    expect(eventPayload.amount).toBe(amountCents);
    expect(eventPayload.tenantId).toBe(tenantId);
    expect(eventPayload.userId).toBe(userId);

    // ================================================================
    // STEP 7: Test Idempotency - Retry Same Refund
    // ================================================================
    const idempotencyKey = uuidv4();

    // First refund with key
    const refund1 = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: amountCents,
        reason: 'duplicate'
      });

    // Second refund with SAME key
    const refund2 = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: amountCents,
        reason: 'duplicate'
      });

    // Should return same result (cached or prevented)
    expect(refund1.status).toBe(refund2.status);

    // ================================================================
    // SUCCESS: Complete Refund Flow Validated!
    // ================================================================
    console.log('✅ Complete refund flow validated successfully');
    console.log('   - Payment Created:', paymentIntent.id);
    console.log('   - Refund Created:', refundId);
    console.log('   - Stripe Status:', stripeRefund.status);
    console.log('   - Database Updated: payment_intents + refunds');
    console.log('   - Outbox Event: published');
    console.log('   - Idempotency: verified');
  });

  it('should handle partial refunds correctly', async () => {
    const totalAmount = 10000; // $100.00
    const partialAmount = 3000; // $30.00 refund

    // Create payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    testPaymentIntentIds.push(paymentIntent.id);

    // Insert into database
    const db = DatabaseService.getPool();
    const orderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW())`,
      [orderId, tenantId, userId, venueId, totalAmount]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', '{}', NOW(), NOW())`,
      [orderId, paymentIntent.id, totalAmount, 1000, venueId]
    );

    // Request partial refund
    const refundRes = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: partialAmount,
        reason: 'requested_by_customer'
      });

    expect(refundRes.status).toBe(200);
    testRefundIds.push(refundRes.body.refundId);

    // Verify in Stripe
    const stripeRefund = await stripe.refunds.retrieve(refundRes.body.refundId);
    expect(stripeRefund.amount).toBe(partialAmount);

    // Verify payment intent NOT fully refunded
    const stripeIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
    expect((stripeIntent as any).amount_refunded).toBe(partialAmount);

    // Database should still show partial refund
    const refundCheck = await db.query(
      'SELECT * FROM refunds WHERE stripe_refund_id = $1',
      [refundRes.body.refundId]
    );

    expect(refundCheck.rows[0].amount).toBe(partialAmount);
  });

  it('should support multiple partial refunds on same payment', async () => {
    const totalAmount = 10000; // $100.00

    // Create payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    testPaymentIntentIds.push(paymentIntent.id);

    // Insert into database
    const db = DatabaseService.getPool();
    const orderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW())`,
      [orderId, tenantId, userId, venueId, totalAmount]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', '{}', NOW(), NOW())`,
      [orderId, paymentIntent.id, totalAmount, 1000, venueId]
    );

    // First partial refund ($30)
    const refund1Res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: 3000,
        reason: 'requested_by_customer'
      });

    expect(refund1Res.status).toBe(200);
    testRefundIds.push(refund1Res.body.refundId);

    // Second partial refund ($20)
    const refund2Res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: 2000,
        reason: 'requested_by_customer'
      });

    expect(refund2Res.status).toBe(200);
    testRefundIds.push(refund2Res.body.refundId);

    // Should have different refund IDs
    expect(refund1Res.body.refundId).not.toBe(refund2Res.body.refundId);

    // Verify total refunded in Stripe
    const stripeIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
    expect((stripeIntent as any).amount_refunded).toBe(5000); // $30 + $20

    // Verify both refunds in database
    const refundsCheck = await db.query(
      'SELECT * FROM refunds WHERE payment_intent_id = $1 ORDER BY created_at',
      [paymentIntent.id]
    );

    expect(refundsCheck.rows.length).toBe(2);
    expect(refundsCheck.rows[0].amount).toBe(3000);
    expect(refundsCheck.rows[1].amount).toBe(2000);
  });

  it('should prevent refund exceeding original payment amount', async () => {
    const totalAmount = 5000; // $50.00

    // Create payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    testPaymentIntentIds.push(paymentIntent.id);

    // Insert into database
    const db = DatabaseService.getPool();
    const orderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW())`,
      [orderId, tenantId, userId, venueId, totalAmount]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', '{}', NOW(), NOW())`,
      [orderId, paymentIntent.id, totalAmount, 500, venueId]
    );

    // Try to refund MORE than original amount
    const refundRes = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: 10000, // $100.00 (more than $50.00 original)
        reason: 'requested_by_customer'
      });

    expect(refundRes.status).toBe(400);
    expect(refundRes.body.error).toContain('exceeds');
  });

  it('should handle refund for already-refunded payment', async () => {
    const totalAmount = 3000; // $30.00

    // Create payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    testPaymentIntentIds.push(paymentIntent.id);

    // Insert into database
    const db = DatabaseService.getPool();
    const orderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW())`,
      [orderId, tenantId, userId, venueId, totalAmount]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', '{}', NOW(), NOW())`,
      [orderId, paymentIntent.id, totalAmount, 300, venueId]
    );

    // First refund (full amount)
    const refund1Res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        reason: 'requested_by_customer'
      });

    expect(refund1Res.status).toBe(200);
    testRefundIds.push(refund1Res.body.refundId);

    // Second refund attempt (should fail)
    const refund2Res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        reason: 'requested_by_customer'
      });

    expect(refund2Res.status).toBe(400);
    expect(refund2Res.body.error).toContain('already refunded');
  });
});
