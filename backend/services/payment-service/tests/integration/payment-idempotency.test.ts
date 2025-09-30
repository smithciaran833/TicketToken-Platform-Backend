import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../src/services/redisService';

// Import the app from index
const app = require('../../src/index').default;

describe('Payment Idempotency - Integration Tests', () => {
  let authToken: string;
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate test token
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      {
        userId,
        venueId: '11111111-1111-1111-1111-111111111111',
        role: 'admin'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    // Clean up Redis keys after each test
    try {
      const client = RedisService.getClient();
      const keys = await client.keys('idempotency:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.log('Redis cleanup skipped:', err);
    }
  });

  describe('Middleware Enforcement', () => {
    it('should reject payment without idempotency key', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 1000 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_MISSING');
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ amount: 1000 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
    });

    it('should accept valid UUID', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ amount: 1000 });

      // Will fail validation due to missing fields, but idempotency check passed
      expect([400, 500]).toContain(res.status);
      expect(res.body.code).not.toBe('IDEMPOTENCY_KEY_MISSING');
      expect(res.body.code).not.toBe('IDEMPOTENCY_KEY_INVALID');
    });
  });

  describe('Duplicate Prevention', () => {
    it('should return cached validation error for duplicate request', async () => {
      const key = uuidv4();
      const payload = { amount: 1000 }; // Missing required fields

      // First request
      const first = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(first.status).toBe(400);

      // Duplicate request
      const second = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(second.status).toBe(400);
      
      // Should be identical responses
      expect(second.body).toEqual(first.body);
    });
  });

  describe('Redis Cache Verification', () => {
    it('should store idempotency key in Redis', async () => {
      const key = uuidv4();

      await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send({ amount: 1000 });

      // Check Redis
      const redisKey = `idempotency:${userId}:${userId}:${key}`;
      const cached = await RedisService.get(redisKey);

      expect(cached).not.toBeNull();
      
      if (cached) {
        const parsed = JSON.parse(cached);
        expect(parsed).toHaveProperty('statusCode');
        expect(parsed).toHaveProperty('body');
      }
    });
  });
});
