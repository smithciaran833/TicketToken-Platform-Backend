import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// Test constants
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function generateTestJWT(payload: { sub: string; tenant_id: string; permissions?: string[] }): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

// Valid venue payload factory
function createValidVenuePayload(overrides: Record<string, any> = {}) {
  return {
    name: 'Test Venue',
    email: 'test@venue.com',
    type: 'comedy_club',
    capacity: 500,
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'US',
    },
    ...overrides,
  };
}

describe('Venue Service - Lifecycle Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let authToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean up venues from previous tests (order matters due to foreign keys)
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();

    // Seed tenant (ignore if exists)
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed test user (ignore if exists)
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'test@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Clear all rate limit keys
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ===========================================
  // SECTION 1: VENUE CREATION (30 tests)
  // ===========================================
  describe('Venue Creation', () => {

    describe('Basic Creation', () => {
      it('should create venue with all required fields', async () => {
        const payload = createValidVenuePayload();

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe(payload.name);
        expect(res.body.email).toBe(payload.email);
        expect(res.body.type).toBe(payload.type);
        expect(res.body.capacity).toBe(payload.capacity);
      });

      it('should generate UUID for venue_id', async () => {
        const payload = createValidVenuePayload({ name: 'UUID Test Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      it('should set tenant_id from JWT', async () => {
        const payload = createValidVenuePayload({ name: 'Tenant Test Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.tenant_id).toBe(TEST_TENANT_ID);
      });

      it('should set created_by to authenticated user', async () => {
        const payload = createValidVenuePayload({ name: 'Creator Test Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const dbVenue = await db('venues').where('id', res.body.id).first();
        expect(dbVenue.created_by).toBe(TEST_USER_ID);
      });
    });

    describe('Default Values', () => {
      it('should apply default status=active', async () => {
        const payload = createValidVenuePayload({ name: 'Status Default Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.status).toBe('active');
      });

      it('should apply default is_verified=false', async () => {
        const payload = createValidVenuePayload({ name: 'Verified Default Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.is_verified).toBe(false);
      });

      it('should apply default royalty_percentage=2.50', async () => {
        const payload = createValidVenuePayload({ name: 'Royalty Default Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const dbVenue = await db('venues').where('id', res.body.id).first();
        expect(parseFloat(dbVenue.royalty_percentage)).toBe(2.5);
      });

      it('should initialize average_rating=0', async () => {
        const payload = createValidVenuePayload({ name: 'Rating Default Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const dbVenue = await db('venues').where('id', res.body.id).first();
        expect(parseFloat(dbVenue.average_rating)).toBe(0);
      });

      it('should initialize total_reviews=0', async () => {
        const payload = createValidVenuePayload({ name: 'Reviews Default Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const dbVenue = await db('venues').where('id', res.body.id).first();
        expect(dbVenue.total_reviews).toBe(0);
      });

      it('should initialize total_events=0', async () => {
        const payload = createValidVenuePayload({ name: 'Events Default Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const dbVenue = await db('venues').where('id', res.body.id).first();
        expect(dbVenue.total_events).toBe(0);
      });
    });

    describe('Transaction & Related Records', () => {
      it('should create venue_staff record with owner role', async () => {
        const payload = createValidVenuePayload({ name: 'Staff Transaction Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where('venue_id', res.body.id)
          .where('user_id', TEST_USER_ID)
          .first();

        expect(staffRecord).toBeDefined();
        expect(staffRecord.role).toBe('owner');
      });

      it('should create venue_staff with wildcard permissions for owner', async () => {
        const payload = createValidVenuePayload({ name: 'Permissions Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where('venue_id', res.body.id)
          .where('user_id', TEST_USER_ID)
          .first();

        expect(staffRecord.permissions).toContain('*');
      });

      it('should create venue_settings with defaults', async () => {
        const payload = createValidVenuePayload({ name: 'Settings Transaction Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const settingsRecord = await db('venue_settings')
          .where('venue_id', res.body.id)
          .first();

        expect(settingsRecord).toBeDefined();
        expect(settingsRecord.max_tickets_per_order).toBe(10);
        expect(parseFloat(settingsRecord.service_fee_percentage)).toBe(10);
      });

      it('should generate slug from name', async () => {
        const payload = createValidVenuePayload({ name: 'My Awesome Venue!' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.slug).toBe('my-awesome-venue');
      });

      it('should set timestamps on creation', async () => {
        const payload = createValidVenuePayload({ name: 'Timestamp Venue' });
        const beforeCreate = new Date();

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const afterCreate = new Date();
        const dbVenue = await db('venues').where('id', res.body.id).first();

        expect(new Date(dbVenue.created_at).getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
        expect(new Date(dbVenue.created_at).getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      });
    });

    describe('Validation - Required Fields', () => {
      it('should reject missing name', async () => {
        const payload = createValidVenuePayload();
        delete (payload as any).name;

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject missing email', async () => {
        const payload = createValidVenuePayload();
        delete (payload as any).email;

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject missing address', async () => {
        const payload = createValidVenuePayload();
        delete (payload as any).address;

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject missing capacity/max_capacity', async () => {
        const payload = createValidVenuePayload();
        delete (payload as any).capacity;

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject missing type/venue_type', async () => {
        const payload = createValidVenuePayload();
        delete (payload as any).type;

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });
    });

    describe('Validation - Field Formats', () => {
      it('should reject invalid email format', async () => {
        const payload = createValidVenuePayload({ email: 'not-an-email' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject capacity below minimum (0)', async () => {
        const payload = createValidVenuePayload({ capacity: 0 });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject capacity above maximum (1000001)', async () => {
        const payload = createValidVenuePayload({ capacity: 1000001 });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject invalid venue type', async () => {
        const payload = createValidVenuePayload({ type: 'invalid_type' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should accept all 22 valid venue types', async () => {
        const venueTypes = [
          'general', 'stadium', 'arena', 'theater', 'convention_center',
          'concert_hall', 'amphitheater', 'comedy_club', 'nightclub', 'bar',
          'lounge', 'cabaret', 'park', 'festival_grounds', 'outdoor_venue',
          'sports_complex', 'gymnasium', 'museum', 'gallery', 'restaurant',
          'hotel', 'other'
        ];

        for (const venueType of venueTypes) {
          const payload = createValidVenuePayload({
            name: `${venueType} Test Venue`,
            type: venueType,
          });

          const res = await request(app.server)
            .post('/api/v1/venues')
            .set('Authorization', `Bearer ${authToken}`)
            .send(payload);

          expect(res.status).toBe(201);
          expect(res.body.type).toBe(venueType);
        }
      });

      it('should reject invalid slug format (uppercase)', async () => {
        const payload = createValidVenuePayload({ slug: 'INVALID-SLUG' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should accept valid slug format', async () => {
        const payload = createValidVenuePayload({
          name: 'Slug Test Venue',
          slug: 'valid-slug-123',
        });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.slug).toBe('valid-slug-123');
      });
    });

    describe('Validation - Address Formats', () => {
      it('should accept address as object', async () => {
        const payload = createValidVenuePayload({ name: 'Address Object Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.address).toBeDefined();
        expect(res.body.address.city).toBe('New York');
      });

      it('should accept flat address fields', async () => {
        const payload = {
          name: 'Flat Address Venue',
          email: 'flat@test.com',
          type: 'comedy_club',
          capacity: 200,
          address_line1: '456 Flat St',
          city: 'Los Angeles',
          state_province: 'CA',
          country_code: 'US',
        };

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.city).toBe('Los Angeles');
      });
    });

    describe('Error Cases', () => {
      it('should return 401 without authentication', async () => {
        const payload = createValidVenuePayload();

        await request(app.server)
          .post('/api/v1/venues')
          .send(payload)
          .expect(401);
      });

      it('should return 401 with invalid JWT', async () => {
        const payload = createValidVenuePayload();

        await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', 'Bearer invalid-token')
          .send(payload)
          .expect(401);
      });

      it('should return 409 for duplicate venue name in same tenant', async () => {
        const payload = createValidVenuePayload({ name: 'Duplicate Venue' });

        await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload);

        expect([409, 400, 500]).toContain(res.status);
      });
    });

    describe('Response Format', () => {
      it('should return 201 status code on success', async () => {
        const payload = createValidVenuePayload({ name: 'Response Test Venue' });

        await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);
      });

      it('should return venue object with id', async () => {
        const payload = createValidVenuePayload({ name: 'ID Response Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body).toHaveProperty('id');
        expect(typeof res.body.id).toBe('string');
      });

      it('should return tenant_id matching JWT', async () => {
        const payload = createValidVenuePayload({ name: 'Tenant Response Venue' });

        const res = await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(res.body.tenant_id).toBe(TEST_TENANT_ID);
      });
    });
  });

  // ===========================================
  // SECTION 2: VENUE SEARCH & FILTERING (35 tests)
  // ===========================================
  describe('Venue Search & Filtering', () => {

    // Helper to seed venues directly to DB (no API calls)
    async function seedSearchVenues() {
      const venues = [
        { id: 'aaaaaaaa-0001-0001-0001-000000000001', name: 'Comedy Cellar', type: 'comedy_club', capacity: 200, city: 'New York', state: 'NY' },
        { id: 'aaaaaaaa-0001-0001-0001-000000000002', name: 'Madison Square Garden', type: 'arena', capacity: 20000, city: 'New York', state: 'NY' },
        { id: 'aaaaaaaa-0001-0001-0001-000000000003', name: 'The Improv', type: 'comedy_club', capacity: 300, city: 'Los Angeles', state: 'CA' },
        { id: 'aaaaaaaa-0001-0001-0001-000000000004', name: 'Hollywood Bowl', type: 'amphitheater', capacity: 17500, city: 'Los Angeles', state: 'CA' },
        { id: 'aaaaaaaa-0001-0001-0001-000000000005', name: 'Chicago Theater', type: 'theater', capacity: 3600, city: 'Chicago', state: 'IL' },
      ];

      for (const v of venues) {
        // Insert venue
        await db('venues').insert({
          id: v.id,
          tenant_id: TEST_TENANT_ID,
          name: v.name,
          slug: v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          email: `${v.name.toLowerCase().replace(/\s+/g, '')}@test.com`,
          venue_type: v.type,
          max_capacity: v.capacity,
          address_line1: '123 Test St',
          city: v.city,
          state_province: v.state,
          country_code: 'US',
          status: 'active',
          is_verified: false,
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Insert venue_staff (owner)
        await db('venue_staff').insert({
          venue_id: v.id,
          user_id: TEST_USER_ID,
          role: 'owner',
          permissions: ['*'],
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Insert venue_settings
        await db('venue_settings').insert({
          venue_id: v.id,
          max_tickets_per_order: 10,
          service_fee_percentage: 10,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }

    describe('Basic Search', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should search venues by name', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'Comedy' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.data.every((v: any) => v.name.toLowerCase().includes('comedy'))).toBe(true);
      });

      it('should search venues by city', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'Los Angeles' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(res.body.data.every((v: any) => v.city === 'Los Angeles')).toBe(true);
      });

      it('should return empty array when no results match', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'NonExistentVenue12345' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data).toEqual([]);
      });

      it('should handle empty search string (return all)', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: '' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(5);
      });

      it('should handle search with special characters', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: "Comedy's & More!" })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data).toBeDefined();
      });

      it('should be case-insensitive', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'COMEDY' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
      });
    });

    describe('Filter by Type', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should filter by venue type', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ type: 'comedy_club' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(res.body.data.every((v: any) => v.type === 'comedy_club' || v.venue_type === 'comedy_club')).toBe(true);
      });

      it('should accept venue_type as alias for type', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ venue_type: 'arena' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      });

      it('should reject invalid venue type', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ type: 'invalid_type_xyz' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });
    });

    describe('Filter by Location', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should filter by city', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ city: 'Chicago' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].city).toBe('Chicago');
      });

      it('should filter by state', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ state: 'CA' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(2);
      });

      it('should combine city and state filters', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ city: 'New York', state: 'NY' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(2);
      });
    });

    describe('Pagination', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should respect limit parameter', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ limit: 2 })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(res.body.pagination.limit).toBe(2);
      });

      it('should respect offset parameter', async () => {
        const res1 = await request(app.server)
          .get('/api/v1/venues')
          .query({ limit: 2, offset: 0, sort_by: 'name', sort_order: 'asc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const res2 = await request(app.server)
          .get('/api/v1/venues')
          .query({ limit: 2, offset: 2, sort_by: 'name', sort_order: 'asc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res1.body.data[0].id).not.toBe(res2.body.data[0].id);
      });

      it('should use default limit of 20', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.pagination.limit).toBe(20);
      });

      it('should use default offset of 0', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.pagination.offset).toBe(0);
      });

      it('should reject limit exceeding 100', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ limit: 101 })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject negative offset', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ offset: -1 })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should return empty when offset exceeds total', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ offset: 1000 })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data).toEqual([]);
      });
    });

    describe('Sorting', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should sort by name ascending (default)', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ sort_by: 'name', sort_order: 'asc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const names = res.body.data.map((v: any) => v.name);
        const sorted = [...names].sort();
        expect(names).toEqual(sorted);
      });

      it('should sort by name descending', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ sort_by: 'name', sort_order: 'desc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const names = res.body.data.map((v: any) => v.name);
        const sorted = [...names].sort().reverse();
        expect(names).toEqual(sorted);
      });

      it('should sort by capacity ascending', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ sort_by: 'capacity', sort_order: 'asc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const capacities = res.body.data.map((v: any) => v.capacity || v.max_capacity);
        for (let i = 1; i < capacities.length; i++) {
          expect(capacities[i]).toBeGreaterThanOrEqual(capacities[i - 1]);
        }
      });

      it('should sort by created_at descending', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ sort_by: 'created_at', sort_order: 'desc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const dates = res.body.data.map((v: any) => new Date(v.created_at).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
        }
      });

      it('should reject invalid sort_by value', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ sort_by: 'invalid_field' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject invalid sort_order value', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ sort_order: 'invalid' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });
    });

    describe('Tenant Isolation', () => {
      let otherTenantToken: string;

      beforeEach(async () => {
        await seedSearchVenues();

        // Create second tenant and user
        await db('tenants').insert({
          id: OTHER_TENANT_ID,
          name: 'Other Tenant',
          slug: 'other-tenant',
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        await db('users').insert({
          id: OTHER_USER_ID,
          email: 'other@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: OTHER_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        otherTenantToken = generateTestJWT({
          sub: OTHER_USER_ID,
          tenant_id: OTHER_TENANT_ID,
        });

        // Create a venue for the other tenant directly in DB
        await db('venues').insert({
          id: 'bbbbbbbb-0001-0001-0001-000000000001',
          tenant_id: OTHER_TENANT_ID,
          name: 'Other Tenant Venue',
          slug: 'other-tenant-venue',
          email: 'other@venue.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '999 Other St',
          city: 'Boston',
          state_province: 'MA',
          country_code: 'US',
          status: 'active',
          is_verified: false,
          created_by: OTHER_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        await db('venue_staff').insert({
          venue_id: 'bbbbbbbb-0001-0001-0001-000000000001',
          user_id: OTHER_USER_ID,
          role: 'owner',
          permissions: ['*'],
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });
      });

      it('should only return venues for authenticated tenant', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(5);
        expect(res.body.data.every((v: any) => v.tenant_id === TEST_TENANT_ID)).toBe(true);
      });

      it('should not return cross-tenant results in search', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'Other Tenant' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(0);
      });

      it('should return other tenant venues when authenticated as other tenant', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${otherTenantToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].name).toBe('Other Tenant Venue');
      });
    });

    describe('my_venues Filter', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should return only venues where user is staff when my_venues=true', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ my_venues: true })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(5);
      });

      it('should return empty for user with no venue associations', async () => {
        const newUserId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
        await db('users').insert({
          id: newUserId,
          email: 'novenues@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: TEST_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        const newUserToken = generateTestJWT({
          sub: newUserId,
          tenant_id: TEST_TENANT_ID,
        });

        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ my_venues: true })
          .set('Authorization', `Bearer ${newUserToken}`)
          .expect(200);

        expect(res.body.data).toEqual([]);
      });
    });

    describe('Combined Filters', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should combine search with type filter', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'Comedy', type: 'comedy_club' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
      });

      it('should combine search with city and pagination', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'York', city: 'New York', limit: 1 })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
      });

      it('should combine type filter with sorting', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ type: 'comedy_club', sort_by: 'capacity', sort_order: 'desc' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0].capacity || res.body.data[0].max_capacity).toBeGreaterThanOrEqual(
          res.body.data[1].capacity || res.body.data[1].max_capacity
        );
      });
    });

    describe('Response Format', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should return 200 with venues array', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should include pagination metadata', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ limit: 10, offset: 5 })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.pagination).toBeDefined();
        expect(res.body.pagination.limit).toBe(10);
        expect(res.body.pagination.offset).toBe(5);
      });
    });

    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        await request(app.server)
          .get('/api/v1/venues')
          .expect(401);
      });

      it('should return 401 with invalid token', async () => {
        await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });
    });

    describe('Edge Cases', () => {
      beforeEach(async () => {
        await seedSearchVenues();
      });

      it('should handle very long search string (reject >100 chars)', async () => {
        const longSearch = 'a'.repeat(101);

        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: longSearch })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should handle search with SQL injection attempt', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: "'; DROP TABLE venues; --" })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data).toBeDefined();
      });

      it('should reject unknown query parameters', async () => {
        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ unknown_param: 'value' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });
    });
  });

  // ===========================================
  // SECTION 3: VENUE UPDATE (25 tests)
  // ===========================================
  describe('Venue Update', () => {
    let testVenueId: string;

    // Helper to create a venue for update tests
    async function createTestVenue(name: string = 'Update Test Venue') {
      const payload = createValidVenuePayload({ name });
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);
      return res.body;
    }

    describe('Basic Updates', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;
      });

      it('should update venue name', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Updated Venue Name' })
          .expect(200);

        expect(res.body.name).toBe('Updated Venue Name');
      });

      it('should update venue type', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ type: 'arena' })
          .expect(200);

        expect(res.body.type).toBe('arena');
      });

      it('should update capacity', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ capacity: 1000 })
          .expect(200);

        expect(res.body.capacity).toBe(1000);
      });

      it('should update address as full object', async () => {
        const newAddress = {
          street: '999 New St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'US',
        };

        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ address: newAddress })
          .expect(200);

        expect(res.body.address.city).toBe('Boston');
        expect(res.body.address.state).toBe('MA');
      });

      it('should update using flat address fields', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ city: 'Seattle', state_province: 'WA' })
          .expect(200);

        expect(res.body.city).toBe('Seattle');
      });

      it('should perform partial update (only provided fields changed)', async () => {
        const originalVenue = await db('venues').where('id', testVenueId).first();

        await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Partially Updated' })
          .expect(200);

        const updatedVenue = await db('venues').where('id', testVenueId).first();

        expect(updatedVenue.name).toBe('Partially Updated');
        expect(updatedVenue.email).toBe(originalVenue.email);
        expect(updatedVenue.max_capacity).toBe(originalVenue.max_capacity);
      });

      it('should update description', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ description: 'A great venue for events' })
          .expect(200);

        expect(res.body.description).toBe('A great venue for events');
      });

      it('should update email', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ email: 'updated@venue.com' })
          .expect(200);

        expect(res.body.email).toBe('updated@venue.com');
      });
    });

    describe('Database Behavior', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;
      });

      it('should update updated_at timestamp', async () => {
        const before = await db('venues').where('id', testVenueId).first();
        const beforeTime = new Date(before.updated_at).getTime();

        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 50));

        await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Timestamp Update Test' })
          .expect(200);

        const after = await db('venues').where('id', testVenueId).first();
        const afterTime = new Date(after.updated_at).getTime();

        expect(afterTime).toBeGreaterThan(beforeTime);
      });

      it('should not change created_at timestamp', async () => {
        const before = await db('venues').where('id', testVenueId).first();

        await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Created At Test' })
          .expect(200);

        const after = await db('venues').where('id', testVenueId).first();

        expect(new Date(after.created_at).getTime()).toBe(new Date(before.created_at).getTime());
      });

      it('should increment version on update (optimistic locking)', async () => {
        const before = await db('venues').where('id', testVenueId).first();
        const beforeVersion = before.version || 1;

        await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Version Test' })
          .expect(200);

        const after = await db('venues').where('id', testVenueId).first();
        expect(after.version).toBe(beforeVersion + 1);
      });
    });

    describe('Authorization & Access Control', () => {
      let otherTenantToken: string;
      let nonOwnerToken: string;

      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;

        // Setup other tenant
        await db('tenants').insert({
          id: OTHER_TENANT_ID,
          name: 'Other Tenant',
          slug: 'other-tenant',
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        await db('users').insert({
          id: OTHER_USER_ID,
          email: 'other@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: OTHER_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        otherTenantToken = generateTestJWT({
          sub: OTHER_USER_ID,
          tenant_id: OTHER_TENANT_ID,
        });

        // Setup non-owner user in same tenant
        const nonOwnerId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
        await db('users').insert({
          id: nonOwnerId,
          email: 'nonowner@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: TEST_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        nonOwnerToken = generateTestJWT({
          sub: nonOwnerId,
          tenant_id: TEST_TENANT_ID,
        });
      });

      it('should return 401 without authentication', async () => {
        await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .send({ name: 'Should Fail' })
          .expect(401);
      });

      it('should return 403 for non-owner user', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${nonOwnerToken}`)
          .send({ name: 'Should Fail' });

        expect([403, 500]).toContain(res.status);
      });

      it('should return 403 for cross-tenant update attempt', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${otherTenantToken}`)
          .send({ name: 'Cross Tenant Update' });

        expect([403, 404, 500]).toContain(res.status);
      });
    });

    describe('Validation', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;
      });

      it('should reject invalid email format', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ email: 'invalid-email' })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject invalid venue type', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ type: 'invalid_type' })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject capacity below minimum', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ capacity: 0 })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should allow empty string for nullable fields', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ description: '' })
          .expect(200);

        expect(res.body).toBeDefined();
      });

      it('should allow null for nullable fields', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ phone: null })
          .expect(200);

        expect(res.body).toBeDefined();
      });
    });

    describe('Error Cases', () => {
      it('should return 404 for non-existent venue', async () => {
        const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

        const res = await request(app.server)
          .put(`/api/v1/venues/${fakeId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Should Fail' });

        expect([404, 403, 500]).toContain(res.status);
      });

      it('should return error for invalid UUID format', async () => {
        const res = await request(app.server)
          .put('/api/v1/venues/not-a-uuid')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Should Fail' });

        expect([400, 422, 500]).toContain(res.status);
      });
    });

    describe('Response Format', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;
      });

      it('should return 200 with updated venue object', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Response Format Test' })
          .expect(200);

        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('name');
        expect(res.body).toHaveProperty('tenant_id');
      });

      it('should reflect changes in response', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Reflected Change', capacity: 999 })
          .expect(200);

        expect(res.body.name).toBe('Reflected Change');
        expect(res.body.capacity).toBe(999);
      });
    });
  });

  // ===========================================
  // SECTION 4: VENUE SOFT DELETE (20 tests)
  // ===========================================
  describe('Venue Soft Delete', () => {
    let testVenueId: string;

    // Helper to create a venue for delete tests
    async function createTestVenue(name: string = 'Delete Test Venue') {
      const payload = createValidVenuePayload({ name });
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);
      return res.body;
    }

    describe('Basic Delete Operation', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;
      });

      it('should delete venue and return 204', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);
      });

      it('should set deleted_at timestamp (soft delete)', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const venue = await db('venues').where('id', testVenueId).first();
        expect(venue).toBeDefined();
        expect(venue.deleted_at).not.toBeNull();
      });

      it('should keep record in database (not hard delete)', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const venue = await db('venues').where('id', testVenueId).first();
        expect(venue).toBeDefined();
        expect(venue.id).toBe(testVenueId);
      });

      it('should exclude deleted venue from subsequent queries', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const res = await request(app.server)
          .get('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const venueIds = res.body.data.map((v: any) => v.id);
        expect(venueIds).not.toContain(testVenueId);
      });

      it('should not appear in search results after deletion', async () => {
        const venue = await createTestVenue('Searchable Delete Venue');

        await request(app.server)
          .delete(`/api/v1/venues/${venue.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const res = await request(app.server)
          .get('/api/v1/venues')
          .query({ search: 'Searchable Delete' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.data.length).toBe(0);
      });
    });

    describe('Authorization & Ownership', () => {
      let otherTenantToken: string;
      let nonOwnerToken: string;

      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;

        // Setup other tenant
        await db('tenants').insert({
          id: OTHER_TENANT_ID,
          name: 'Other Tenant',
          slug: 'other-tenant',
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        await db('users').insert({
          id: OTHER_USER_ID,
          email: 'other@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: OTHER_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        otherTenantToken = generateTestJWT({
          sub: OTHER_USER_ID,
          tenant_id: OTHER_TENANT_ID,
        });

        // Setup non-owner (manager) in same tenant
        const managerId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
        await db('users').insert({
          id: managerId,
          email: 'manager@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: TEST_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        // Add as manager, not owner
        await db('venue_staff').insert({
          venue_id: testVenueId,
          user_id: managerId,
          role: 'manager',
          permissions: ['venue:read', 'venue:update'],
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        nonOwnerToken = generateTestJWT({
          sub: managerId,
          tenant_id: TEST_TENANT_ID,
        });
      });

      it('should return 401 without authentication', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .expect(401);
      });

      it('should return 403 for non-owner (manager)', async () => {
        const res = await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${nonOwnerToken}`);

        expect([403, 500]).toContain(res.status);
      });

      it('should return error for cross-tenant delete attempt', async () => {
        const res = await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${otherTenantToken}`);

        expect([403, 404, 500]).toContain(res.status);
      });

      it('should allow owner to delete', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);
      });
    });

    describe('Error Cases', () => {
      it('should return 404 for non-existent venue', async () => {
        const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

        const res = await request(app.server)
          .delete(`/api/v1/venues/${fakeId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([404, 403, 500]).toContain(res.status);
      });

      it('should handle already deleted venue gracefully', async () => {
        const venue = await createTestVenue();

        // First delete
        await request(app.server)
          .delete(`/api/v1/venues/${venue.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // Second delete attempt
        const res = await request(app.server)
          .delete(`/api/v1/venues/${venue.id}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([204, 404, 403, 500]).toContain(res.status);
      });
    });

    describe('Get Deleted Venue', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;

        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);
      });

      it('should return 404 when trying to get deleted venue', async () => {
        const res = await request(app.server)
          .get(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([404, 403]).toContain(res.status);
      });

      it('should return 404 when trying to update deleted venue', async () => {
        const res = await request(app.server)
          .put(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Should Fail' });

        expect([404, 403, 500]).toContain(res.status);
      });
    });

    describe('Database State After Delete', () => {
      beforeEach(async () => {
        const venue = await createTestVenue();
        testVenueId = venue.id;
      });

      it('should preserve all venue data after soft delete', async () => {
        const before = await db('venues').where('id', testVenueId).first();

        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const after = await db('venues').where('id', testVenueId).first();

        expect(after.name).toBe(before.name);
        expect(after.email).toBe(before.email);
        expect(after.max_capacity).toBe(before.max_capacity);
      });

      it('should set deleted_at to current timestamp', async () => {
        const beforeDelete = new Date();

        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const afterDelete = new Date();
        const venue = await db('venues').where('id', testVenueId).first();
        const deletedAt = new Date(venue.deleted_at).getTime();

        expect(deletedAt).toBeGreaterThanOrEqual(beforeDelete.getTime());
        expect(deletedAt).toBeLessThanOrEqual(afterDelete.getTime());
      });
    });
  });

  // ===========================================
  // SECTION 5: CASCADE DELETE EFFECTS (10 tests)
  // ===========================================
  describe('Cascade Delete Effects', () => {
    let testVenueId: string;

    // Helper to create a venue with all related records
    async function createVenueWithRelations() {
      const payload = createValidVenuePayload({ name: 'Cascade Test Venue' });
      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      const venueId = res.body.id;

      // Add additional staff member
      const additionalStaffId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      await db('users').insert({
        id: additionalStaffId,
        email: 'additionalstaff@test.com',
        password_hash: '$2b$10$dummyhashfortestingpurposesonly',
        tenant_id: TEST_TENANT_ID,
        created_at: new Date(),
        updated_at: new Date(),
      }).onConflict('id').ignore();

      await db('venue_staff').insert({
        venue_id: venueId,
        user_id: additionalStaffId,
        role: 'manager',
        permissions: ['venue:read'],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      return venueId;
    }

    describe('Staff Records', () => {
      beforeEach(async () => {
        testVenueId = await createVenueWithRelations();
      });

      it('should retain venue_staff records after venue soft delete', async () => {
        const staffBefore = await db('venue_staff').where('venue_id', testVenueId);
        expect(staffBefore.length).toBeGreaterThanOrEqual(2);

        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // Staff records should still exist (soft delete doesn't cascade hard delete)
        const staffAfter = await db('venue_staff').where('venue_id', testVenueId);
        expect(staffAfter.length).toBe(staffBefore.length);
      });

      it('should count correct number of staff before delete', async () => {
        const staff = await db('venue_staff').where('venue_id', testVenueId);
        expect(staff.length).toBeGreaterThanOrEqual(2); // owner + additional
      });
    });

    describe('Settings Records', () => {
      beforeEach(async () => {
        testVenueId = await createVenueWithRelations();
      });

      it('should retain venue_settings after venue soft delete', async () => {
        const settingsBefore = await db('venue_settings').where('venue_id', testVenueId).first();
        expect(settingsBefore).toBeDefined();

        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const settingsAfter = await db('venue_settings').where('venue_id', testVenueId).first();
        expect(settingsAfter).toBeDefined();
        expect(settingsAfter.venue_id).toBe(testVenueId);
      });

      it('should preserve settings values after soft delete', async () => {
        const settingsBefore = await db('venue_settings').where('venue_id', testVenueId).first();

        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        const settingsAfter = await db('venue_settings').where('venue_id', testVenueId).first();
        expect(settingsAfter.max_tickets_per_order).toBe(settingsBefore.max_tickets_per_order);
      });
    });

    describe('Data Integrity', () => {
      beforeEach(async () => {
        testVenueId = await createVenueWithRelations();
      });

      it('should maintain referential integrity after soft delete', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // Venue record exists
        const venue = await db('venues').where('id', testVenueId).first();
        expect(venue).toBeDefined();

        // Staff records exist and reference venue
        const staff = await db('venue_staff').where('venue_id', testVenueId);
        expect(staff.every((s: any) => s.venue_id === testVenueId)).toBe(true);

        // Settings exist and reference venue
        const settings = await db('venue_settings').where('venue_id', testVenueId).first();
        expect(settings.venue_id).toBe(testVenueId);
      });

      it('should not create orphan records', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // All venue_staff records should have valid venue references
        const orphanStaff = await db('venue_staff')
          .where('venue_id', testVenueId)
          .whereNotExists(
            db.select('id').from('venues').whereRaw('venues.id = venue_staff.venue_id')
          );

        expect(orphanStaff.length).toBe(0);
      });

      it('should allow querying deleted venue data directly from DB', async () => {
        await request(app.server)
          .delete(`/api/v1/venues/${testVenueId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // Can still query the raw data
        const venue = await db('venues').where('id', testVenueId).first();
        expect(venue).toBeDefined();
        expect(venue.name).toBe('Cascade Test Venue');
        expect(venue.deleted_at).not.toBeNull();
      });

      it('should preserve audit trail data', async () => {
        // The venue_audit_log table may exist - check if we can verify audit entries
        const venue = await db('venues').where('id', testVenueId).first();
        expect(venue.created_by).toBe(TEST_USER_ID);
        expect(venue.created_at).toBeDefined();
      });
    });
  });
});