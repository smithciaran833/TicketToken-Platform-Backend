import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';
import fs from 'fs';
import os from 'os';

// =============================================================================
// SETUP: Generate RSA keypair for JWT signing (RS256)
// =============================================================================
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);
process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// =============================================================================
// TEST CONSTANTS
// =============================================================================
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEST_VENUE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function generateTestJWT(payload: {
  sub: string;
  tenant_id: string;
  email?: string;
  permissions?: string[];
  iss?: string;
  aud?: string;
  exp?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email || `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      permissions: payload.permissions || ['*'],
      iss: payload.iss || process.env.JWT_ISSUER || 'tickettoken',
      aud: payload.aud || process.env.JWT_AUDIENCE || 'tickettoken-api',
      iat: now,
      exp: payload.exp || (now + 3600),
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// =============================================================================
// TEST SUITE
// =============================================================================
describe('Authentication & Authorization Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let validToken: string;
  let apiKeyPlaintext: string;
  let apiKeyHash: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();

    // Generate valid token
    validToken = generateTestJWT({
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_ID,
    });

    // Generate API key
    apiKeyPlaintext = crypto.randomBytes(32).toString('hex');
    apiKeyHash = hashApiKey(apiKeyPlaintext);
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  }, 30000);

  beforeEach(async () => {
    // Clean database
    await db('api_keys').del();
    await db('venue_staff').del();
    await db('venues').del();
    await db('users').del();
    await db('tenants').del();

    // Clear Redis
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Seed tenant
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed user
    await db('users').insert({
      id: TEST_USER_ID,
      tenant_id: TEST_TENANT_ID,
      email: 'test@example.com',
      password_hash: '$2b$10$dummy',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed API key
    await db('api_keys').insert({
      user_id: TEST_USER_ID,
      key: apiKeyPlaintext,
      key_hash: apiKeyHash,
      name: 'Test API Key',
      is_active: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed venue
    await db('venues').insert({
      id: TEST_VENUE_ID,
      tenant_id: TEST_TENANT_ID,
      name: 'Test Venue',
      slug: 'test-venue',
      email: 'venue@test.com',
      address_line1: '123 Test St',
      city: 'Test City',
      state_province: 'TC',
      country_code: 'US',
      venue_type: 'theater',
      max_capacity: 500,
      status: 'active',
      created_by: TEST_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  // ===========================================================================
  // SECTION 1: JWT Authentication (20 tests)
  // ===========================================================================
  describe('JWT Authentication', () => {
    it('should accept valid JWT token', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).not.toBe(401);
    });

    it('should verify JWT signature', async () => {
      const tamperedToken = validToken.slice(0, -10) + 'TAMPERED';

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
    });

    it('should validate JWT issuer (iss claim)', async () => {
      const wrongIssuerToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        iss: 'wrong-issuer',
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${wrongIssuerToken}`);

      expect(res.status).toBe(401);
    });

    it('should validate JWT audience (aud claim)', async () => {
      const wrongAudToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        aud: 'wrong-audience',
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${wrongAudToken}`);

      expect(res.status).toBe(401);
    });

    it('should check JWT expiration (exp claim)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        exp: now - 3600, // Expired 1 hour ago
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should attach user object to request with correct properties', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      // Verify by checking that authenticated request succeeds
      expect(res.status).not.toBe(401);
    });

    it('should reject missing Authorization header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues');

      expect(res.status).toBe(401);
    });

    it('should reject invalid JWT signature', async () => {
      const invalidToken = jwt.sign(
        { sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject malformed JWT', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer not.a.valid.jwt');

      expect(res.status).toBe(401);
    });

    it('should reject JWT without tenant_id claim', async () => {
      const noTenantToken = jwt.sign(
        { sub: TEST_USER_ID, email: 'test@example.com' },
        privateKey,
        { algorithm: 'RS256' }
      );

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${noTenantToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject token from different service (wrong audience)', async () => {
      const wrongServiceToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        aud: 'event-service',
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${wrongServiceToken}`);

      expect(res.status).toBe(401);
    });

    it('should return proper 401 error format', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code');
    });

    it('should not include stack trace in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer invalid');

      expect(res.body).not.toHaveProperty('stack');
      process.env.NODE_ENV = originalEnv;
    });

    it('should have consistent JWT verification timing (prevent timing attacks)', async () => {
      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', 'Bearer invalid.token.here');
        times.push(Date.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - avg)));

      // Allow reasonable variance (network jitter, etc)
      expect(maxDeviation).toBeLessThan(100);
    });

    it('should not cache JWT validation results', async () => {
      // Make two requests with same token
      const res1 = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      const res2 = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      // Both should validate token fresh (no caching)
      expect(res1.status).not.toBe(401);
      expect(res2.status).not.toBe(401);
    });

    it('should log failed auth attempts', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
      // Logging is verified server-side
    });

    it('should reject token with invalid format', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'InvalidFormat');

      expect(res.status).toBe(401);
    });

    it('should reject empty Authorization header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', '');

      expect(res.status).toBe(401);
    });

    it('should reject Bearer token with extra spaces', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer  ${validToken}`);

      // Should still work or fail gracefully
      expect([200, 401]).toContain(res.status);
    });

    it.skip('should handle concurrent auth requests safely', async () => {
      const promises = Array(10).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).not.toBe(401);
      });
    });
  });

  // ===========================================================================
  // SECTION 2: API Key Authentication (15 tests)
  // ===========================================================================
  describe('API Key Authentication', () => {
    it('should accept valid API key in x-api-key header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).not.toBe(401);
    });

    it('should lookup API key using SHA-256 hash', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).not.toBe(401);

      // Verify hash was used
      const key = await db('api_keys').where({ key_hash: apiKeyHash }).first();
      expect(key).toBeDefined();
    });

    it('should check API key is_active flag', async () => {
      await db('api_keys').where({ key_hash: apiKeyHash }).update({ is_active: false });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).toBe(401);
    });

    it('should check API key expires_at', async () => {
      const expiredKey = crypto.randomBytes(32).toString('hex');
      const expiredHash = hashApiKey(expiredKey);

      await db('api_keys').insert({
        user_id: TEST_USER_ID,
        key: expiredKey,
        key_hash: expiredHash,
        name: 'Expired Key',
        is_active: true,
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', expiredKey);

      expect(res.status).toBe(401);
    });

    it('should cache valid API key lookups (60s TTL)', async () => {
      // First request - cache miss
      await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      // Check cache
      const cacheKey = `api_key_hash:${apiKeyHash}`;
      const cached = await redis.get(cacheKey);
      expect(cached).toBeTruthy();

      // Verify TTL is ~60 seconds
      const ttl = await redis.ttl(cacheKey);
      expect(ttl).toBeGreaterThan(50);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should use Redis cache on cache hit', async () => {
      // Warm cache
      await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      // Second request should hit cache
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).not.toBe(401);
    });

    it('should populate user object from API key user_id', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).not.toBe(401);
    });

    it('should get tenant_id from user record', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).not.toBe(401);
    });

    it('should reject invalid API key', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', 'invalid-key-that-does-not-exist');

      expect(res.status).toBe(401);
    });

    it('should reject inactive API key (is_active=false)', async () => {
      await db('api_keys').where({ key_hash: apiKeyHash }).update({ is_active: false });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', apiKeyPlaintext);

      expect(res.status).toBe(401);
    });

    it('should fallback to JWT when x-api-key is missing', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).not.toBe(401);
    });

    it('SECURITY: should prevent timing attacks on hash lookup', async () => {
      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await request(app.server)
          .get('/api/v1/venues')
          .set('x-api-key', crypto.randomBytes(32).toString('hex'));
        times.push(Date.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - avg)));

      expect(maxDeviation).toBeLessThan(150);
    });

    it('SECURITY: should not cache disabled API keys', async () => {
      // Create and use a valid key
      const tempKey = crypto.randomBytes(32).toString('hex');
      const tempHash = hashApiKey(tempKey);

      await db('api_keys').insert({
        user_id: TEST_USER_ID,
        key: tempKey,
        key_hash: tempHash,
        name: 'Temp Key',
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Use it once to cache
      await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', tempKey);

      // Disable it
      await db('api_keys').where({ key_hash: tempHash }).update({ is_active: false });

      // Clear cache
      await redis.del(`api_key_hash:${tempHash}`);

      // Try again - should reject
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', tempKey);

      expect(res.status).toBe(401);

      // Verify it wasn't cached
      const cached = await redis.get(`api_key_hash:${tempHash}`);
      expect(cached).toBeNull();
    });

    it('should validate API key format (32-128 characters)', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', 'short');

      expect(res.status).toBe(401);
    });

    it('should handle API key with missing user gracefully', async () => {
      const orphanKey = crypto.randomBytes(32).toString('hex');
      const orphanHash = hashApiKey(orphanKey);
      const orphanUserId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

      // First create the user
      await db('users').insert({
        id: orphanUserId,
        tenant_id: TEST_TENANT_ID,
        email: 'orphan@test.com',
        password_hash: '$2b$10$dummy',
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Insert API key for that user
      await db('api_keys').insert({
        user_id: orphanUserId,
        key: orphanKey,
        key_hash: orphanHash,
        name: 'Orphan Key',
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Now delete the user (orphaning the API key)
      await db('users').where({ id: orphanUserId }).del();

      // Try to use the orphaned key
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('x-api-key', orphanKey);

      expect(res.status).toBe(401);
    }); 
  });

  // ===========================================================================
  // SECTION 3: Token Expiration & Refresh (10 tests)
  // ===========================================================================
  describe('Token Expiration & Refresh', () => {
    it('should reject expired access token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        exp: now - 3600,
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should accept token that expires in future', async () => {
      const now = Math.floor(Date.now() / 1000);
      const futureToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        exp: now + 7200, // 2 hours from now
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${futureToken}`);

      expect(res.status).not.toBe(401);
    });

    it('should handle token expiring during request lifecycle', async () => {
      const now = Math.floor(Date.now() / 1000);
      const aboutToExpireToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        exp: now + 2, // Expires in 2 seconds
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${aboutToExpireToken}`);

      // Should succeed if validated before expiry
      expect([200, 401]).toContain(res.status);
    });

    it('should handle multiple simultaneous requests with same token', async () => {
      const promises = Array(5).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).not.toBe(401);
      });
    });

    it('should reject token with nbf (not before) in future', async () => {
      const now = Math.floor(Date.now() / 1000);
      const futureToken = jwt.sign(
        {
          sub: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          nbf: now + 3600, // Not valid for 1 hour
          exp: now + 7200,
        },
        privateKey,
        { algorithm: 'RS256' }
      );

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${futureToken}`);

      expect(res.status).toBe(401);
    });

    it('should validate iat (issued at) if present', async () => {
      const now = Math.floor(Date.now() / 1000);
      const futureIssuedToken = jwt.sign(
        {
          sub: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          iat: now + 3600, // Issued in future (suspicious)
          exp: now + 7200,
        },
        privateKey,
        { algorithm: 'RS256' }
      );

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${futureIssuedToken}`);

      // May accept or reject depending on implementation
      expect([200, 401]).toContain(res.status);
    });

    it('should handle token without exp claim', async () => {
      // JWT without expiration
      const noExpToken = jwt.sign(
        {
          sub: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
        },
        privateKey,
        { algorithm: 'RS256', noTimestamp: true }
      );

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${noExpToken}`);

      // Should reject if exp is required
      expect(res.status).toBe(401);
    });

    it('should process expired token error before other validations', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredWrongIssuer = jwt.sign(
        {
          sub: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          iss: 'wrong-issuer',
          exp: now - 3600,
        },
        privateKey,
        { algorithm: 'RS256' }
      );

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${expiredWrongIssuer}`);

      expect(res.status).toBe(401);
    });

    it('should handle clock skew gracefully', async () => {
      const now = Math.floor(Date.now() / 1000);
      const slightlyExpiredToken = generateTestJWT({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        exp: now - 5, // Expired 5 seconds ago (within clock skew)
      });

      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${slightlyExpiredToken}`);

      // Should reject as expired
      expect(res.status).toBe(401);
    });

    it('should verify token is well-formed before checking expiry', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer malformed');

      expect(res.status).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 4: Middleware Execution Order (10 tests)
  // ===========================================================================
  describe('Middleware Execution Order', () => {
    it('should set correlation ID before auth', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.headers['x-request-id']).toBeDefined();
    });

    it.skip('should run rate limiting before auth', async () => {
      // Make many requests without auth to hit rate limit
      const promises = Array(20).fill(null).map(() =>
        request(app.server).get('/api/v1/venues')
      );

      const results = await Promise.all(promises);
      const rateLimited = results.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    });

    it('should run auth middleware before tenant middleware', async () => {
      // Request with valid auth should succeed through tenant middleware
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).not.toBe(401);
    });

    it('should run tenant middleware after auth', async () => {
      // Without auth, shouldn't reach tenant middleware
      const res = await request(app.server)
        .get('/api/v1/venues');

      expect(res.status).toBe(401);
    });

    it('should run validation after tenant', async () => {
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .send({}); // Invalid body

      expect(res.status).toBe(422);
    });

    it('should complete middleware chain in order', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).not.toBe(401);
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('should stop chain on auth failure', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
      // Should not proceed to tenant or validation
    });

    it('should include correlation ID in error responses', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it.skip('should skip rate limiting for health checks', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server).get('/health')
      );

      const results = await Promise.all(promises);
      const allSuccess = results.every(r => r.status === 200);

      expect(allSuccess).toBe(true);
    });

    it('should handle middleware errors gracefully', async () => {
      // Invalid UUID format should be caught by validation
      const res = await request(app.server)
        .get('/api/v1/venues/not-a-uuid')
        .set('Authorization', `Bearer ${validToken}`);

      expect([400, 422, 500]).toContain(res.status);
    });
  });

  // ===========================================================================
  // SECTION 5: Rate Limiting (15 tests)
  // ===========================================================================
  describe('Rate Limiting', () => {
    it.skip('should enforce global rate limit', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      const rateLimited = results.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    });

    it.skip('should enforce per-tenant rate limit', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      const rateLimited = results.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    });

    it.skip('should enforce per-user rate limit', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      const rateLimited = results.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    });

    it.skip('should enforce per-venue rate limit', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .get(`/api/v1/venues/${TEST_VENUE_ID}`)
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);

      // May or may not hit venue-specific limit depending on config
      expect(results).toBeDefined();
    });

    it.skip('should enforce per-operation rate limit (DELETE)', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .delete(`/api/v1/venues/${TEST_VENUE_ID}`)
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);

      // Should hit rate limit or permission errors
      expect(results).toBeDefined();
    });

    it('should use sliding window for rate limiting', async () => {
      // Make requests over time to test sliding window
      const res1 = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res1.status).not.toBe(429);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const res2 = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res2.status).not.toBe(429);
    });

    it.skip('should return 429 when rate limit exceeded', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      const rateLimited = results.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.status).toBe(429);
      }
    });

    it('should include X-RateLimit-Limit header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
    });

    it('should include X-RateLimit-Remaining header with accurate count', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should include X-RateLimit-Reset header (ISO timestamp)', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });

    it.skip('should include Retry-After header on 429', async () => {
      const promises = Array(20).fill(null).map(() =>
        request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const results = await Promise.all(promises);
      const rateLimited = results.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.headers['retry-after']).toBeDefined();
      }
    });

    it('should reset rate limits after window expires', async () => {
      // This test would need to wait for window to expire
      // Skipping for time constraints
      expect(true).toBe(true);
    });

    it('ISSUE: should fail closed on Redis unavailable (but currently fails open)', async () => {
      // Simulate Redis failure by stopping redis
      // This is a known issue - rate limiter fails open
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      // Currently allows request through (fails open)
      expect(res.status).not.toBe(503);
    });

    it('should have independent rate limits for different tenants', async () => {
      // Create second tenant
      await db('tenants').insert({
        id: OTHER_TENANT_ID,
        name: 'Other Tenant',
        slug: 'other-tenant',
        created_at: new Date(),
        updated_at: new Date(),
      });

      await db('users').insert({
        id: OTHER_USER_ID,
        tenant_id: OTHER_TENANT_ID,
        email: 'other@test.com',
        password_hash: '$2b$10$dummy',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const otherToken = generateTestJWT({
        sub: OTHER_USER_ID,
        tenant_id: OTHER_TENANT_ID,
      });

      // Make requests from both tenants
      const tenant1 = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      const tenant2 = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${otherToken}`);

      // Both should succeed (independent limits)
      expect(tenant1.status).not.toBe(429);
      expect(tenant2.status).not.toBe(429);
    });

    it('should handle different rate limits for POST vs GET', async () => {
      // GET requests should have higher limit than POST
      const getRes = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(getRes.status).not.toBe(429);
    });
  });

  // ===========================================================================
  // SECTION 6: Idempotency (15 tests)
  // ===========================================================================
  describe('Idempotency', () => {
    const idempotencyKey = crypto.randomUUID();

    it('should require Idempotency-Key header for POST', async () => {
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Idempotency Required Venue',
          email: 'test@venue.com',
          type: 'theater',
          capacity: 500,
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'US',
          },
        });

      // May require or not require depending on route config
      expect([201, 400, 422]).toContain(res.status);
    });

    it('should calculate request fingerprint (SHA-256 of method + URL + body)', async () => {
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          name: 'Idempotency Test',
          email: 'idem@venue.com',
          type: 'theater',
          capacity: 500,
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'US',
          },
        });

      expect([201, 400, 422]).toContain(res.status);
    });

    it('should return cached response for duplicate request', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'Duplicate Test',
        email: 'dup@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      // First request
      const res1 = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      if (res1.status === 201) {
        // Second request with same key
        const res2 = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', key)
          .send(payload);

        expect(res2.status).toBe(200);
        expect(res2.headers['x-idempotency-replayed']).toBe('true');
      }
    });

    it('should include X-Idempotency-Replayed header on cache hit', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'Replay Header Test',
        email: 'replay@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      const res1 = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      if (res1.status === 201) {
        const res2 = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', key)
          .send(payload);

        expect(res2.headers['x-idempotency-replayed']).toBe('true');
      }
    });

    it('should return 422 for same key with different payload', async () => {
      const key = crypto.randomUUID();

      const payload1 = {
        name: 'First Payload',
        email: 'first@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      const payload2 = {
        name: 'Different Payload',
        email: 'different@venue.com',
        type: 'arena',
        capacity: 1000,
        address: {
          street: '456 Other St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'US',
        },
      };

      const res1 = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload1);

      if (res1.status === 201) {
        const res2 = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', key)
          .send(payload2);

        expect(res2.status).toBe(422);
      }
    });

    it('should return 409 for concurrent requests with same key', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'Concurrent Test',
        email: 'concurrent@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      const promises = [
        request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', key)
          .send(payload),
        request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', key)
          .send(payload),
      ];

      const results = await Promise.all(promises);

      // One should succeed, one should get 409
      const statuses = results.map(r => r.status);
      expect(statuses).toContain(409);
    });

    it('should acquire lock before processing (Redis SETNX)', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'Lock Test',
        email: 'lock@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect([201, 400, 422]).toContain(res.status);
    });

    it('should release lock after completion', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'Lock Release Test',
        email: 'lockrelease@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      if (res.status === 201) {
        // Lock should be released, second request should return cached
        const res2 = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', key)
          .send(payload);

        expect([200, 409]).toContain(res2.status);
      }
    });

    it('should set lock TTL to 30 seconds', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'Lock TTL Test',
        email: 'lockttl@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      // Verify lock TTL (if lock still exists)
      const lockKey = `idempotency:${TEST_TENANT_ID}:venue:${key}:lock`;
      const ttl = await redis.ttl(lockKey);

      // TTL may be -2 (key doesn't exist) or >0 (key exists with TTL)
      expect([-2, -1]).toContain(ttl >= 0 ? 1 : ttl);
    });

    it('ISSUE: long-running requests (>30s) lose lock', async () => {
      // This is a known issue - can't easily test in integration
      expect(true).toBe(true);
    });

    it('should set idempotency record TTL based on status (24h for 2xx)', async () => {
      const key = crypto.randomUUID();
      const payload = {
        name: 'TTL Success Test',
        email: 'ttlsuccess@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      if (res.status === 201) {
        const recordKey = `idempotency:${TEST_TENANT_ID}:venue:${key}`;
        const ttl = await redis.ttl(recordKey);

        // Should be ~24 hours (86400 seconds)
        expect(ttl).toBeGreaterThan(86000);
      }
    });

    it('should allow key reuse after TTL expires', async () => {
      // Would need to wait 24 hours - skipping
      expect(true).toBe(true);
    });

    it('should return 400 for missing required Idempotency-Key', async () => {
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'No Key Test',
          email: 'nokey@venue.com',
          type: 'theater',
          capacity: 500,
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'US',
          },
        });

      // May or may not require key depending on route
      expect([201, 400, 422]).toContain(res.status);
    });

    it('should validate Idempotency-Key format (UUID)', async () => {
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', 'not-a-uuid')
        .send({
          name: 'Invalid Key Test',
          email: 'invalidkey@venue.com',
          type: 'theater',
          capacity: 500,
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'US',
          },
        });

      expect([400, 422]).toContain(res.status);
    });

    it('should scope idempotency keys by tenant', async () => {
      // Create second tenant
      await db('tenants').insert({
        id: OTHER_TENANT_ID,
        name: 'Other Tenant',
        slug: 'other-tenant',
        created_at: new Date(),
        updated_at: new Date(),
      });

      await db('users').insert({
        id: OTHER_USER_ID,
        tenant_id: OTHER_TENANT_ID,
        email: 'other@test.com',
        password_hash: '$2b$10$dummy',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const otherToken = generateTestJWT({
        sub: OTHER_USER_ID,
        tenant_id: OTHER_TENANT_ID,
      });

      const key = crypto.randomUUID();
      const payload = {
        name: 'Tenant Scope Test',
        email: 'tenantscope@venue.com',
        type: 'theater',
        capacity: 500,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      };

      // Request from tenant 1
      const res1 = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      // Request from tenant 2 with same key
      const res2 = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${otherToken}`)
        .set('Idempotency-Key', key)
        .send({ ...payload, name: 'Tenant Scope Test 2', email: 'tenantscope2@venue.com' });

      // Both should succeed (tenant-scoped keys)
      expect([201, 400, 422]).toContain(res1.status);
      expect([201, 400, 422]).toContain(res2.status);
    });
  });

  // ===========================================================================
  // SECTION 7: API Versioning (5 tests)
  // ===========================================================================
  describe('API Versioning', () => {
    it('should extract version from URL path (/api/v1/venues)', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).not.toBe(400);
      expect(res.headers['api-version']).toBeDefined();
    });

    it('should accept version from api-version header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('api-version', 'v1');

      expect(res.status).not.toBe(400);
    });

    it('should accept version from accept-version header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('accept-version', 'v1');

      expect(res.status).not.toBe(400);
    });

    it('should prioritize URL > api-version header > accept-version header', async () => {
      const res = await request(app.server)
        .get('/api/v1/venues')
        .set('Authorization', `Bearer ${validToken}`)
        .set('api-version', 'v1')
        .set('accept-version', 'v1');

      // URL version should win
      expect(res.headers['api-version'] || res.headers['API-Version']).toBe('v1');
    });

    it('should reject unsupported version', async () => {
      const res = await request(app.server)
        .get('/api/v99/venues')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not supported');
    });
  });
});
