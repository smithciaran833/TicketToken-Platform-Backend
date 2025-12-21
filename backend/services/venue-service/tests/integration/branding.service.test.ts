/**
 * BrandingService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  createTestVenue,
  ensureTestUser,
  db,
  pool
} from './setup';
import { BrandingService } from '../../src/services/branding.service';
import { v4 as uuidv4 } from 'uuid';

describe('BrandingService', () => {
  let context: TestContext;
  let brandingService: BrandingService;

  beforeAll(async () => {
    context = await setupTestApp();
    brandingService = new BrandingService();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ==========================================================================
  // getBrandingByVenueId
  // ==========================================================================
  describe('getBrandingByVenueId', () => {
    it('should return default branding when no custom branding exists', async () => {
      const result = await brandingService.getBrandingByVenueId(TEST_VENUE_ID);

      expect(result).toBeDefined();
      expect(result.primary_color).toBe('#667eea');
      expect(result.font_family).toBe('Inter');
    });

    it('should return custom branding when it exists', async () => {
      // Create custom branding
      await pool.query(
        `INSERT INTO venue_branding (venue_id, primary_color, font_family)
         VALUES ($1, $2, $3)`,
        [TEST_VENUE_ID, '#FF0000', 'Roboto']
      );

      const result = await brandingService.getBrandingByVenueId(TEST_VENUE_ID);

      expect(result.primary_color).toBe('#FF0000');
      expect(result.font_family).toBe('Roboto');
    });

    it('should return default branding for non-existent venue', async () => {
      const fakeId = uuidv4();
      const result = await brandingService.getBrandingByVenueId(fakeId);

      // Returns default branding, not null
      expect(result).toBeDefined();
      expect(result.primary_color).toBe('#667eea');
    });
  });

  // ==========================================================================
  // getBrandingByDomain
  // ==========================================================================
  describe('getBrandingByDomain', () => {
    it('should return null for non-existent domain', async () => {
      const result = await brandingService.getBrandingByDomain('nonexistent.com');

      expect(result).toBeNull();
    });

    it('should return venue and branding for valid custom domain', async () => {
      // Update venue with custom domain
      await pool.query(
        `UPDATE venues SET custom_domain = $1, pricing_tier = $2 WHERE id = $3`,
        ['mytickets.com', 'white_label', TEST_VENUE_ID]
      );

      // Create branding
      await pool.query(
        `INSERT INTO venue_branding (venue_id, primary_color)
         VALUES ($1, $2)`,
        [TEST_VENUE_ID, '#00FF00']
      );

      const result = await brandingService.getBrandingByDomain('mytickets.com');

      expect(result).toBeDefined();
      expect(result.venue).toBeDefined();
      expect(result.venue.id).toBe(TEST_VENUE_ID);
      expect(result.branding.primary_color).toBe('#00FF00');
    });

    it('should return default branding when venue has no custom branding', async () => {
      // Update venue with custom domain but no branding
      await pool.query(
        `UPDATE venues SET custom_domain = $1, pricing_tier = $2 WHERE id = $3`,
        ['nobranding.com', 'white_label', TEST_VENUE_ID]
      );

      const result = await brandingService.getBrandingByDomain('nobranding.com');

      expect(result).toBeDefined();
      expect(result.venue.id).toBe(TEST_VENUE_ID);
      expect(result.branding.primary_color).toBe('#667eea'); // default
    });
  });

  // ==========================================================================
  // upsertBranding
  // ==========================================================================
  describe('upsertBranding', () => {
    beforeEach(async () => {
      // Set venue to white_label tier so branding is allowed
      await pool.query(
        `UPDATE venues SET pricing_tier = $1 WHERE id = $2`,
        ['white_label', TEST_VENUE_ID]
      );
    });

    it('should create new branding for venue', async () => {
      const config = {
        venueId: TEST_VENUE_ID,
        primaryColor: '#123456',
        fontFamily: 'Arial',
      };

      const result = await brandingService.upsertBranding(config);

      expect(result).toBeDefined();
      expect(result.primary_color).toBe('#123456');
      expect(result.font_family).toBe('Arial');
    });

    it('should update existing branding', async () => {
      // Create initial branding
      await pool.query(
        `INSERT INTO venue_branding (venue_id, primary_color)
         VALUES ($1, $2)`,
        [TEST_VENUE_ID, '#111111']
      );

      const config = {
        venueId: TEST_VENUE_ID,
        primaryColor: '#222222',
        secondaryColor: '#333333',
      };

      const result = await brandingService.upsertBranding(config);

      expect(result.primary_color).toBe('#222222');
      expect(result.secondary_color).toBe('#333333');
    });

    it('should throw error for non-existent venue', async () => {
      const fakeId = uuidv4();
      const config = {
        venueId: fakeId,
        primaryColor: '#000000',
      };

      await expect(brandingService.upsertBranding(config)).rejects.toThrow('Venue not found');
    });

    it('should throw error for standard tier venue', async () => {
      // Set venue back to standard tier
      await pool.query(
        `UPDATE venues SET pricing_tier = $1 WHERE id = $2`,
        ['standard', TEST_VENUE_ID]
      );

      const config = {
        venueId: TEST_VENUE_ID,
        primaryColor: '#000000',
      };

      await expect(brandingService.upsertBranding(config)).rejects.toThrow(
        'Branding customization requires white-label or enterprise tier'
      );
    });

    it('should validate hex color format', async () => {
      const config = {
        venueId: TEST_VENUE_ID,
        primaryColor: 'not-a-color',
      };

      await expect(brandingService.upsertBranding(config)).rejects.toThrow('Invalid hex color');
    });

    it('should accept valid hex colors', async () => {
      const config = {
        venueId: TEST_VENUE_ID,
        primaryColor: '#AABBCC',
        secondaryColor: '#112233',
        accentColor: '#abcdef',
      };

      const result = await brandingService.upsertBranding(config);

      expect(result.primary_color).toBe('#AABBCC');
      expect(result.secondary_color).toBe('#112233');
      expect(result.accent_color).toBe('#abcdef');
    });
  });

  // ==========================================================================
  // getPricingTier
  // ==========================================================================
  describe('getPricingTier', () => {
    it('should return standard tier details', async () => {
      const result = await brandingService.getPricingTier('standard');

      expect(result).toBeDefined();
      expect(result.tier_name).toBe('standard');
      expect(result.hide_platform_branding).toBe(false);
    });

    it('should return white_label tier details', async () => {
      const result = await brandingService.getPricingTier('white_label');

      expect(result).toBeDefined();
      expect(result.tier_name).toBe('white_label');
      expect(result.hide_platform_branding).toBe(true);
      expect(result.custom_domain_allowed).toBe(true);
    });

    it('should return enterprise tier details', async () => {
      const result = await brandingService.getPricingTier('enterprise');

      expect(result).toBeDefined();
      expect(result.tier_name).toBe('enterprise');
    });

    it('should return undefined for non-existent tier', async () => {
      const result = await brandingService.getPricingTier('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // getAllPricingTiers
  // ==========================================================================
  describe('getAllPricingTiers', () => {
    it('should return all pricing tiers ordered by monthly fee', async () => {
      const result = await brandingService.getAllPricingTiers();

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(3);

      // Should be ordered by monthly_fee ascending
      for (let i = 1; i < result.length; i++) {
        expect(parseFloat(result[i].monthly_fee)).toBeGreaterThanOrEqual(
          parseFloat(result[i - 1].monthly_fee)
        );
      }
    });

    it('should include standard, white_label, and enterprise tiers', async () => {
      const result = await brandingService.getAllPricingTiers();

      const tierNames = result.map(t => t.tier_name);
      expect(tierNames).toContain('standard');
      expect(tierNames).toContain('white_label');
      expect(tierNames).toContain('enterprise');
    });
  });

  // ==========================================================================
  // changeTier
  // ==========================================================================
  describe('changeTier', () => {
    it('should upgrade venue from standard to white_label', async () => {
      // Ensure venue is on standard
      await pool.query(
        `UPDATE venues SET pricing_tier = $1 WHERE id = $2`,
        ['standard', TEST_VENUE_ID]
      );

      await brandingService.changeTier(TEST_VENUE_ID, 'white_label', TEST_USER_ID, 'Customer upgrade');

      // Verify venue tier changed
      const venue = await pool.query('SELECT pricing_tier, hide_platform_branding FROM venues WHERE id = $1', [TEST_VENUE_ID]);
      expect(venue.rows[0].pricing_tier).toBe('white_label');
      expect(venue.rows[0].hide_platform_branding).toBe(true);
    });

    it('should record tier change in history', async () => {
      await pool.query(
        `UPDATE venues SET pricing_tier = $1 WHERE id = $2`,
        ['standard', TEST_VENUE_ID]
      );

      await brandingService.changeTier(TEST_VENUE_ID, 'enterprise', TEST_USER_ID, 'Big upgrade');

      const history = await pool.query(
        'SELECT * FROM venue_tier_history WHERE venue_id = $1 ORDER BY changed_at DESC LIMIT 1',
        [TEST_VENUE_ID]
      );

      expect(history.rows.length).toBe(1);
      expect(history.rows[0].from_tier).toBe('standard');
      expect(history.rows[0].to_tier).toBe('enterprise');
      expect(history.rows[0].reason).toBe('Big upgrade');
      expect(history.rows[0].changed_by).toBe(TEST_USER_ID);
    });

    it('should remove custom domain when downgrading to standard', async () => {
      // Setup: white_label with custom domain
      await pool.query(
        `UPDATE venues SET pricing_tier = $1, custom_domain = $2 WHERE id = $3`,
        ['white_label', 'premium.com', TEST_VENUE_ID]
      );

      await pool.query(
        `INSERT INTO custom_domains (venue_id, domain, verification_token, status)
         VALUES ($1, $2, $3, $4)`,
        [TEST_VENUE_ID, 'premium.com', 'token123', 'active']
      );

      await brandingService.changeTier(TEST_VENUE_ID, 'standard', TEST_USER_ID, 'Downgrade');

      // Verify custom domain removed from venue
      const venue = await pool.query('SELECT custom_domain FROM venues WHERE id = $1', [TEST_VENUE_ID]);
      expect(venue.rows[0].custom_domain).toBeNull();

      // Verify custom_domains record suspended
      const domain = await pool.query('SELECT status FROM custom_domains WHERE venue_id = $1', [TEST_VENUE_ID]);
      expect(domain.rows[0].status).toBe('suspended');
    });

    it('should throw error for invalid tier', async () => {
      await expect(
        brandingService.changeTier(TEST_VENUE_ID, 'invalid_tier', TEST_USER_ID)
      ).rejects.toThrow('Invalid pricing tier');
    });

    it('should throw error for non-existent venue', async () => {
      const fakeId = uuidv4();
      await expect(
        brandingService.changeTier(fakeId, 'white_label', TEST_USER_ID)
      ).rejects.toThrow('Venue not found');
    });
  });

  // ==========================================================================
  // getTierHistory
  // ==========================================================================
  describe('getTierHistory', () => {
    it('should return empty array for venue with no history', async () => {
      const result = await brandingService.getTierHistory(TEST_VENUE_ID);

      expect(result).toEqual([]);
    });

    it('should return tier changes in descending order', async () => {
      // Create some history
      await pool.query(
        `INSERT INTO venue_tier_history (venue_id, from_tier, to_tier, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '2 days')`,
        [TEST_VENUE_ID, 'standard', 'white_label', TEST_USER_ID]
      );

      await pool.query(
        `INSERT INTO venue_tier_history (venue_id, from_tier, to_tier, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 day')`,
        [TEST_VENUE_ID, 'white_label', 'enterprise', TEST_USER_ID]
      );

      const result = await brandingService.getTierHistory(TEST_VENUE_ID);

      expect(result.length).toBe(2);
      expect(result[0].to_tier).toBe('enterprise'); // Most recent first
      expect(result[1].to_tier).toBe('white_label');
    });
  });

  // ==========================================================================
  // generateCssVariables
  // ==========================================================================
  describe('generateCssVariables', () => {
    it('should generate CSS with custom colors', async () => {
      const branding = {
        primary_color: '#FF0000',
        secondary_color: '#00FF00',
        accent_color: '#0000FF',
        text_color: '#111111',
        background_color: '#EEEEEE',
        font_family: 'Arial',
        heading_font: 'Georgia',
      };

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('--brand-primary: #FF0000');
      expect(css).toContain('--brand-secondary: #00FF00');
      expect(css).toContain('--brand-accent: #0000FF');
      expect(css).toContain('--brand-text: #111111');
      expect(css).toContain('--brand-background: #EEEEEE');
      expect(css).toContain('--brand-font: Arial');
      expect(css).toContain('--brand-heading-font: Georgia');
    });

    it('should use defaults for missing values', async () => {
      const branding = {};

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('--brand-primary: #667eea');
      expect(css).toContain('--brand-font: Inter');
    });

    it('should include custom CSS if provided', async () => {
      const branding = {
        custom_css: '.my-class { color: red; }',
      };

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('.my-class { color: red; }');
    });
  });
});
