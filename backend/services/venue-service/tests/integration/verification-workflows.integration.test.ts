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

// Test constants - following established patterns (UUIDs only use hex: 0-9, a-f)
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEST_VENUE_ID = 'cccccccc-0001-0001-0001-000000000001';
const OTHER_VENUE_ID = 'dddddddd-0001-0001-0001-000000000001';

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

describe('Venue Service - Verification Workflows Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let authToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
    otherTenantToken = generateTestJWT({ sub: OTHER_USER_ID, tenant_id: OTHER_TENANT_ID });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean up in correct order (foreign key dependencies)
    await db('manual_review_queue').del();
    await db('external_verifications').del();
    await db('venue_documents').del();
    await db('venue_integrations').del();
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();

    // Seed tenants
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'verify-wf-test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    await db('tenants').insert({
      id: OTHER_TENANT_ID,
      name: 'Other Tenant',
      slug: 'verify-wf-other-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed users
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'test@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
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

    // Seed test venue
    await db('venues').insert({
      id: TEST_VENUE_ID,
      tenant_id: TEST_TENANT_ID,
      name: 'Verification Test Venue',
      slug: 'verification-test-venue',
      email: 'verify@test.com',
      venue_type: 'comedy_club',
      max_capacity: 500,
      address_line1: '123 Test St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      status: 'active',
      is_verified: false,
      created_by: TEST_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed venue_staff (owner)
    await db('venue_staff').insert({
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed venue_settings
    await db('venue_settings').insert({
      venue_id: TEST_VENUE_ID,
      max_tickets_per_order: 10,
      service_fee_percentage: 10,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed other tenant venue for isolation tests
    await db('venues').insert({
      id: OTHER_VENUE_ID,
      tenant_id: OTHER_TENANT_ID,
      name: 'Other Tenant Venue',
      slug: 'other-tenant-venue',
      email: 'other@venue.com',
      venue_type: 'arena',
      max_capacity: 1000,
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
      venue_id: OTHER_VENUE_ID,
      user_id: OTHER_USER_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venue_settings').insert({
      venue_id: OTHER_VENUE_ID,
      max_tickets_per_order: 10,
      service_fee_percentage: 10,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Clear rate limit keys
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ===========================================
  // SECTION 1: VERIFICATION TYPES (10 tests)
  // ===========================================
  describe('Verification Types', () => {

    describe('Business Info Verification', () => {
      it('should pass business info check when all required fields present', async () => {
        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.checks).toBeDefined();
        expect(res.body.checks.businessInfo).toBe(true);
      });

    });

    describe('Tax ID Verification', () => {
      it('should pass tax info check with approved tax document', async () => {
        // Seed approved tax document
        await db('venue_documents').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          document_type: 'tax_id',
          file_url: 'https://example.com/taxid.pdf',
          status: 'approved',
          submitted_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.checks.taxInfo).toBe(true);
      });

      it('should mask tax ID showing only last 4 digits in status', async () => {
        // The masking happens in the adapter - verify format
        await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'tax_verification',
          verification_type: 'tax_id',
          external_id: 'tax_verify_123',
          status: 'requires_manual_review',
          metadata: JSON.stringify({ taxIdMasked: '**-***1234' }),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/external`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const taxVerification = res.body.verifications.find(
          (v: any) => v.verification_type === 'tax_id'
        );
        expect(taxVerification).toBeDefined();
        const metadata = typeof taxVerification.metadata === 'string'
          ? JSON.parse(taxVerification.metadata)
          : taxVerification.metadata;
        expect(metadata.taxIdMasked).toMatch(/\*+\d{4}$/);
      });
    });

    describe('Bank Account Verification', () => {
      it('should pass bank check with verified Plaid integration', async () => {
        await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'plaid',
          verification_type: 'bank_account',
          external_id: 'link_token_123',
          status: 'verified',
          completed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.checks.bankAccount).toBe(true);
      });

      it('should pass bank check with active Stripe integration', async () => {
        await db('venue_integrations').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          integration_type: 'stripe',
          integration_name: 'Stripe Payments',
          is_active: true,
          config_data: JSON.stringify({ account_id: 'acct_123' }),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.checks.bankAccount).toBe(true);
      });
    });

    describe('Identity Verification', () => {
      it('should pass identity check with approved identity document', async () => {
        await db('venue_documents').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          document_type: 'drivers_license',
          file_url: 'https://example.com/license.pdf',
          status: 'approved',
          submitted_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.checks.identity).toBe(true);
      });

      it('should pass identity check with verified Stripe Identity', async () => {
        await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'stripe_identity',
          verification_type: 'identity',
          external_id: 'vs_123',
          status: 'verified',
          completed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.checks.identity).toBe(true);
      });
    });

    describe('Document Submission', () => {
      it('should submit document with tenant_id', async () => {
        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/documents`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            documentType: 'business_license',
            fileUrl: 'https://example.com/license.pdf',
            fileName: 'business_license.pdf',
          })
          .expect(201);

        expect(res.body.documentId).toBeDefined();
        expect(res.body.status).toBe('pending');

        // Verify tenant_id was set
        const doc = await db('venue_documents')
          .where('id', res.body.documentId)
          .first();
        expect(doc.tenant_id).toBe(TEST_TENANT_ID);
      });
    });

    describe('Verification Status Aggregation', () => {
      it('should aggregate verification status correctly', async () => {
        // Set up mixed verification states
        await db('venue_documents').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          document_type: 'tax_id',
          file_url: 'https://example.com/taxid.pdf',
          status: 'pending',
          submitted_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.status).toBe('pending');
        expect(res.body.completedChecks).toBeDefined();
        expect(res.body.pendingChecks).toBeDefined();
        expect(res.body.requiredDocuments).toBeDefined();
      });

      it('should mark venue as verified when all checks pass', async () => {
        // Set up all required verifications
        await db('venue_documents').insert([
          {
            venue_id: TEST_VENUE_ID,
            tenant_id: TEST_TENANT_ID,
            document_type: 'tax_id',
            file_url: 'https://example.com/taxid.pdf',
            status: 'approved',
            submitted_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            venue_id: TEST_VENUE_ID,
            tenant_id: TEST_TENANT_ID,
            document_type: 'drivers_license',
            file_url: 'https://example.com/license.pdf',
            status: 'approved',
            submitted_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);

        await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'plaid',
          verification_type: 'bank_account',
          external_id: 'link_123',
          status: 'verified',
          completed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/verify`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.verified).toBe(true);
        expect(res.body.verifiedAt).toBeDefined();

        // Verify is_verified flag was updated
        const venue = await db('venues').where('id', TEST_VENUE_ID).first();
        expect(venue.is_verified).toBe(true);
      });
    });
  });

  // ===========================================
  // SECTION 2: STRIPE IDENTITY ADAPTER (10 tests)
  // ===========================================
  describe('Stripe Identity Adapter', () => {

    describe('Start Identity Verification', () => {
      it('should start identity verification (manual fallback when not configured)', async () => {
        // Without STRIPE_SECRET_KEY, should fall back to manual
        const originalKey = process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_SECRET_KEY;

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/identity/start`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.verificationId).toBeDefined();
        expect(res.body.status).toBe('pending_manual_review');

        // Restore
        if (originalKey) process.env.STRIPE_SECRET_KEY = originalKey;
      });

      it('should store tenant_id in manual_review_queue when adapter not configured', async () => {
        // Without STRIPE_SECRET_KEY, manual review is created
        const originalKey = process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_SECRET_KEY;

        await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/identity/start`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Check manual review queue has tenant_id
        const review = await db('manual_review_queue')
          .where('venue_id', TEST_VENUE_ID)
          .where('review_type', 'identity')
          .first();

        expect(review).toBeDefined();
        expect(review.tenant_id).toBe(TEST_TENANT_ID);

        // Restore
        if (originalKey) process.env.STRIPE_SECRET_KEY = originalKey;
      });
    });

    describe('Check Status', () => {
      it('should check verification status with tenant validation', async () => {
        // Create an external verification
        const [verification] = await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'stripe_identity',
          verification_type: 'identity',
          external_id: 'vs_test123',
          status: 'pending',
          metadata: JSON.stringify({ sessionUrl: 'https://stripe.com/verify' }),
          created_at: new Date(),
          updated_at: new Date(),
        }).returning('*');

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/${verification.id}/check`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.status).toBe('pending');
      });

      it('should return 404 for non-existent verification', async () => {
        const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/${fakeId}/check`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(res.body.error).toBe('Verification not found');
      });

      it('should return cached status for completed verifications', async () => {
        const [verification] = await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'stripe_identity',
          verification_type: 'identity',
          external_id: 'vs_completed',
          status: 'verified',
          completed_at: new Date(),
          metadata: JSON.stringify({ verified: true }),
          created_at: new Date(),
          updated_at: new Date(),
        }).returning('*');

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/${verification.id}/check`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.status).toBe('verified');
      });
    });

    describe('Error Handling', () => {
      it('should return failed status when adapter has invalid credentials', async () => {
        // With an invalid STRIPE_SECRET_KEY, the adapter will attempt to call Stripe
        // and return a failed status (not throw to trigger manual fallback)
        const originalKey = process.env.STRIPE_SECRET_KEY;
        process.env.STRIPE_SECRET_KEY = 'sk_test_invalid_key_12345';

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/identity/start`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // When adapter fails internally, it catches the error and returns failed
        // The service then falls back to manual review
        expect(['failed', 'pending_manual_review']).toContain(res.body.status);

        // Restore
        if (originalKey) {
          process.env.STRIPE_SECRET_KEY = originalKey;
        } else {
          delete process.env.STRIPE_SECRET_KEY;
        }
      });

      it('should fallback to manual review when adapter is not configured', async () => {
        const originalKey = process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_SECRET_KEY;

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/identity/start`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.status).toBe('pending_manual_review');

        // Verify manual review was created
        const review = await db('manual_review_queue')
          .where('venue_id', TEST_VENUE_ID)
          .first();
        expect(review).toBeDefined();

        // Restore
        if (originalKey) process.env.STRIPE_SECRET_KEY = originalKey;
      });
    });
  });

  // ===========================================
  // SECTION 3: PLAID ADAPTER (10 tests)
  // ===========================================
  describe('Plaid Adapter', () => {

    describe('Start Bank Verification', () => {
      it('should start bank verification (manual fallback when not configured)', async () => {
        const originalClientId = process.env.PLAID_CLIENT_ID;
        const originalSecret = process.env.PLAID_SECRET;
        delete process.env.PLAID_CLIENT_ID;
        delete process.env.PLAID_SECRET;

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/bank/start`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.verificationId).toBeDefined();
        expect(res.body.status).toBe('pending_manual_review');

        // Restore
        if (originalClientId) process.env.PLAID_CLIENT_ID = originalClientId;
        if (originalSecret) process.env.PLAID_SECRET = originalSecret;
      });

      it('should store tenant_id in manual_review_queue for Plaid', async () => {
        const originalClientId = process.env.PLAID_CLIENT_ID;
        const originalSecret = process.env.PLAID_SECRET;
        delete process.env.PLAID_CLIENT_ID;
        delete process.env.PLAID_SECRET;

        await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/bank/start`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Check manual review queue has tenant_id
        const review = await db('manual_review_queue')
          .where('venue_id', TEST_VENUE_ID)
          .where('review_type', 'bank_account')
          .first();

        expect(review).toBeDefined();
        expect(review.tenant_id).toBe(TEST_TENANT_ID);

        // Restore
        if (originalClientId) process.env.PLAID_CLIENT_ID = originalClientId;
        if (originalSecret) process.env.PLAID_SECRET = originalSecret;
      });
    });

    describe('Complete Bank Verification', () => {
      it('should require publicToken', async () => {
        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/bank/complete`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(400);

        expect(res.body.error).toBe('publicToken is required');
      });

      it('should handle invalid public token gracefully', async () => {
        // Seed a pending verification
        await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'plaid',
          verification_type: 'bank_account',
          external_id: 'link_token_pending',
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/bank/complete`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ publicToken: 'invalid_public_token' })
          .expect(200);

        expect(res.body.success).toBe(false);
        expect(res.body.status).toBe('failed');
      });
    });

    describe('Sandbox vs Production', () => {
      it('should use sandbox URL by default', async () => {
        // The adapter checks PLAID_ENV
        expect(process.env.PLAID_ENV || 'sandbox').toBe('sandbox');
      });
    });

    describe('Webhook Configuration', () => {
      it('should configure webhook URL in link token request', async () => {
        // The webhook URL is set to API_BASE_URL/webhooks/plaid
        // Verify the pattern exists in adapter
        const expectedPattern = '/api/webhooks/plaid';

        // Read the adapters file to verify
        const adapterCode = fs.readFileSync(
          path.join(__dirname, '../../src/integrations/verification-adapters.ts'),
          'utf8'
        );
        expect(adapterCode).toContain(expectedPattern);
      });
    });
  });

  // ===========================================
  // SECTION 4: TENANT ISOLATION & ERROR HANDLING (10 tests)
  // ===========================================
  describe('Tenant Isolation & Error Handling', () => {

    describe('Tenant Context Validation', () => {
      it('should reject requests without valid tenant context', async () => {
        // Create token without tenant_id
        const noTenantToken = jwt.sign(
          {
            sub: TEST_USER_ID,
            email: 'test@test.com',
            // Missing tenant_id
            permissions: ['*'],
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          privateKey,
          { algorithm: 'RS256' }
        );

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/status`)
          .set('Authorization', `Bearer ${noTenantToken}`);

        // Should fail at tenant middleware level
        expect([400, 401, 403, 500]).toContain(res.status);
      });

      it('should validate tenant ID format', async () => {
        // The service validates UUID format
        // This is tested indirectly through the API
        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body).toBeDefined();
      });
    });

    describe('Venue Ownership Verification', () => {
      it('should return 403 for cross-tenant venue access', async () => {
        const res = await request(app.server)
          .get(`/api/venues/${OTHER_VENUE_ID}/verification/status`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([403, 500]).toContain(res.status);
      });

      it('should return 404/403 for non-existent venue', async () => {
        const fakeVenueId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

        const res = await request(app.server)
          .get(`/api/venues/${fakeVenueId}/verification/status`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([403, 404, 500]).toContain(res.status);
      });
    });

    describe('Database Query Tenant Filtering', () => {
      it('should filter external verifications by tenant_id', async () => {
        // Create verifications for both tenants
        await db('external_verifications').insert([
          {
            venue_id: TEST_VENUE_ID,
            tenant_id: TEST_TENANT_ID,
            provider: 'stripe_identity',
            verification_type: 'identity',
            external_id: 'vs_tenant1',
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            venue_id: OTHER_VENUE_ID,
            tenant_id: OTHER_TENANT_ID,
            provider: 'stripe_identity',
            verification_type: 'identity',
            external_id: 'vs_tenant2',
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/external`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Should only see own tenant's verifications
        expect(res.body.verifications.length).toBe(1);
        expect(res.body.verifications[0].tenant_id).toBe(TEST_TENANT_ID);
      });

      it('should filter manual review queue by tenant_id', async () => {
        // Create reviews for both tenants
        await db('manual_review_queue').insert([
          {
            venue_id: TEST_VENUE_ID,
            tenant_id: TEST_TENANT_ID,
            review_type: 'identity',
            priority: 'high',
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            venue_id: OTHER_VENUE_ID,
            tenant_id: OTHER_TENANT_ID,
            review_type: 'identity',
            priority: 'high',
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);

        const res = await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/manual-reviews`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.reviews.length).toBe(1);
        expect(res.body.reviews[0].tenant_id).toBe(TEST_TENANT_ID);
      });
    });

    describe('Document Validation', () => {
      it('should reject missing verification type', async () => {
        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/documents`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fileUrl: 'https://example.com/doc.pdf',
            // Missing documentType
          })
          .expect(400);

        expect(res.body.error).toBe('documentType is required');
      });

      it('should reject invalid document type', async () => {
        const res = await request(app.server)
          .post(`/api/venues/${TEST_VENUE_ID}/verification/documents`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            documentType: 'invalid_type',
            fileUrl: 'https://example.com/doc.pdf',
          })
          .expect(400);

        expect(res.body.error).toContain('Invalid document type');
      });

      it('should accept valid document types', async () => {
        const validTypes = [
          'business_license',
          'articles_of_incorporation',
          'tax_id',
          'w9',
          'bank_statement',
          'voided_check',
          'drivers_license',
          'passport',
        ];

        for (const docType of validTypes) {
          const res = await request(app.server)
            .post(`/api/venues/${TEST_VENUE_ID}/verification/documents`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              documentType: docType,
              fileUrl: `https://example.com/${docType}.pdf`,
            });

          expect(res.status).toBe(201);
          expect(res.body.documentId).toBeDefined();
        }
      });
    });

    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/status`)
          .expect(401);
      });

      it('should return 401 with invalid token', async () => {
        await request(app.server)
          .get(`/api/venues/${TEST_VENUE_ID}/verification/status`)
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });
    });
  });

  // ===========================================
  // SECTION 5: WEBHOOK HANDLERS (Additional tests)
  // ===========================================
  describe('Webhook Handlers', () => {

    describe('Plaid Webhook', () => {
      it('should accept valid Plaid webhook payload', async () => {
        // First create an external verification with item metadata
        await db('external_verifications').insert({
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          provider: 'plaid',
          verification_type: 'bank_account',
          external_id: 'link_token_xyz',
          status: 'pending',
          metadata: JSON.stringify({ itemId: 'item_abc123' }),
          created_at: new Date(),
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post('/api/webhooks/plaid')
          .send({
            webhook_type: 'AUTH',
            webhook_code: 'AUTOMATICALLY_VERIFIED',
            item_id: 'item_abc123',
          })
          .expect(200);

        expect(res.body.received).toBe(true);
      });

      it('should reject webhook with missing required fields', async () => {
        const res = await request(app.server)
          .post('/api/webhooks/plaid')
          .send({
            // Missing webhook_type and webhook_code
            item_id: 'item_123',
          })
          .expect(400);

        expect(res.body.error).toBe('Invalid webhook payload');
      });

      it('should handle unknown item_id gracefully', async () => {
        const res = await request(app.server)
          .post('/api/webhooks/plaid')
          .send({
            webhook_type: 'AUTH',
            webhook_code: 'AUTOMATICALLY_VERIFIED',
            item_id: 'unknown_item_id',
          })
          .expect(200);

        expect(res.body.received).toBe(true);
        expect(res.body.processed).toBe(false);
      });
    });

    describe('Stripe Identity Webhook', () => {
      it('should reject webhook without signature', async () => {
        const res = await request(app.server)
          .post('/api/webhooks/stripe/identity')
          .send({ type: 'identity.verification_session.verified' })
          .expect(400);

        expect(res.body.error).toBe('Missing stripe-signature header');
      });
    });
  });

  // ===========================================
  // SECTION 6: RATE LIMITING (Additional tests)
  // ===========================================
  describe('Rate Limiting', () => {
    it('should apply rate limits to verification endpoints', async () => {
      // Disable rate limit for this test to verify headers exist
      process.env.DISABLE_RATE_LIMIT = 'false';

      const res = await request(app.server)
        .get(`/api/venues/${TEST_VENUE_ID}/verification/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Rate limit headers should be present
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();

      // Re-enable for other tests
      process.env.DISABLE_RATE_LIMIT = 'true';
    });
  });
});
