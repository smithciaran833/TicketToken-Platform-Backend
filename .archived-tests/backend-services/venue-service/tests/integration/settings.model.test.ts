/**
 * SettingsModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { SettingsModel, IVenueSettings } from '../../src/models/settings.model';

describe('SettingsModel', () => {
  let context: TestContext;
  let settingsModel: SettingsModel;

  beforeAll(async () => {
    context = await setupTestApp();
    settingsModel = new SettingsModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await pool.query('DELETE FROM venue_settings WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  // ==========================================================================
  // getDefaultSettings
  // ==========================================================================
  describe('getDefaultSettings', () => {
    it('should return complete default settings', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.general).toBeDefined();
      expect(defaults.ticketing).toBeDefined();
      expect(defaults.notifications).toBeDefined();
      expect(defaults.branding).toBeDefined();
      expect(defaults.payment).toBeDefined();
      expect(defaults.features).toBeDefined();
    });

    it('should have correct general defaults', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.general!.timezone).toBe('America/New_York');
      expect(defaults.general!.currency).toBe('USD');
      expect(defaults.general!.language).toBe('en');
      expect(defaults.general!.dateFormat).toBe('MM/DD/YYYY');
      expect(defaults.general!.timeFormat).toBe('12h');
    });

    it('should have correct ticketing defaults', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.ticketing!.allowRefunds).toBe(true);
      expect(defaults.ticketing!.refundWindow).toBe(24);
      expect(defaults.ticketing!.maxTicketsPerOrder).toBe(10);
      expect(defaults.ticketing!.requirePhoneNumber).toBe(false);
      expect(defaults.ticketing!.enableWaitlist).toBe(false);
      expect(defaults.ticketing!.transferDeadline).toBe(2);
    });

    it('should have correct notification defaults', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.notifications!.emailEnabled).toBe(true);
      expect(defaults.notifications!.smsEnabled).toBe(false);
      expect(defaults.notifications!.notifyOnPurchase).toBe(true);
      expect(defaults.notifications!.notifyOnRefund).toBe(true);
      expect(defaults.notifications!.dailyReportEnabled).toBe(false);
    });

    it('should have correct branding defaults', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.branding!.primaryColor).toBe('#000000');
      expect(defaults.branding!.secondaryColor).toBe('#666666');
    });

    it('should have correct payment defaults', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.payment!.currency).toBe('USD');
      expect(defaults.payment!.taxRate).toBe(0);
      expect(defaults.payment!.includeTaxInPrice).toBe(false);
      expect(defaults.payment!.paymentMethods).toEqual(['card']);
    });

    it('should have correct feature defaults', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.features!.nftEnabled).toBe(true);
      expect(defaults.features!.qrCodeEnabled).toBe(true);
      expect(defaults.features!.seasonPassEnabled).toBe(false);
      expect(defaults.features!.groupDiscountsEnabled).toBe(false);
    });
  });

  // ==========================================================================
  // getVenueSettings
  // ==========================================================================
  describe('getVenueSettings', () => {
    it('should return default settings when none exist', async () => {
      const settings = await settingsModel.getVenueSettings(TEST_VENUE_ID);

      expect(settings).toBeDefined();
      expect(settings.general).toBeDefined();
      expect(settings.general!.currency).toBe('USD');
    });

    it('should return stored settings', async () => {
      await pool.query(
        `INSERT INTO venue_settings (venue_id, max_tickets_per_order, accepted_currencies)
         VALUES ($1, $2, $3)`,
        [TEST_VENUE_ID, 20, ['EUR']]
      );

      const settings = await settingsModel.getVenueSettings(TEST_VENUE_ID);

      expect(settings.ticketing!.maxTicketsPerOrder).toBe(20);
      expect(settings.general!.currency).toBe('EUR');
    });
  });

  // ==========================================================================
  // updateVenueSettings
  // ==========================================================================
  describe('updateVenueSettings', () => {
    it('should create settings when none exist', async () => {
      const updated = await settingsModel.updateVenueSettings(TEST_VENUE_ID, {
        ticketing: { maxTicketsPerOrder: 25 }
      });

      expect(updated.ticketing!.maxTicketsPerOrder).toBe(25);

      // Verify in DB
      const result = await pool.query(
        'SELECT max_tickets_per_order FROM venue_settings WHERE venue_id = $1',
        [TEST_VENUE_ID]
      );
      expect(result.rows[0].max_tickets_per_order).toBe(25);
    });

    it('should update existing settings', async () => {
      await pool.query(
        `INSERT INTO venue_settings (venue_id, max_tickets_per_order)
         VALUES ($1, $2)`,
        [TEST_VENUE_ID, 10]
      );

      const updated = await settingsModel.updateVenueSettings(TEST_VENUE_ID, {
        ticketing: { maxTicketsPerOrder: 30 }
      });

      expect(updated.ticketing!.maxTicketsPerOrder).toBe(30);
    });

    it('should update payment methods', async () => {
      const updated = await settingsModel.updateVenueSettings(TEST_VENUE_ID, {
        payment: { paymentMethods: ['card', 'apple_pay', 'google_pay'] }
      });

      expect(updated.payment!.paymentMethods).toEqual(['card', 'apple_pay', 'google_pay']);
    });

    it('should update currency', async () => {
      const updated = await settingsModel.updateVenueSettings(TEST_VENUE_ID, {
        general: { currency: 'EUR' }
      });

      expect(updated.general!.currency).toBe('EUR');
    });
  });

  // ==========================================================================
  // updateSettingSection
  // ==========================================================================
  describe('updateSettingSection', () => {
    it('should update specific section', async () => {
      const updated = await settingsModel.updateSettingSection(
        TEST_VENUE_ID,
        'ticketing',
        { maxTicketsPerOrder: 50 }
      );

      expect(updated.ticketing!.maxTicketsPerOrder).toBe(50);
    });
  });

  // ==========================================================================
  // validateSettings
  // ==========================================================================
  describe('validateSettings', () => {
    it('should validate valid settings', async () => {
      const result = await settingsModel.validateSettings({
        general: { currency: 'USD' },
        branding: { primaryColor: '#000000' }
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept all valid currencies', async () => {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

      for (const currency of validCurrencies) {
        const result = await settingsModel.validateSettings({
          general: { currency }
        });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid currency', async () => {
      const result = await settingsModel.validateSettings({
        general: { currency: 'INVALID' }
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid currency code');
    });

    it('should accept valid hex colors', async () => {
      const validColors = ['#000000', '#FFFFFF', '#123ABC', '#abcdef'];

      for (const color of validColors) {
        const result = await settingsModel.validateSettings({
          branding: { primaryColor: color }
        });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid hex color', async () => {
      const result = await settingsModel.validateSettings({
        branding: { primaryColor: 'not-a-color' }
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid primary color format');
    });

    it('should accept valid webhook URL', async () => {
      const result = await settingsModel.validateSettings({
        notifications: { webhookUrl: 'https://example.com/webhook' }
      });

      expect(result.valid).toBe(true);
    });

    it('should reject invalid webhook URL', async () => {
      const result = await settingsModel.validateSettings({
        notifications: { webhookUrl: 'not-a-url' }
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid webhook URL');
    });

    it('should collect multiple errors', async () => {
      const result = await settingsModel.validateSettings({
        general: { currency: 'INVALID' },
        branding: { primaryColor: 'bad-color' },
        notifications: { webhookUrl: 'not-url' }
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });

    it('should validate empty settings', async () => {
      const result = await settingsModel.validateSettings({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
