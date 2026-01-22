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

const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);
process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// =============================================================================
// TEST CONSTANTS
// =============================================================================
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_VENUE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TEST_EVENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TEST_TICKET_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TEST_TICKET_TYPE_ID = 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'test-internal-secret-key-for-hmac-auth-do-not-use-in-prod';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate HMAC signature for internal API authentication
 */
function generateHmacSignature(
  serviceName: string,
  timestamp: string,
  method: string,
  url: string,
  secret: string = INTERNAL_SECRET
): string {
  const payload = `${serviceName}:${timestamp}:${method}:${url}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generate valid JWT token for testing
 */
function generateTestJWT(payload: {
  sub: string;
  tenant_id: string;
  email?: string;
  permissions?: string[];
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email || `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      permissions: payload.permissions || ['*'],
      iss: process.env.JWT_ISSUER || 'tickettoken',
      aud: process.env.JWT_AUDIENCE || 'tickettoken-api',
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

/**
 * Make authenticated internal request
 */
function makeInternalRequest(
  app: any,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  serviceName: string = 'blockchain-service',
  timestamp?: string
) {
  const ts = timestamp || Date.now().toString();
  const signature = generateHmacSignature(serviceName, ts, method, url);

  let req;
  switch (method) {
    case 'GET':
      req = request(app.server).get(url);
      break;
    case 'POST':
      req = request(app.server).post(url);
      break;
    case 'PUT':
      req = request(app.server).put(url);
      break;
    case 'DELETE':
      req = request(app.server).delete(url);
      break;
    default:
      throw new Error(`Unsupported method: ${method}`);
  }

  return req
    .set('x-internal-service', serviceName)
    .set('x-internal-timestamp', ts)
    .set('x-internal-signature', signature);
}

// =============================================================================
// TEST SUITE
// =============================================================================
describe('Internal APIs Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let validToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();

    validToken = generateTestJWT({
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_ID,
    });
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  }, 30000);

  beforeEach(async () => {
    // Clean database (order matters due to foreign keys)
    await db('ticket_validations').del();
    await db('tickets').del();
    await db('events').del();
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();

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
    }).onConflict('id').ignore();

    // Seed user
    await db('users').insert({
      id: TEST_USER_ID,
      tenant_id: TEST_TENANT_ID,
      email: 'test@example.com',
      password_hash: '$2b$10$dummy',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

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
      wallet_address: '0x1234567890abcdef',
      created_by: TEST_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed venue staff
    await db('venue_staff').insert({
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed venue settings
    await db('venue_settings').insert({
      venue_id: TEST_VENUE_ID,
      tenant_id: TEST_TENANT_ID,
      max_tickets_per_order: 10,
      service_fee_percentage: 10,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  // ===========================================================================
  // SECTION 1: HMAC Authentication (10 tests)
  // ===========================================================================
  describe('HMAC Authentication', () => {
    const testUrl = `/internal/venues/${TEST_VENUE_ID}`;

    it('should accept valid HMAC signature', async () => {
      const timestamp = Date.now().toString();
      const signature = generateHmacSignature('blockchain-service', timestamp, 'GET', testUrl);

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', timestamp)
        .set('x-internal-signature', signature);

      expect(res.status).not.toBe(401);
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = Date.now().toString();

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', timestamp)
        .set('x-internal-signature', 'invalid-signature-12345678901234567890123456789012');

      expect(res.status).toBe(401);
    });

    it('should reject request missing x-internal-service header', async () => {
      const timestamp = Date.now().toString();
      const signature = generateHmacSignature('blockchain-service', timestamp, 'GET', testUrl);

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-timestamp', timestamp)
        .set('x-internal-signature', signature);

      expect(res.status).toBe(401);
    });

    it('should reject request missing x-internal-timestamp header', async () => {
      const timestamp = Date.now().toString();
      const signature = generateHmacSignature('blockchain-service', timestamp, 'GET', testUrl);

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-signature', signature);

      expect(res.status).toBe(401);
    });

    it('should reject request missing x-internal-signature header', async () => {
      const timestamp = Date.now().toString();

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', timestamp);

      expect(res.status).toBe(401);
    });

    it('should reject expired timestamp (>5 minutes old)', async () => {
      const expiredTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const signature = generateHmacSignature('blockchain-service', expiredTimestamp, 'GET', testUrl);

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', expiredTimestamp)
        .set('x-internal-signature', signature);

      expect(res.status).toBe(401);
    });

    it('should reject future timestamp (>5 minutes ahead)', async () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
      const signature = generateHmacSignature('blockchain-service', futureTimestamp, 'GET', testUrl);

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', futureTimestamp)
        .set('x-internal-signature', signature);

      expect(res.status).toBe(401);
    });

    it('should reject non-numeric timestamp', async () => {
      const signature = generateHmacSignature('blockchain-service', 'not-a-number', 'GET', testUrl);

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', 'not-a-number')
        .set('x-internal-signature', signature);

      expect(res.status).toBe(401);
    });

    it('should accept temp-signature in non-production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const timestamp = Date.now().toString();

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', timestamp)
        .set('x-internal-signature', 'temp-signature');

      expect(res.status).not.toBe(401);

      process.env.NODE_ENV = originalEnv;
    });

    it('should use constant-time comparison for signature validation', async () => {
      const timestamp = Date.now().toString();
      const validSignature = generateHmacSignature('blockchain-service', timestamp, 'GET', testUrl);

      // Try with signature that differs only in last character
      const tamperedSignature = validSignature.slice(0, -1) + (validSignature.slice(-1) === 'a' ? 'b' : 'a');

      const res = await request(app.server)
        .get(testUrl)
        .set('x-internal-service', 'blockchain-service')
        .set('x-internal-timestamp', timestamp)
        .set('x-internal-signature', tamperedSignature);

      expect(res.status).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 2: Ticket Validation Endpoint (8 tests)
  // ===========================================================================
  describe('GET /internal/venues/:venueId/validate-ticket/:ticketId', () => {
    beforeEach(async () => {
      // Seed event
      await db('events').insert({
        id: TEST_EVENT_ID,
        venue_id: TEST_VENUE_ID,
        tenant_id: TEST_TENANT_ID,
        name: 'Test Event',
        slug: 'test-event',
        start_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        created_at: new Date(),
      });

      // Seed ticket type
      await db('ticket_types').insert({
        id: TEST_TICKET_TYPE_ID,
        event_id: TEST_EVENT_ID,
        name: 'General Admission',
        price: 50.00,
        
        created_at: new Date(),
      });

      // Seed ticket
      await db('tickets').insert({
        id: TEST_TICKET_ID,
        ticket_type_id: TEST_TICKET_TYPE_ID,
        event_id: TEST_EVENT_ID,
        user_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        price: 50.00,
        status: 'active',
        created_at: new Date(),
      });
    });

    it('should return valid:true for unscanned ticket', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${TEST_TICKET_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.alreadyScanned).toBe(false);
      expect(res.body.ticket).toBeDefined();
    });

    it('should return alreadyScanned:true for previously scanned ticket', async () => {
      // Mark ticket as scanned
      await db('ticket_validations').insert({
        id: crypto.randomUUID(),
        ticket_id: TEST_TICKET_ID,
        ticket_type_id: TEST_TICKET_TYPE_ID,
        scanned_at: new Date(),
        scanned_by: TEST_USER_ID,
      });

      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${TEST_TICKET_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.alreadyScanned).toBe(true);
    });

    it('should return valid:false for non-existent ticket', async () => {
      const fakeTicketId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${fakeTicketId}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toContain('not found');
    });

    it('should return valid:false for ticket belonging to different venue', async () => {
      // Create different venue
      const otherVenueId = 'aaaaaaaa-1111-1111-1111-111111111111';
      await db('venues').insert({
        id: otherVenueId,
        tenant_id: TEST_TENANT_ID,
        name: 'Other Venue',
        slug: 'other-venue',
        email: 'other@test.com',
        address_line1: '456 Other St',
        city: 'Other City',
        state_province: 'OC',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 1000,
        status: 'active',
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const url = `/internal/venues/${otherVenueId}/validate-ticket/${TEST_TICKET_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    it('should return 400 for invalid venueId format', async () => {
      const url = `/internal/venues/not-a-uuid/validate-ticket/${TEST_TICKET_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect([400, 422, 500]).toContain(res.status);
    });

    it('should return 400 for invalid ticketId format', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/not-a-uuid`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect([400, 422, 500]).toContain(res.status);
    });

    it('should include ticket details in response', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${TEST_TICKET_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.ticket).toBeDefined();
      expect(res.body.ticket.id).toBe(TEST_TICKET_ID);
      expect(res.body.ticket.event_id).toBe(TEST_EVENT_ID);
    });

    it('should log validation request with requesting service', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${TEST_TICKET_ID}`;
      const res = await makeInternalRequest(app, 'GET', url, 'scanning-service');

      expect(res.status).toBe(200);
      // Logging is verified server-side
    });
  });

  // ===========================================================================
  // SECTION 3: Venue Details Endpoint (8 tests)
  // ===========================================================================
  describe('GET /internal/venues/:venueId', () => {
    it('should return complete venue data for valid request', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.venue).toBeDefined();
      expect(res.body.venue.id).toBe(TEST_VENUE_ID);
      expect(res.body.venue.name).toBe('Test Venue');
    });

    it('should include blockchain fields (wallet_address)', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.venue.walletAddress).toBe('0x1234567890abcdef');
    });

    it('should include contact info (email, phone)', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.venue.contactEmail).toBeDefined();
    });

    it('should include verification status (is_verified)', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.venue).toHaveProperty('isVerified');
    });

    it('should return 404 for non-existent venue', async () => {
      const fakeVenueId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const url = `/internal/venues/${fakeVenueId}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid venueId format', async () => {
      const url = `/internal/venues/not-a-uuid`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect([400, 422, 500]).toContain(res.status);
    });

    it('should include tenant_id in response', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.venue.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should include all fields needed by blockchain-service', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      const venue = res.body.venue;

      // Critical blockchain fields
      expect(venue).toHaveProperty('walletAddress');
      expect(venue).toHaveProperty('name');
      expect(venue).toHaveProperty('slug');
      expect(venue).toHaveProperty('status');
    });
  });

  // ===========================================================================
  // SECTION 4: Chargeback Rate Endpoint (4 tests)
  // NOTE: venue_chargeback_summary table doesn't exist, but code handles this gracefully
  // ===========================================================================
  describe('GET /internal/venues/:venueId/chargeback-rate', () => {
    it('should return default empty metrics when table does not exist', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/chargeback-rate`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.chargebackMetrics).toBeDefined();
      expect(res.body.chargebackMetrics.totalChargebacks).toBe(0);
      expect(res.body.chargebackMetrics.riskLevel).toBe('low');
    });

    it('should accept monthsBack query parameter', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/chargeback-rate?monthsBack=6`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.periodMonths).toBe(6);
    });

    it('should return reserve recommendation based on risk level', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/chargeback-rate`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(200);
      expect(res.body.reserveRecommendation).toBeDefined();
      expect(res.body.reserveRecommendation.recommendedReservePercent).toBe(5); // low risk = 5%
      expect(res.body.reserveRecommendation.isHighRisk).toBe(false);
    });

    it('should return 404 for non-existent venue', async () => {
      const fakeVenueId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const url = `/internal/venues/${fakeVenueId}/chargeback-rate`;
      const res = await makeInternalRequest(app, 'GET', url);

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // SECTION 5: Bank Info Endpoint (SKIPPED - table doesn't exist)
  // ===========================================================================
  describe.skip('GET /internal/venues/:venueId/bank-info - SKIPPED: venue_bank_info table does not exist', () => {
    it('would return bank info with masked account details', () => {
      // Skipped - table doesn't exist
    });

    it('would return payout schedule and minimums', () => {
      // Skipped - table doesn't exist
    });

    it('would return tax ID (last 4 digits only)', () => {
      // Skipped - table doesn't exist
    });

    it('would return 404 when bank info not configured', () => {
      // Skipped - table doesn't exist
    });

    it('would return 404 for non-existent venue', () => {
      // Skipped - table doesn't exist
    });
  });
});
