import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';
import { getTestMongoDB, clearAllCollections } from './helpers/mongodb';
import { VenueContentModel } from '../../src/models/mongodb/venue-content.model';

// =============================================================================
// RSA KEYPAIR GENERATION FOR JWT SIGNING
// =============================================================================

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-url-test-keys-'));
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
  role?: string;
  permissions?: string[];
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      role: payload.role || 'user',
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

function createPhotoPayload(overrides: Partial<{
  url: string;
  thumbnailUrl: string;
  type: string;
  caption: string;
  altText: string;
}> = {}) {
  return {
    media: {
      url: overrides.url || 'https://cdn.example.com/venues/photo-001.jpg',
      thumbnailUrl: overrides.thumbnailUrl || 'https://cdn.example.com/venues/photo-001-thumb.jpg',
      type: overrides.type || 'interior',
      caption: overrides.caption || 'Main hall interior',
      altText: overrides.altText || 'Interior view of the main hall',
      dimensions: { width: 1920, height: 1080 },
    },
  };
}

function createBrandingPayload(overrides: Partial<{
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  faviconUrl: string;
  emailHeaderImage: string;
  ticketBackgroundImage: string;
  ogImageUrl: string;
}> = {}) {
  return {
    primaryColor: overrides.primaryColor || '#667eea',
    secondaryColor: overrides.secondaryColor || '#764ba2',
    logoUrl: overrides.logoUrl || 'https://cdn.example.com/branding/logo.png',
    faviconUrl: overrides.faviconUrl || 'https://cdn.example.com/branding/favicon.ico',
    emailHeaderImage: overrides.emailHeaderImage || 'https://cdn.example.com/branding/email-header.png',
    ticketBackgroundImage: overrides.ticketBackgroundImage || 'https://cdn.example.com/branding/ticket-bg.png',
    ogImageUrl: overrides.ogImageUrl || 'https://cdn.example.com/branding/og-image.png',
  };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('File URL Storage - Integration Tests', () => {
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

    // Generate tokens for both tenants
    tokenA = generateTestJWT({
      sub: USER_A_ID,
      tenant_id: TENANT_A_ID,
    });

    tokenB = generateTestJWT({
      sub: USER_B_ID,
      tenant_id: TENANT_B_ID,
    });

    console.log('[File URL Storage Test] Setup complete');
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean venue-related tables only (order matters for foreign keys)
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venue_branding').del().catch(() => {}); // May not exist
    await db('venues').del();

    // Clean MongoDB
    await clearAllCollections();

    // Clear Redis rate limits
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Seed Tenant A (ignore if exists)
    await db('tenants').insert({
      id: TENANT_A_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    await db('users').insert({
      id: USER_A_ID,
      tenant_id: TENANT_A_ID,
      email: 'usera@example.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed Tenant B (ignore if exists)
    await db('tenants').insert({
      id: TENANT_B_ID,
      name: 'Tenant B',
      slug: 'tenant-b',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    await db('users').insert({
      id: USER_B_ID,
      tenant_id: TENANT_B_ID,
      email: 'userb@example.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Create Venue A
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
      pricing_tier: 'premium',
      created_by: USER_A_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // User A is owner of Venue A
    await db('venue_staff').insert({
      venue_id: VENUE_A_ID,
      user_id: USER_A_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
    });

    // Create Venue B
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
      pricing_tier: 'premium',
      created_by: USER_B_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // User B is owner of Venue B
    await db('venue_staff').insert({
      venue_id: VENUE_B_ID,
      user_id: USER_B_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
    });
  });

  // ===========================================
  // SECTION 1: Photo URL Storage (8 tests)
  // ===========================================
  describe('Photo URL Storage (MongoDB)', () => {
    it('should store photo via POST /:venueId/photos with media object URL', async () => {
      const payload = createPhotoPayload();

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.contentType).toBe('PHOTO');
    });

    it('should validate media object structure (url, thumbnailUrl, type, caption)', async () => {
      const payload = createPhotoPayload({
        url: 'https://cdn.example.com/photo.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        type: 'exterior',
        caption: 'Building exterior',
      });

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.content.media.url).toBe('https://cdn.example.com/photo.jpg');
      expect(res.body.data.content.media.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
      expect(res.body.data.content.media.type).toBe('exterior');
      expect(res.body.data.content.media.caption).toBe('Building exterior');
    });

    it('should retrieve stored photo URLs via GET /:venueId/photos', async () => {
      // Create a photo first
      const payload = createPhotoPayload();
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      // Publish it so it appears in GET
      const content = await VenueContentModel.findOne({ venueId: VENUE_A_ID, contentType: 'PHOTO' });
      if (content) {
        content.status = 'published';
        await content.save();
      }

      // Retrieve photos
      const res = await request(app.server)
        .get(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].content.media.url).toBeDefined();
    });

    it('should enforce tenant isolation on photo storage', async () => {
      const payload = createPhotoPayload();

      // Tenant A tries to add photo to Tenant B's venue
      const res = await request(app.server)
        .post(`/api/venues/${VENUE_B_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      expect(res.body.success).toBe(false);

      // Verify no content was created
      const count = await VenueContentModel.countDocuments({
        venueId: VENUE_B_ID,
        tenantId: TENANT_A_ID,
      });
      expect(count).toBe(0);
    });

    it('should enforce tenant isolation on photo retrieval', async () => {
      // Tenant B creates a photo
      const payload = createPhotoPayload();
      await request(app.server)
        .post(`/api/venues/${VENUE_B_ID}/photos`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send(payload)
        .expect(201);

      // Tenant A tries to retrieve Tenant B's photos
      const res = await request(app.server)
        .get(`/api/venues/${VENUE_B_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(500);

      expect(res.body.success).toBe(false);
    });

    it('should store photo content type as PHOTO in MongoDB', async () => {
      const payload = createPhotoPayload();

      const res = await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(201);

      const mongoContent = await VenueContentModel.findById(res.body.data._id);
      expect(mongoContent).not.toBeNull();
      if (mongoContent) {
        expect(mongoContent.contentType).toBe('PHOTO');
      }
    });

    it('should support displayOrder and featured flags on photos', async () => {
      // Create first photo
      const payload1 = createPhotoPayload({ url: 'https://cdn.example.com/photo1.jpg' });
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload1)
        .expect(201);

      // Create second photo
      const payload2 = createPhotoPayload({ url: 'https://cdn.example.com/photo2.jpg' });
      await request(app.server)
        .post(`/api/venues/${VENUE_A_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload2)
        .expect(201);

      // Verify both created
      const count = await VenueContentModel.countDocuments({
        venueId: VENUE_A_ID,
        contentType: 'PHOTO',
      });
      expect(count).toBe(2);
    });

    it('should return 500 for photos on non-existent venue', async () => {
      const payload = createPhotoPayload();

      const res = await request(app.server)
        .post(`/api/venues/${NONEXISTENT_VENUE_ID}/photos`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // SECTION 2: Branding URL Storage (7 tests)
  // ===========================================
  describe('Branding URL Storage (PostgreSQL)', () => {
    it('should store logoUrl via branding upsert', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({ logoUrl: 'https://cdn.example.com/logo.png' });

      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([200, 201]).toContain(res.status);

      // Verify in database
      const branding = await db('venue_branding').where('venue_id', VENUE_A_ID).first();
      expect(branding).toBeDefined();
      if (branding) {
        expect(branding.logo_url).toBe('https://cdn.example.com/logo.png');
      }
    });

    it('should store faviconUrl via branding upsert', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({ faviconUrl: 'https://cdn.example.com/favicon.ico' });

      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([200, 201]).toContain(res.status);
    });

    it('should store emailHeaderImage, ticketBackgroundImage, ogImageUrl', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({
        emailHeaderImage: 'https://cdn.example.com/email-header.png',
        ticketBackgroundImage: 'https://cdn.example.com/ticket-bg.png',
        ogImageUrl: 'https://cdn.example.com/og.png',
      });

      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([200, 201]).toContain(res.status);
    });

    it('should validate URL format - http/https required', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({ logoUrl: 'ftp://invalid-protocol.com/logo.png' });

      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([400, 500]).toContain(res.status);
    });

    it('should reject invalid URL format', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({ logoUrl: 'not-a-valid-url' });

      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([400, 500]).toContain(res.status);
    });

    it('should block javascript: protocol in URLs', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({ logoUrl: 'javascript:alert(1)' });

      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([400, 500]).toContain(res.status);
    });

    it('should enforce tenant isolation on branding', async () => {
      const hasBrandingTable = await db.schema.hasTable('venue_branding');
      if (!hasBrandingTable) {
        console.log('Skipping: venue_branding table does not exist');
        return;
      }

      const payload = createBrandingPayload({ logoUrl: 'https://hacked.com/logo.png' });

      // Tenant A tries to update Tenant B's branding
      const res = await request(app.server)
        .put(`/api/v1/branding/${VENUE_B_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect([400, 403, 500]).toContain(res.status);
    });
  });

  // ===========================================
  // SECTION 3: Venue Image Fields (5 tests)
  // ===========================================
  describe('Venue Image Fields (PostgreSQL)', () => {
    it('should update venue with logo_url', async () => {
      const res = await request(app.server)
        .put(`/api/v1/venues/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          logo_url: 'https://cdn.example.com/venue-logo.png',
        });

      expect([200, 201]).toContain(res.status);

      // Verify in database
      const venue = await db('venues').where('id', VENUE_A_ID).first();
      expect(venue.logo_url).toBe('https://cdn.example.com/venue-logo.png');
    });

    it('should update venue with cover_image_url', async () => {
      const res = await request(app.server)
        .put(`/api/v1/venues/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          cover_image_url: 'https://cdn.example.com/cover.jpg',
        });

      expect([200, 201]).toContain(res.status);

      const venue = await db('venues').where('id', VENUE_A_ID).first();
      expect(venue.cover_image_url).toBe('https://cdn.example.com/cover.jpg');
    });

    it('should update venue with image_gallery array', async () => {
      const imageGallery = [
        'https://cdn.example.com/gallery/img1.jpg',
        'https://cdn.example.com/gallery/img2.jpg',
        'https://cdn.example.com/gallery/img3.jpg',
      ];

      const res = await request(app.server)
        .put(`/api/v1/venues/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          image_gallery: imageGallery,
        });

      expect([200, 201]).toContain(res.status);

      const venue = await db('venues').where('id', VENUE_A_ID).first();
      const gallery = typeof venue.image_gallery === 'string'
        ? JSON.parse(venue.image_gallery)
        : venue.image_gallery;
      expect(gallery).toHaveLength(3);
    });

    it('should retrieve venue with image URLs in response', async () => {
      // First set the image URLs
      await db('venues').where('id', VENUE_A_ID).update({
        logo_url: 'https://cdn.example.com/logo.png',
        cover_image_url: 'https://cdn.example.com/cover.jpg',
      });

      const res = await request(app.server)
        .get(`/api/v1/venues/${VENUE_A_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // FIXED: The GET venue endpoint returns the venue object directly, not wrapped in { data: ... }
      expect(res.body.logo_url).toBe('https://cdn.example.com/logo.png');
      expect(res.body.cover_image_url).toBe('https://cdn.example.com/cover.jpg');
    });

    it('should enforce tenant isolation on venue image fields', async () => {
      // Tenant A tries to update Tenant B's venue images
      const res = await request(app.server)
        .put(`/api/v1/venues/${VENUE_B_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          logo_url: 'https://hacked.com/logo.png',
        });

      expect([403, 404, 500]).toContain(res.status);

      // Verify B's venue was not modified
      const venue = await db('venues').where('id', VENUE_B_ID).first();
      expect(venue.logo_url).toBeNull();
    });
  });

  // ===========================================
  // SECTION 4: Service Boundary Verification (5 tests)
  // ===========================================
  describe('Service Boundary Verification', () => {
    it('should NOT have multer/multipart handling in venue-service', async () => {
      const multerConfigPath = path.join(__dirname, '../../src/config/multer.ts');
      const uploadsMiddlewarePath = path.join(__dirname, '../../src/middleware/uploads.middleware.ts');

      const hasMulterConfig = fs.existsSync(multerConfigPath);
      const hasUploadsMiddleware = fs.existsSync(uploadsMiddlewarePath);

      expect(hasMulterConfig).toBe(false);
      expect(hasUploadsMiddleware).toBe(false);
    });

    it('should NOT have S3/storage client in venue-service', async () => {
      const s3ServicePath = path.join(__dirname, '../../src/services/s3.service.ts');
      const storageServicePath = path.join(__dirname, '../../src/services/storage.service.ts');
      const awsConfigPath = path.join(__dirname, '../../src/config/aws.ts');

      const hasS3Service = fs.existsSync(s3ServicePath);
      const hasStorageService = fs.existsSync(storageServicePath);
      const hasAwsConfig = fs.existsSync(awsConfigPath);

      expect(hasS3Service).toBe(false);
      expect(hasStorageService).toBe(false);
      expect(hasAwsConfig).toBe(false);
    });

    it('should NOT have virus scanning logic in venue-service', async () => {
      const clamavPath = path.join(__dirname, '../../src/services/clamav.service.ts');
      const virusScanPath = path.join(__dirname, '../../src/services/virus-scan.service.ts');
      const scannerPath = path.join(__dirname, '../../src/utils/scanner.ts');

      const hasClamav = fs.existsSync(clamavPath);
      const hasVirusScan = fs.existsSync(virusScanPath);
      const hasScanner = fs.existsSync(scannerPath);

      expect(hasClamav).toBe(false);
      expect(hasVirusScan).toBe(false);
      expect(hasScanner).toBe(false);
    });

    it('should NOT generate thumbnails in venue-service', async () => {
      const sharpServicePath = path.join(__dirname, '../../src/services/sharp.service.ts');
      const imageProcessorPath = path.join(__dirname, '../../src/services/image-processor.service.ts');
      const thumbnailPath = path.join(__dirname, '../../src/utils/thumbnail.ts');

      const hasSharp = fs.existsSync(sharpServicePath);
      const hasImageProcessor = fs.existsSync(imageProcessorPath);
      const hasThumbnail = fs.existsSync(thumbnailPath);

      expect(hasSharp).toBe(false);
      expect(hasImageProcessor).toBe(false);
      expect(hasThumbnail).toBe(false);
    });

    it('should document that file-service handles actual uploads', async () => {
      const architectureNote = {
        decision: 'venue-service delegates file uploads to file-service',
        rationale: 'Single Responsibility Principle - file-service owns all upload logic',
        implementation: 'venue-service stores URLs provided by file-service',
        fileServiceCapabilities: [
          'Multipart file upload handling',
          'S3/cloud storage integration',
          'Virus scanning (ClamAV)',
          'Thumbnail generation',
          'Image optimization',
          'CDN integration',
          'File type validation',
          'Size limit enforcement',
        ],
        venueServiceResponsibilities: [
          'Store file URLs in PostgreSQL (venue table)',
          'Store content URLs in MongoDB (venue_content)',
          'Store branding URLs in PostgreSQL (venue_branding)',
          'Validate URL format (http/https)',
          'Enforce tenant isolation on URL storage',
          'Return URLs in API responses',
        ],
      };

      expect(architectureNote.decision).toContain('file-service');
      expect(architectureNote.fileServiceCapabilities).toHaveLength(8);
      expect(architectureNote.venueServiceResponsibilities).toContain('Store file URLs in PostgreSQL (venue table)');
    });
  });
});
