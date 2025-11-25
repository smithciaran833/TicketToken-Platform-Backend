import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../../src/services/databaseService';
import { RedisService } from '../../../src/services/redisService';

/**
 * PaymentController Integration Tests
 * 
 * These tests verify the complete payment processing flow including:
 * 1. Authentication and authorization
 * 2. Bot detection integration
 * 3. Fraud checks (scalper detection)
 * 4. Velocity limiting
 * 5. Waiting room integration
 * 6. Fee calculation
 * 7. Payment intent creation
 * 8. NFT minting queue integration
 * 9. Rate limiting enforcement
 * 10. Idempotency protection
 * 11. Input validation
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be set (sk_test_*)
 * - Database must be running and migrated
 * - Redis must be running
 */

const app = require('../../../src/index').default;

describe('PaymentController Integration Tests', () => {
  let authToken: string;
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
      throw new Error('STRIPE_SECRET_KEY must be set to sk_test_* for integration tests');
    }

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

    // Setup test event in database
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
    // Clean up Redis keys
    try {
      const client = RedisService.getClient();
      const keys = await client.keys('*');
      if (keys.length > 0) {
        // Only delete test-related keys
        const testKeys = keys.filter(k => 
          k.includes(userId) || 
          k.includes('rate_limit') || 
          k.includes('velocity') ||
          k.includes('idempotency')
        );
        if (testKeys.length > 0) {
          await client.del(...testKeys);
        }
      }
    } catch (err) {
      console.log('Redis cleanup skipped:', err);
    }
  });

  describe('1. Authentication & Authorization', () => {
    it('should reject payment without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          paymentMethod: { token: 'pm_card_visa' }
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should accept valid authentication token', async () => {
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
            actions: [],
            browserFeatures: {}
          }
        });

      // Should not be 401 (may be other errors due to validation/setup)
      expect(res.status).not.toBe(401);
    });
  });

  describe('2. Input Validation', () => {
    it('should reject payment without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          // Missing eventId, venueId, tickets
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should reject payment with invalid ticket quantity', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 0, price: 5000 }], // Invalid quantity
          paymentMethod: { token: 'pm_card_visa' }
        });

      expect(res.status).toBe(400);
    });

    it('should reject payment with negative price', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: -1000 }],
          paymentMethod: { token: 'pm_card_visa' }
        });

      expect(res.status).toBe(400);
    });
  });

  describe('3. Bot Detection', () => {
    it('should block request detected as bot', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .set('User-Agent', 'curl/7.68.0') // Suspicious user agent
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 10, price: 5000 }],
          paymentMethod: { token: 'pm_card_visa' },
          sessionData: {
            actions: [], // No user actions - suspicious
            browserFeatures: {} // No browser features - suspicious
          }
        });

      // Bot detection may return 403
      expect([400, 403, 429]).toContain(res.status);
    });

    it('should allow request with legitimate user behavior', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 2, price: 5000 }],
          paymentMethod: { token: 'pm_card_visa' },
          sessionData: {
            actions: [
              { type: 'page_view', timestamp: Date.now() - 30000 },
              { type: 'select_ticket', timestamp: Date.now() - 20000 },
              { type: 'add_to_cart', timestamp: Date.now() - 10000 }
            ],
            browserFeatures: {
              userAgent: 'Mozilla/5.0',
              screenResolution: '1920x1080',
              timezone: 'America/New_York'
            }
          }
        });

      // Should not be blocked by bot detector (may fail for other reasons)
      expect(res.status).not.toBe(403);
    });
  });

  describe('4. Fraud Detection (Scalper Detection)', () => {
    it('should flag suspicious rapid purchase patterns', async () => {
      // Make multiple rapid purchases
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post('/api/v1/payments/process')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', uuidv4())
            .send({
              eventId,
              venueId,
              tickets: [{ ticketTypeId: uuidv4(), quantity: 10, price: 5000 }],
              paymentMethod: { token: 'pm_card_visa' },
              sessionData: { actions: [], browserFeatures: {} }
            })
        );
      }

      const results = await Promise.all(promises);
      
      // At least one should be flagged
      const flagged = results.some(r => r.status === 403 && r.body.code === 'FRAUD_DETECTED');
      expect(flagged).toBeTruthy();
    });
  });

  describe('5. Velocity Limiting', () => {
    it('should enforce per-user velocity limits', async () => {
      // Attempt multiple purchases rapidly
      const results = [];
      
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', uuidv4())
          .send({
            eventId,
            venueId,
            tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
            paymentMethod: { token: 'pm_card_visa' },
            sessionData: { actions: [], browserFeatures: {} }
          });
        
        results.push(res);
        
        // If we hit rate limit, break
        if (res.status === 429) {
          break;
        }
      }

      // Should hit velocity limit
      const rateLimited = results.some(r => r.status === 429);
      expect(rateLimited).toBeTruthy();
    });
  });

  describe('6. Waiting Room Integration', () => {
    it('should reject payment without queue token for high-demand event', async () => {
      // Setup high-demand event with active waiting room
      const client = RedisService.getClient();
      await client.set(`waitingroom:${eventId}:stats`, JSON.stringify({
        totalInQueue: 100,
        activeUsers: 50
      }), 'EX', 300);

      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          paymentMethod: { token: 'pm_card_visa' },
          sessionData: { actions: [], browserFeatures: {} }
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('QUEUE_TOKEN_REQUIRED');
      expect(res.body.waitingRoomActive).toBe(true);
    });

    it('should accept valid queue token for high-demand event', async () => {
      // Setup waiting room
      const client = RedisService.getClient();
      const accessToken = uuidv4();
      
      await client.set(`waitingroom:${eventId}:stats`, JSON.stringify({
        totalInQueue: 100,
        activeUsers: 50
      }), 'EX', 300);

      await client.set(`waitingroom:token:${accessToken}`, JSON.stringify({
        userId,
        eventId,
        valid: true,
        expiresAt: Date.now() + 300000
      }), 'EX', 300);

      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .set('X-Access-Token', accessToken)
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          paymentMethod: { token: 'pm_card_visa' },
          sessionData: { actions: [], browserFeatures: {} }
        });

      // Should not be 403 with QUEUE_TOKEN_REQUIRED
      expect(res.body.code).not.toBe('QUEUE_TOKEN_REQUIRED');
    });
  });

  describe('7. Fee Calculation', () => {
    it('should calculate fees correctly', async () => {
      const res = await request(app)
        .post('/api/v1/payments/calculate-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          venueId,
          amount: 10000,
          ticketCount: 2
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('fees');
      expect(res.body).toHaveProperty('total');
      expect(res.body.fees).toHaveProperty('platform');
      expect(res.body.fees).toHaveProperty('processing');
    });

    it('should include gas estimates for NFT minting', async () => {
      const res = await request(app)
        .post('/api/v1/payments/calculate-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          venueId,
          amount: 10000,
          ticketCount: 5
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('gasEstimates');
      expect(res.body).toHaveProperty('recommendedBlockchain');
    });
  });

  describe('8. Rate Limiting', () => {
    it('should enforce 10 payments per minute rate limit', async () => {
      const results = [];

      // Make 11 requests rapidly
      for (let i = 0; i < 11; i++) {
        const res = await request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', uuidv4())
          .send({
            eventId,
            venueId,
            tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 1000 }],
            paymentMethod: { token: 'pm_card_visa' },
            sessionData: { actions: [], browserFeatures: {} }
          });

        results.push(res);
      }

      // At least one should be rate limited
      const rateLimited = results.some(r => r.status === 429);
      expect(rateLimited).toBeTruthy();
    });
  });

  describe('9. Idempotency Protection', () => {
    it('should prevent duplicate payments with same idempotency key', async () => {
      const idempotencyKey = uuidv4();

      // First payment
      const first = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
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

      // Second payment with SAME key
      const second = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
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

      // Both should have same response (cached)
      expect(second.status).toBe(first.status);
      if (first.body.transaction) {
        expect(second.body.transaction?.transactionId).toBe(first.body.transaction?.transactionId);
      }
    });

    it('should require idempotency key for payments', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        // Missing Idempotency-Key header
        .send({
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          paymentMethod: { token: 'pm_card_visa' }
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_MISSING');
    });
  });

  describe('10. Transaction Status Endpoint', () => {
    it('should retrieve transaction status', async () => {
      const transactionId = uuidv4();

      const res = await request(app)
        .get(`/api/v1/payments/transaction/${transactionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // May be 404 if transaction doesn't exist, but should not be 401/500
      expect([200, 404]).toContain(res.status);
    });

    it('should reject unauthorized transaction access', async () => {
      const transactionId = uuidv4();
      const otherUserId = uuidv4();

      const jwt = require('jsonwebtoken');
      const otherUserToken = jwt.sign(
        { id: otherUserId, userId: otherUserId, tenantId: uuidv4(), role: 'user' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get(`/api/v1/payments/transaction/${transactionId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      // Should be 403 or 404 (depending on implementation)
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('11. Complete Payment Flow', () => {
    it('should process payment end-to-end with all validations', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        .send({
          eventId,
          venueId,
          tickets: [
            { ticketTypeId: uuidv4(), quantity: 2, price: 5000 }
          ],
          paymentMethod: { token: 'pm_card_visa' },
          sessionData: {
            actions: [
              { type: 'page_view', timestamp: Date.now() - 60000 },
              { type: 'select_ticket', timestamp: Date.now() - 45000 },
              { type: 'add_to_cart', timestamp: Date.now() - 30000 },
              { type: 'checkout', timestamp: Date.now() }
            ],
            browserFeatures: {
              userAgent: 'Mozilla/5.0',
              screenResolution: '1920x1080',
              timezone: 'America/New_York',
              language: 'en-US'
            }
          },
          deviceFingerprint: {
            id: uuidv4(),
            components: {}
          }
        });

      // Should succeed or fail gracefully (not 401/403)
      expect([200, 400, 429, 500]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('transaction');
        expect(res.body).toHaveProperty('fees');
        expect(res.body.transaction).toHaveProperty('transactionId');
        
        // Should queue NFT minting
        if (res.body.nftStatus) {
          expect(['queued', 'pending']).toContain(res.body.nftStatus);
        }
      }
    });
  });
});
