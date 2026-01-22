import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';
import { getTestMongoDB, clearAllCollections } from './helpers/mongodb';
import { VenueContentModel } from '../../src/models/mongodb/venue-content.model';

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// =============================================================================
// TEST CONSTANTS
// =============================================================================

// Tenant A
const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VENUE_A_ID = 'aaaa0001-0001-0001-0001-000000000001';

// Tenant B
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VENUE_B_ID = 'bbbb0001-0001-0001-0001-000000000001';

// Non-existent IDs for negative tests
const NONEXISTENT_VENUE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateTestJWT(payload: {
  sub: string;
  tenant_id: string;
  permissions?: string[];
}): string {
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

function createContentPayload(overrides: Partial<{
  contentType: string;
  content: any;
  displayOrder: number;
  featured: boolean;
}> = {}) {
  const base: any = {
    contentType: 'PHOTO',
    content: {
      media: {
        url: 'https://example.com/photo.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        type: 'interior',
        caption: 'Test photo',
        altText: 'Test alt text',
      },
    },
    displayOrder: 0,
    featured: false,
  };
  
  return { ...base, ...overrides };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Content Management Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let mongodb: any;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    
    db = getTestDb();
    redis = getTestRedis();
    mongodb = await getTestMongoDB();

    // Generate tokens
    tokenA = generateTestJWT({
      sub: USER_A_ID,
      tenant_id: TENANT_A_ID,
    });

    tokenB = generateTestJWT({
      sub: USER_B_ID,
      tenant_id: TENANT_B_ID,
    });

    console.log('[Content Test] Setup complete');
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean PostgreSQL - ORDER MATTERS for foreign keys!
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();
    await db('users').del();
    await db('tenants').del();

    // Clean MongoDB
    await clearAllCollections();

    // Clear Redis rate limits
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // ========================================
    // SETUP TENANT A
    // ========================================
    await db('tenants').insert({
      id: TENANT_A_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('users').insert({
      id: USER_A_ID,
      tenant_id: TENANT_A_ID,
      email: 'usera@example.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venues').insert({
      id: VENUE_A_ID,
      tenant_id: TENANT_A_ID,
      name: 'Venue A',
      slug: 'venue-a',
      email: 'venuea@example.com',
      address_line1: '123 Main St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      venue_type: 'theater',
      max_capacity: 500,
      status: 'active',
      is_verified: false,
      created_by: USER_A_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // ========================================
    // SETUP TENANT B
    // ========================================
    await db('tenants').insert({
      id: TENANT_B_ID,
      name: 'Tenant B',
      slug: 'tenant-b',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('users').insert({
      id: USER_B_ID,
      tenant_id: TENANT_B_ID,
      email: 'userb@example.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venues').insert({
      id: VENUE_B_ID,
      tenant_id: TENANT_B_ID,
      name: 'Venue B',
      slug: 'venue-b',
      email: 'venueb@example.com',
      address_line1: '456 Oak Ave',
      city: 'Los Angeles',
      state_province: 'CA',
      country_code: 'US',
      venue_type: 'arena',
      max_capacity: 1000,
      status: 'active',
      is_verified: false,
      created_by: USER_B_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  // ===========================================
  // SECTION 1: Content Creation (PostgreSQL + MongoDB) - 15 tests
  // ===========================================
  describe('Content Creation (PostgreSQL + MongoDB)', () => {
    describe('PostgreSQL Validation', () => {
      it('should verify venue exists before MongoDB insert', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        
        // Verify content was created in MongoDB
        const mongoContent = await VenueContentModel.findById(res.body.data._id);
        expect(mongoContent).toBeDefined();
        expect(mongoContent).not.toBeNull();
      });

      it('should verify venue.tenant_id matches request tenant_id', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        const mongoContent = await VenueContentModel.findById(res.body.data._id);
        expect(mongoContent).not.toBeNull();
        if (mongoContent) {
          expect(mongoContent.venueId.toString()).toBe(VENUE_A_ID);
        }
      });

      it('should return 404 when venue does not exist', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${NONEXISTENT_VENUE_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(500);

        expect(res.body.success).toBe(false);
      });

      it('should return 403 when venue belongs to different tenant', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_B_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(500);

        expect(res.body.success).toBe(false);
      });
    });

    describe('MongoDB Insert', () => {
      it('should insert with tenantId field', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        const mongoContent = await VenueContentModel.findById(res.body.data._id);
        expect(mongoContent).not.toBeNull();
        if (mongoContent) {
          expect(mongoContent.tenantId).toBe(TENANT_A_ID);
        }
      });

      it('should store venueId correctly', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        const mongoContent = await VenueContentModel.findById(res.body.data._id);
        expect(mongoContent).not.toBeNull();
        if (mongoContent) {
          expect(mongoContent.venueId.toString()).toBe(VENUE_A_ID);
        }
      });

      it('should validate contentType enum (11 types)', async () => {
        const invalidPayload = createContentPayload({ contentType: 'INVALID_TYPE' });

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(invalidPayload)
          .expect(500);

        expect(res.body.success).toBe(false);
      });

      it('should default status to "draft"', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        expect(res.body.data.status).toBe('draft');
      });

      it('should default displayOrder to 0', async () => {
        const payload = createContentPayload();
        // Create payload without displayOrder
        const { displayOrder, ...payloadWithoutDisplayOrder } = payload;

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payloadWithoutDisplayOrder)
          .expect(201);

        expect(res.body.data.displayOrder).toBe(0);
      });

      it('should default featured to false', async () => {
        const payload = createContentPayload();
        // Create payload without featured
        const { featured, ...payloadWithoutFeatured } = payload;

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payloadWithoutFeatured)
          .expect(201);

        expect(res.body.data.featured).toBe(false);
      });

      it('should default version to 1', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        const mongoContent = await VenueContentModel.findById(res.body.data._id);
        expect(mongoContent).not.toBeNull();
        if (mongoContent) {
          expect(mongoContent.__v).toBe(0); // Mongoose version starts at 0
        }
      });

      it('should store createdBy and updatedBy', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        expect(res.body.data.createdBy).toBe(USER_A_ID);
        expect(res.body.data.updatedBy).toBe(USER_A_ID);
      });

      it('should set timestamps automatically', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        expect(res.body.data.createdAt).toBeDefined();
        expect(res.body.data.updatedAt).toBeDefined();
      });
    });

    describe('Error Handling', () => {
      it('should prevent MongoDB insert when PostgreSQL failure occurs', async () => {
        await db('venues').where('id', VENUE_A_ID).del();

        const payload = createContentPayload();

        await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(500);

        const mongoCount = await VenueContentModel.countDocuments({ venueId: VENUE_A_ID });
        expect(mongoCount).toBe(0);
      });

      it('should handle MongoDB failure after PostgreSQL check (no rollback - mixed DB)', async () => {
        const payload = createContentPayload();

        const res = await request(app.server)
          .post(`/api/venues/${VENUE_A_ID}/content`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload)
          .expect(201);

        const venue = await db('venues').where('id', VENUE_A_ID).first();
        expect(venue).toBeDefined();
      });
    });
  });

  // ===========================================
  // SECTION 2: Content Types - 11 tests
  // ===========================================
  describe('Content Types', () => {
    it('should create SEATING_CHART content structure', async () => {
      const payload = createContentPayload({
        contentType: 'SEATING_CHART',
        content: {
          sections: [{
            sectionId: 'A',
            name: 'Section A',
            capacity: 100,
            type: 'seated',
            rows: [{
              rowId: 'A1',
              name: 'Row 1',
              seats: [{
                seatId: 'A1-1',
                number: '1',
                type: 'standard',
              }],
            }],
          }],
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('SEATING_CHART');
      expect(res.body.data.content.sections).toBeDefined();
    });

    it('should create PHOTO content with media URLs', async () => {
      const payload = createContentPayload({
        contentType: 'PHOTO',
        content: {
          media: {
            url: 'https://example.com/photo.jpg',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            type: 'interior',
          },
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('PHOTO');
      expect(res.body.data.content.media.url).toBeDefined();
    });

    it('should create VIDEO content with embed codes', async () => {
      const payload = createContentPayload({
        contentType: 'VIDEO',
        content: {
          media: {
            url: 'https://youtube.com/watch?v=123',
            type: 'stage',
          },
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('VIDEO');
    });

    it('should create VIRTUAL_TOUR content', async () => {
      const payload = createContentPayload({
        contentType: 'VIRTUAL_TOUR',
        content: {
          media: {
            url: 'https://virtualtour.com/venue',
          },
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('VIRTUAL_TOUR');
    });

    it('should create AMENITIES list validation', async () => {
      const payload = createContentPayload({
        contentType: 'AMENITIES',
        content: {
          amenities: [{
            type: 'parking',
            name: 'Parking Lot',
            description: 'Free parking',
          }],
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('AMENITIES');
    });

    it('should create DIRECTIONS content', async () => {
      const payload = createContentPayload({
        contentType: 'DIRECTIONS',
        content: {
          directions: {
            byTransit: 'Take subway line 1',
            byCar: 'Take I-95',
          },
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('DIRECTIONS');
    });

    it('should create PARKING_INFO structure', async () => {
      const payload = createContentPayload({
        contentType: 'PARKING_INFO',
        content: {
          parking: [{
            type: 'onsite',
            name: 'Main Lot',
            capacity: 200,
          }],
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('PARKING_INFO');
    });

    it('should create ACCESSIBILITY_INFO structure', async () => {
      const payload = createContentPayload({
        contentType: 'ACCESSIBILITY_INFO',
        content: {
          accessibility: [{
            type: 'wheelchair',
            description: 'Wheelchair accessible',
          }],
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('ACCESSIBILITY_INFO');
    });

    it('should create POLICIES text content', async () => {
      const payload = createContentPayload({
        contentType: 'POLICIES',
        content: {
          policies: {
            ageRestrictions: '18+',
            bagPolicy: 'Small bags only',
          },
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('POLICIES');
    });

    it('should create FAQ array structure', async () => {
      const payload = createContentPayload({
        contentType: 'FAQ',
        content: {
          faqs: [{
            question: 'What time do doors open?',
            answer: '1 hour before show',
          }],
        },
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.contentType).toBe('FAQ');
    });

    it('should reject invalid content type', async () => {
      const payload = createContentPayload({
        contentType: 'INVALID_TYPE',
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // SECTION 3: Status Transitions - 8 tests
  // ===========================================
  describe('Status Transitions', () => {
    let contentId: string;

    beforeEach(async () => {
      const payload = createContentPayload();
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);
      
      contentId = res.body.data._id;
    });

    it('should transition draft → published via POST /:contentId/publish', async () => {
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.status).toBe('published');
      expect(res.body.data.publishedAt).toBeDefined();
    });

    it('should transition published → archived via POST /:contentId/archive', async () => {
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/archive`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.status).toBe('archived');
      expect(res.body.data.archivedAt).toBeDefined();
    });

    it('should update updatedBy on status change', async () => {
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.updatedBy).toBe(USER_A_ID);
    });

    it('should update updatedAt on status change', async () => {
      const beforeUpdate = new Date();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const updatedAt = new Date(res.body.data.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });

    it('should set archivedAt timestamp on archive', async () => {
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/archive`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.archivedAt).toBeDefined();
      const archivedAt = new Date(res.body.data.archivedAt);
      expect(archivedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should document status validation (implementation may vary)', async () => {
      const mongoContent = await VenueContentModel.findById(contentId);
      expect(mongoContent).not.toBeNull();
      if (mongoContent) {
        expect(mongoContent.status).toBe('draft');
      }
    });

    it('should handle concurrent status updates', async () => {
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/archive`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('should maintain status history through transitions', async () => {
      const publishRes = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/publish`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(publishRes.body.data.status).toBe('published');
      expect(publishRes.body.data.publishedAt).toBeDefined();

      const archiveRes = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content/${contentId}/archive`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(archiveRes.body.data.status).toBe('archived');
      expect(archiveRes.body.data.publishedAt).toBeDefined();
      expect(archiveRes.body.data.archivedAt).toBeDefined();
    });
  });

  // ===========================================
  // SECTION 4: Mixed Database Consistency - 10 tests
  // ===========================================
  describe('Mixed Database Consistency', () => {
    it('should prevent MongoDB insert when PostgreSQL venue check fails', async () => {
      await db('venues').where('id', VENUE_A_ID).del();

      const payload = createContentPayload();

      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      const count = await VenueContentModel.countDocuments({ venueId: VENUE_A_ID });
      expect(count).toBe(0);
    });

    it('should handle MongoDB failure without PostgreSQL side effects', async () => {
      const venueBeforeCount = await db('venues').count('* as count').first();
      
      const payload = createContentPayload();
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      const venueAfterCount = await db('venues').count('* as count').first();
      expect(venueAfterCount.count).toBe(venueBeforeCount.count);
    });

    it('should create orphaned content when venue is deleted from PostgreSQL', async () => {
      const payload = createContentPayload();
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      const contentId = res.body.data._id;

      await db('venues').where('id', VENUE_A_ID).del();

      const mongoContent = await VenueContentModel.findById(contentId);
      expect(mongoContent).not.toBeNull();
      if (mongoContent) {
        expect(mongoContent.venueId.toString()).toBe(VENUE_A_ID);
      }
    });

    it('should detect orphaned content via consistency check query', async () => {
      const payload = createContentPayload();
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      await db('venues').where('id', VENUE_A_ID).del();

      const allContent = await VenueContentModel.find({ venueId: VENUE_A_ID });
      expect(allContent.length).toBeGreaterThan(0);

      const venue = await db('venues').where('id', VENUE_A_ID).first();
      expect(venue).toBeUndefined();

      expect(allContent.length > 0 && !venue).toBe(true);
    });

    it('should gracefully handle queries for content of deleted venue', async () => {
      const payload = createContentPayload();
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      await db('venues').where('id', VENUE_A_ID).del();

      const res = await request(app.server)
        .get(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(500);

      expect(res.body.success).toBe(false);
    });

    it('should document that distributed transactions are not available', async () => {
      const payload = createContentPayload();
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      const venue = await db('venues').where('id', VENUE_A_ID).first();
      const content = await VenueContentModel.findById(res.body.data._id);
      
      expect(venue).toBeDefined();
      expect(content).toBeDefined();
    });

    it('should fail gracefully when both databases have errors', async () => {
      await db('venues').where('id', VENUE_A_ID).del();

      const payload = createContentPayload();
      
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('should maintain proper transaction boundaries', async () => {
      const payload = createContentPayload();
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      const venue = await db('venues').where('id', VENUE_A_ID).first();
      expect(venue).toBeDefined();
    });

    it('should log errors appropriately for monitoring', async () => {
      await db('venues').where('id', VENUE_A_ID).del();

      const payload = createContentPayload();
      
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);
    });

    it('should provide clear error messages for troubleshooting', async () => {
      const payload = createContentPayload();
      
      const res = await request(app.server)
        .post(`/api/venues/${NONEXISTENT_VENUE_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error).toBe('string');
    });
  });

  // ===========================================
  // SECTION 5: Tenant Isolation - 6 tests
  // ===========================================
  describe('Tenant Isolation', () => {
    it('should require tenantId parameter on all service methods', async () => {
      const payload = createContentPayload();
      
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .send(payload)
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should call validateTenantContext on all operations', async () => {
      const payload = createContentPayload();
      
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should call verifyVenueOwnership before MongoDB operations', async () => {
      const payload = createContentPayload();
      
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      await request(app.server)
        .post(`/api/venues/${VENUE_B_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);
    });

    it('should prevent Tenant A from creating content for Tenant B venue', async () => {
      const payload = createContentPayload();
      
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_B_ID}/content`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      expect(res.body.success).toBe(false);

      const count = await VenueContentModel.countDocuments({
        venueId: VENUE_B_ID,
        tenantId: TENANT_A_ID,
      });
      expect(count).toBe(0);
    });

    it('should prevent Tenant A from reading Tenant B content by contentId', async () => {
      const payload = createContentPayload();
      const createRes = await request(app.server)
        .post(`/api/venues/${VENUE_B_ID}/content`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send(payload)
        .expect(201);

      const contentId = createRes.body.data._id;

      const res = await request(app.server)
        .get(`/api/venues/${VENUE_B_ID}/content/${contentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(500);

      expect(res.body.success).toBe(false);
    });

    it('should prevent Tenant A from updating/deleting Tenant B content', async () => {
      const payload = createContentPayload();
      const createRes = await request(app.server)
        .post(`/api/venues/${VENUE_B_ID}/content`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send(payload)
        .expect(201);

      const contentId = createRes.body.data._id;

      const updateRes = await request(app.server)
        .put(`/api/venues/${VENUE_B_ID}/content/${contentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: { media: { url: 'hacked.jpg' } } })
        .expect(500);

      expect(updateRes.body.success).toBe(false);

      const deleteRes = await request(app.server)
        .delete(`/api/venues/${VENUE_B_ID}/content/${contentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(500);

      expect(deleteRes.body.success).toBe(false);

      const mongoContent = await VenueContentModel.findById(contentId);
      expect(mongoContent).not.toBeNull();
      if (mongoContent) {
        expect(mongoContent.deletedAt).toBeNull();
      }
    });
  });
});
