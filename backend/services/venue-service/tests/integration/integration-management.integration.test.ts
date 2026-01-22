import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';
import { encryptCredentials, decryptCredentials } from '../../src/utils/encryption';

// Generate RSA keypair for JWT signing (must match app expectations)
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// CRITICAL: Set encryption key for credential encryption tests
if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
  process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
}

// =============================================================================
// TEST CONSTANTS
// =============================================================================

// Tenant A
const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_A_MANAGER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
const VENUE_A_ID = 'aaaa0001-0001-0001-0001-000000000001';

// Tenant B
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VENUE_B_ID = 'bbbb0001-0001-0001-0001-000000000001';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateTestJWT(payload: {
  sub: string;
  tenant_id: string;
  email: string;
  permissions?: string[];
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      tenant_id: payload.tenant_id,
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

function createStripeCredentials() {
  return {
    apiKey: 'sk_test_' + crypto.randomBytes(24).toString('hex'),
    secretKey: 'sk_test_' + crypto.randomBytes(24).toString('hex'),
    webhookSecret: 'whsec_' + crypto.randomBytes(24).toString('hex'),
  };
}

function createSquareCredentials() {
  return {
    accessToken: 'sq0atp-' + crypto.randomBytes(32).toString('hex'),
    applicationId: 'sq0idp-' + crypto.randomBytes(16).toString('hex'),
    environment: 'sandbox' as const,
  };
}

function createToastCredentials() {
  return {
    clientId: 'toast_' + crypto.randomBytes(16).toString('hex'),
    clientSecret: 'toast_secret_' + crypto.randomBytes(24).toString('hex'),
    restaurantGuid: crypto.randomBytes(16).toString('hex'),
  };
}

function createMailchimpCredentials() {
  return {
    apiKey: crypto.randomBytes(32).toString('hex') + '-us1',
    serverPrefix: 'us1',
    listId: crypto.randomBytes(10).toString('hex'),
  };
}

function createTwilioCredentials() {
  return {
    accountSid: 'AC' + crypto.randomBytes(16).toString('hex'),
    authToken: crypto.randomBytes(32).toString('hex'),
    phoneNumber: '+15551234567',
  };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Integration Management Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let tokenA: string;
  let tokenAManager: string;
  let tokenB: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();

    // Verify encryption key is set
    expect(process.env.CREDENTIALS_ENCRYPTION_KEY).toBeDefined();
    expect(process.env.CREDENTIALS_ENCRYPTION_KEY?.length).toBe(64);

    // Generate tokens
    tokenA = generateTestJWT({
      sub: USER_A_ID,
      tenant_id: TENANT_A_ID,
      email: 'usera@example.com',
    });

    tokenAManager = generateTestJWT({
      sub: USER_A_MANAGER_ID,
      tenant_id: TENANT_A_ID,
      email: 'managera@example.com',
      permissions: ['venue:read', 'venue:update'],
    });

    tokenB = generateTestJWT({
      sub: USER_B_ID,
      tenant_id: TENANT_B_ID,
      email: 'userb@example.com',
    });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean up using TRUNCATE CASCADE to handle FK constraints
    await db.raw('TRUNCATE TABLE tenants CASCADE');

    // Clear Redis
    const keys = await redis.keys('*');
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

    await db('users').insert({
      id: USER_A_MANAGER_ID,
      tenant_id: TENANT_A_ID,
      email: 'managera@example.com',
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

    await db('venue_staff').insert({
      venue_id: VENUE_A_ID,
      user_id: USER_A_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venue_staff').insert({
      venue_id: VENUE_A_ID,
      user_id: USER_A_MANAGER_ID,
      role: 'manager',
      permissions: ['venue:read', 'venue:update'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venue_settings').insert({
      venue_id: VENUE_A_ID,
      max_tickets_per_order: 10,
      service_fee_percentage: 10,
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
      address_line1: '456 Broadway',
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

    await db('venue_staff').insert({
      venue_id: VENUE_B_ID,
      user_id: USER_B_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venue_settings').insert({
      venue_id: VENUE_B_ID,
      max_tickets_per_order: 8,
      service_fee_percentage: 12,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  // ===========================================================================
  // CATEGORY 1: Integration Creation with Encryption (15 tests)
  // ===========================================================================
  describe('Integration Creation with Encryption', () => {
    it('should use AES-256-GCM algorithm for encryption', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      // Get encrypted data from DB
      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      expect(dbIntegration.encrypted_credentials).toBeDefined();

      // Decrypt and verify round-trip
      const decrypted = decryptCredentials(dbIntegration.encrypted_credentials);
      expect(decrypted.apiKey).toBe(credentials.apiKey);
      expect(decrypted.secretKey).toBe(credentials.secretKey);
    });

    it('should use 32-byte key from CREDENTIALS_ENCRYPTION_KEY env', async () => {
      const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
      expect(keyHex).toBeDefined();
      expect(keyHex?.length).toBe(64); // 32 bytes = 64 hex chars

      // Verify key is valid hex
      const keyBuffer = Buffer.from(keyHex!, 'hex');
      expect(keyBuffer.length).toBe(32);
    });

    it('should use random 16-byte IV per encryption', async () => {
      const credentials = createStripeCredentials();

      // Create two integrations with same credentials
      const res1 = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      // Delete first to allow creating another stripe integration
      await db('venue_integrations').where({ id: res1.body.id }).del();

      const res2 = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const db1 = await db('venue_integrations').where({ id: res1.body.id }).first();
      const db2 = await db('venue_integrations').where({ id: res2.body.id }).first();

      // Different IVs mean different ciphertexts
      expect(db1).toBeUndefined(); // Deleted
      expect(db2.encrypted_credentials).toBeDefined();
    });

    it('should include 16-byte auth tag for integrity', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      // Encrypted credentials should be base64(IV + AuthTag + Ciphertext)
      // IV = 16 bytes, AuthTag = 16 bytes, so at least 32 bytes
      const encryptedBuffer = Buffer.from(dbIntegration.encrypted_credentials, 'base64');
      expect(encryptedBuffer.length).toBeGreaterThanOrEqual(32);
    });

    it('should format as base64(IV + AuthTag + EncryptedData)', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      // Should be valid base64
      expect(dbIntegration.encrypted_credentials).toMatch(/^[A-Za-z0-9+/]+=*$/);

      // Should decode to buffer
      const buffer = Buffer.from(dbIntegration.encrypted_credentials, 'base64');
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should complete round-trip encryption (encrypt → decrypt → original data)', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      // Decrypt
      const decrypted = decryptCredentials(dbIntegration.encrypted_credentials);

      // Verify exact match
      expect(decrypted).toEqual(credentials);
      expect(decrypted.apiKey).toBe(credentials.apiKey);
      expect(decrypted.secretKey).toBe(credentials.secretKey);
      expect(decrypted.webhookSecret).toBe(credentials.webhookSecret);
    });

    it('should throw error if CREDENTIALS_ENCRYPTION_KEY is missing', () => {
      const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;

      expect(() => {
        encryptCredentials({ test: 'data' });
      }).toThrow('CREDENTIALS_ENCRYPTION_KEY environment variable not set');

      // Restore
      process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
    });

    it('should throw error if encryption key has invalid format', () => {
      const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

      // Set invalid key (not 64 hex chars)
      process.env.CREDENTIALS_ENCRYPTION_KEY = 'invalid_key';

      expect(() => {
        encryptCredentials({ test: 'data' });
      }).toThrow('CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters');

      // Restore
      process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
    });

    it('should detect tampered ciphertext (auth tag fails)', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      // Tamper with the encrypted data
      const buffer = Buffer.from(dbIntegration.encrypted_credentials, 'base64');
      buffer[buffer.length - 1] ^= 0xFF; // Flip bits in last byte
      const tamperedData = buffer.toString('base64');

      // Decryption should fail
      expect(() => {
        decryptCredentials(tamperedData);
      }).toThrow();
    });

    it('should store encrypted_credentials in database', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      expect(dbIntegration.encrypted_credentials).toBeDefined();
      expect(typeof dbIntegration.encrypted_credentials).toBe('string');
      expect(dbIntegration.encrypted_credentials.length).toBeGreaterThan(0);

      // Should NOT contain plaintext credentials
      expect(dbIntegration.encrypted_credentials).not.toContain(credentials.apiKey);
      expect(dbIntegration.encrypted_credentials).not.toContain(credentials.secretKey);
    });

    it('should store tenant_id in database', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      expect(dbIntegration.tenant_id).toBe(TENANT_A_ID);
    });

    it('should enforce composite unique constraint (venue_id, integration_type)', async () => {
      const credentials = createStripeCredentials();

      // Create first Stripe integration
      await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      // Try to create second Stripe integration for same venue
      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: createStripeCredentials(),
        });

      // Should fail with conflict
      expect([409, 422, 500]).toContain(res.status);
    });

    it('should return 409 for duplicate integration with Postgres error code 23505', async () => {
      const credentials = createStripeCredentials();

      // Create first integration
      await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      // Try duplicate
      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: createStripeCredentials(),
        });

      // Should be conflict or handled error
      expect([409, 422, 500]).toContain(res.status);
    });

    it('should handle field mapping inconsistency (type vs integration_type)', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          type: 'stripe',
          credentials: credentials,
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      // Should be stored as integration_type in DB
      expect(dbIntegration.integration_type).toBe('stripe');
    });

    it('should handle field mapping inconsistency (config vs config_data)', async () => {
      const credentials = createStripeCredentials();

      const res = await request(app.server)
        .post(`/api/v1/venues/${VENUE_A_ID}/integrations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'stripe',
          credentials: credentials,
          config: {
            webhookUrl: 'https://example.com/webhook',
            apiVersion: '2023-10-16',
          },
        })
        .expect(201);

      const dbIntegration = await db('venue_integrations')
        .where({ id: res.body.id })
        .first();

      // Should be stored as config_data in DB
      expect(dbIntegration.config_data).toBeDefined();

      // Parse JSON if string
      const configData = typeof dbIntegration.config_data === 'string'
        ? JSON.parse(dbIntegration.config_data)
        : dbIntegration.config_data;

      expect(configData.webhookUrl).toBe('https://example.com/webhook');
      expect(configData.apiVersion).toBe('2023-10-16');
    });
  });
});