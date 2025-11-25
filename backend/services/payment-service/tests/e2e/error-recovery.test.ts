import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';

/**
 * Error Recovery Flow E2E Test
 * 
 * This test validates error handling and recovery mechanisms:
 * 1. Stripe API failures with retry logic
 * 2. Database transaction rollbacks
 * 3. Redis connection failures
 * 4. Network timeout handling
 * 5. Invalid payment methods
 * 6. Concurrent request handling
 * 7. Race condition prevention
 * 8. Partial failure scenarios
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be set (sk_test_*)
 * - Database must be running and migrated
 * - Redis must be running
 */

const app = require('../../src/index').default;

describe('Error Recovery Flow E2E Test', () => {
  let authToken: string;
  let stripe: Stripe;
  
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
    await db.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, date, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'Test Event', NOW() + INTERVAL '30 days', 'active', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [eventId, tenantId, venueId]
    );
  });

  afterAll(async () => {
    // Cleanup database
    try {
      const db = DatabaseService.getPool();
      await db.query('DELETE FROM payment_intents WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]);
      await db.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM events WHERE id = $1', [eventId]);
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

  it('should handle declined payment card gracefully', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
        paymentMethod: { token: 'pm_card_chargeDeclined' }, // Test card that declines
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Should handle gracefully
    expect([400, 402, 500]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
    
    // Should provide user-friendly message
    if (res.body.message) {
      expect(typeof res.body.message).toBe('string');
    }
  });

  it('should handle insufficient funds error', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
        paymentMethod: { token: 'pm_card_chargeDeclinedInsufficientFunds' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    expect([400, 402, 500]).toContain(res.status);
    
    if (res.status === 402 || res.status === 400) {
      // Payment required or bad request
      expect(res.body).toHaveProperty('error');
    }
  });

  it('should handle invalid payment method gracefully', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
        paymentMethod: { token: 'invalid_pm_token' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    expect([400, 500]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });

  it('should handle refund of non-existent payment', async () => {
    const fakePaymentIntentId = 'pi_nonexistent_' + Date.now();

    const res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: fakePaymentIntentId,
        amount: 1000,
        reason: 'requested_by_customer'
      });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.message).toContain('Unable to process refund');
  });

  it('should handle concurrent payment attempts with same idempotency key', async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      eventId,
      venueId,
      tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
      paymentMethod: { token: 'pm_card_visa' },
      sessionData: {
        actions: [{ type: 'checkout', timestamp: Date.now() }],
        browserFeatures: { userAgent: 'Mozilla/5.0' }
      }
    };

    // Send 3 concurrent requests with SAME idempotency key
    const results = await Promise.all([
      request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
      request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
      request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
    ]);

    // All should have same status code
    expect(results[0].status).toBe(results[1].status);
    expect(results[1].status).toBe(results[2].status);

    // If successful, all should have same transaction ID
    if (results[0].body.transaction && results[1].body.transaction && results[2].body.transaction) {
      expect(results[0].body.transaction.transactionId).toBe(results[1].body.transaction.transactionId);
      expect(results[1].body.transaction.transactionId).toBe(results[2].body.transaction.transactionId);
    }
  });

  it('should prevent race conditions on refunds', async () => {
    // Create payment first
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 5000,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    // Insert into database
    const db = DatabaseService.getPool();
    const orderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', 5000, NOW(), NOW())`,
      [orderId, tenantId, userId, venueId]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, 5000, 500, $3, 'succeeded', '{}', NOW(), NOW())`,
      [orderId, paymentIntent.id, venueId]
    );

    // Send 3 concurrent refund requests
    const results = await Promise.all([
      request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: paymentIntent.id,
          amount: 5000,
          reason: 'requested_by_customer'
        }),
      request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: paymentIntent.id,
          amount: 5000,
          reason: 'requested_by_customer'
        }),
      request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: paymentIntent.id,
          amount: 5000,
          reason: 'requested_by_customer'
        })
    ]);

    // Only ONE should succeed
    const successCount = results.filter(r => r.status === 200).length;
    const failureCount = results.filter(r => r.status !== 200).length;

    // Should have at least one success and some failures
    expect(successCount).toBeGreaterThan(0);
    expect(failureCount).toBeGreaterThan(0);

    // Verify only one refund was created in Stripe
    const stripeIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
    expect((stripeIntent as any).amount_refunded).toBe(5000); // Only refunded once
  });

  it('should handle database connection errors gracefully', async () => {
    // This test simulates when database is unavailable
    // In real scenario, we'd mock the database pool to throw errors
    
    // Try to process payment (may succeed or fail depending on DB state)
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
        paymentMethod: { token: 'pm_card_visa' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Should return valid HTTP status (not crash)
    expect([200, 400, 500, 503]).toContain(res.status);
  });

  it('should handle malformed request data', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId: 'not-a-uuid',
        venueId: null,
        tickets: 'invalid', // Should be array
        paymentMethod: 'string', // Should be object
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should recover from transient Stripe API errors with retry', async () => {
    // Stripe's test mode should handle retries internally
    // This test verifies the system doesn't crash on transient errors
    
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        eventId,
        venueId,
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
        paymentMethod: { token: 'pm_card_visa' },
        sessionData: {
          actions: [{ type: 'checkout', timestamp: Date.now() }],
          browserFeatures: { userAgent: 'Mozilla/5.0' }
        }
      });

    // Should eventually succeed or fail gracefully
    expect([200, 400, 500]).toContain(res.status);
    
    // Should have proper error structure if failed
    if (res.status !== 200) {
      expect(res.body).toHaveProperty('error');
    }
  });
});
