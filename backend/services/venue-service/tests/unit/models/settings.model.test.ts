/**
 * Unit tests for SettingsModel
 * Tests venue settings management (uses venue_settings table)
 * Note: Does NOT extend BaseModel
 */

import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';
import { SettingsModel, IVenueSettings } from '../../../src/models/settings.model';

describe('SettingsModel', () => {
  let mockKnex: any;
  let settingsModel: SettingsModel;

  const sampleDbRow = {
    venue_id: 'venue-123',
    max_tickets_per_order: 10,
    accepted_currencies: ['USD'],
    payment_methods: ['card', 'crypto'],
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  beforeEach(() => {
    mockKnex = createKnexMock();
    settingsModel = new SettingsModel(mockKnex);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getVenueSettings', () => {
    it('should return settings for venue', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await settingsModel.getVenueSettings('venue-123');

      expect(mockKnex).toHaveBeenCalledWith('venue_settings');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-123' });
      expect(result).toBeDefined();
      expect(result.ticketing?.maxTicketsPerOrder).toBe(10);
    });

    it('should return default settings when no row exists', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await settingsModel.getVenueSettings('venue-456');

      expect(result).toBeDefined();
      expect(result.general?.timezone).toBe('America/New_York');
      expect(result.general?.currency).toBe('USD');
      expect(result.ticketing?.maxTicketsPerOrder).toBe(10);
    });
  });

  describe('updateVenueSettings', () => {
    it('should update existing settings', async () => {
      mockKnex._mockChain.first
        .mockResolvedValueOnce(sampleDbRow) // Existing check
        .mockResolvedValueOnce({ ...sampleDbRow, max_tickets_per_order: 20 }); // After update
      mockKnex._mockChain.update.mockResolvedValue(1);

      const result = await settingsModel.updateVenueSettings('venue-123', {
        ticketing: { maxTicketsPerOrder: 20 },
      });

      expect(mockKnex._mockChain.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should insert new settings when none exist', async () => {
      mockKnex._mockChain.first
        .mockResolvedValueOnce(null) // No existing
        .mockResolvedValueOnce(sampleDbRow); // After insert
      mockKnex._mockChain.insert.mockResolvedValue([1]);

      const result = await settingsModel.updateVenueSettings('venue-456', {
        ticketing: { maxTicketsPerOrder: 15 },
      });

      expect(mockKnex._mockChain.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should set updated_at on update', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);
      mockKnex._mockChain.update.mockResolvedValue(1);

      await settingsModel.updateVenueSettings('venue-123', {
        ticketing: { maxTicketsPerOrder: 5 },
      });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('updateSettingSection', () => {
    it('should update specific section only', async () => {
      mockKnex._mockChain.first
        .mockResolvedValueOnce(sampleDbRow) // getVenueSettings
        .mockResolvedValueOnce(sampleDbRow) // existing check in update
        .mockResolvedValueOnce(sampleDbRow); // return after update
      mockKnex._mockChain.update.mockResolvedValue(1);

      const result = await settingsModel.updateSettingSection('venue-123', 'ticketing', {
        maxTicketsPerOrder: 25,
      });

      expect(result.ticketing?.maxTicketsPerOrder).toBeDefined();
    });

    it('should merge section settings with existing', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);
      mockKnex._mockChain.update.mockResolvedValue(1);

      await settingsModel.updateSettingSection('venue-123', 'general', {
        timezone: 'America/Los_Angeles',
      });

      // Should preserve existing currency while updating timezone
      expect(mockKnex._mockChain.update).toHaveBeenCalled();
    });
  });

  describe('getDefaultSettings', () => {
    it('should return complete default settings', () => {
      const defaults = settingsModel.getDefaultSettings();

      // General section
      expect(defaults.general).toBeDefined();
      expect(defaults.general?.timezone).toBe('America/New_York');
      expect(defaults.general?.currency).toBe('USD');
      expect(defaults.general?.language).toBe('en');
      expect(defaults.general?.dateFormat).toBe('MM/DD/YYYY');
      expect(defaults.general?.timeFormat).toBe('12h');

      // Ticketing section
      expect(defaults.ticketing).toBeDefined();
      expect(defaults.ticketing?.allowRefunds).toBe(true);
      expect(defaults.ticketing?.refundWindow).toBe(24);
      expect(defaults.ticketing?.maxTicketsPerOrder).toBe(10);
      expect(defaults.ticketing?.requirePhoneNumber).toBe(false);
      expect(defaults.ticketing?.enableWaitlist).toBe(false);
      expect(defaults.ticketing?.transferDeadline).toBe(2);

      // Notifications section
      expect(defaults.notifications).toBeDefined();
      expect(defaults.notifications?.emailEnabled).toBe(true);
      expect(defaults.notifications?.smsEnabled).toBe(false);
      expect(defaults.notifications?.webhookUrl).toBeUndefined();
      expect(defaults.notifications?.notifyOnPurchase).toBe(true);
      expect(defaults.notifications?.notifyOnRefund).toBe(true);
      expect(defaults.notifications?.dailyReportEnabled).toBe(false);

      // Branding section
      expect(defaults.branding).toBeDefined();
      expect(defaults.branding?.primaryColor).toBe('#000000');
      expect(defaults.branding?.secondaryColor).toBe('#666666');
      expect(defaults.branding?.logo).toBeUndefined();
      expect(defaults.branding?.emailFooter).toBeUndefined();
      expect(defaults.branding?.customDomain).toBeUndefined();

      // Payment section
      expect(defaults.payment).toBeDefined();
      expect(defaults.payment?.currency).toBe('USD');
      expect(defaults.payment?.taxRate).toBe(0);
      expect(defaults.payment?.includeTaxInPrice).toBe(false);
      expect(defaults.payment?.paymentMethods).toEqual(['card']);

      // Features section
      expect(defaults.features).toBeDefined();
      expect(defaults.features?.nftEnabled).toBe(true);
      expect(defaults.features?.qrCodeEnabled).toBe(true);
      expect(defaults.features?.seasonPassEnabled).toBe(false);
      expect(defaults.features?.groupDiscountsEnabled).toBe(false);
    });
  });

  describe('validateSettings', () => {
    it('should validate valid settings', async () => {
      const validSettings: IVenueSettings = {
        general: { currency: 'USD' },
        branding: { primaryColor: '#FF0000' },
        notifications: { webhookUrl: 'https://example.com/webhook' },
      };

      const result = await settingsModel.validateSettings(validSettings);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid currency code', async () => {
      const invalidSettings: IVenueSettings = {
        general: { currency: 'INVALID' },
      };

      const result = await settingsModel.validateSettings(invalidSettings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid currency code');
    });

    it('should accept valid currency codes', async () => {
      const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      
      for (const currency of currencies) {
        const settings: IVenueSettings = {
          general: { currency },
        };
        const result = await settingsModel.validateSettings(settings);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid hex color', async () => {
      const invalidSettings: IVenueSettings = {
        branding: { primaryColor: 'not-a-color' },
      };

      const result = await settingsModel.validateSettings(invalidSettings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid primary color format');
    });

    it('should accept valid hex colors', async () => {
      const validColors = ['#000000', '#FFFFFF', '#FF0000', '#00ff00', '#0000FF'];
      
      for (const color of validColors) {
        const settings: IVenueSettings = {
          branding: { primaryColor: color },
        };
        const result = await settingsModel.validateSettings(settings);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid webhook URL', async () => {
      const invalidSettings: IVenueSettings = {
        notifications: { webhookUrl: 'not-a-valid-url' },
      };

      const result = await settingsModel.validateSettings(invalidSettings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid webhook URL');
    });

    it('should accept valid webhook URLs', async () => {
      const validUrls = [
        'https://example.com/webhook',
        'http://localhost:3000/hook',
        'https://api.mysite.com/v1/webhooks/venue',
      ];
      
      for (const url of validUrls) {
        const settings: IVenueSettings = {
          notifications: { webhookUrl: url },
        };
        const result = await settingsModel.validateSettings(settings);
        expect(result.valid).toBe(true);
      }
    });

    it('should handle empty settings', async () => {
      const emptySettings: IVenueSettings = {};

      const result = await settingsModel.validateSettings(emptySettings);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors', async () => {
      const multipleInvalidSettings: IVenueSettings = {
        general: { currency: 'INVALID' },
        branding: { primaryColor: 'bad-color' },
        notifications: { webhookUrl: 'not-url' },
      };

      const result = await settingsModel.validateSettings(multipleInvalidSettings);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  describe('rowToSettings (private - tested via getVenueSettings)', () => {
    it('should transform DB row to settings structure', async () => {
      mockKnex._mockChain.first.mockResolvedValue({
        venue_id: 'venue-123',
        max_tickets_per_order: 20,
        accepted_currencies: ['EUR'],
        payment_methods: ['card', 'bank'],
      });

      const result = await settingsModel.getVenueSettings('venue-123');

      expect(result.ticketing?.maxTicketsPerOrder).toBe(20);
      expect(result.payment?.currency).toBe('EUR');
      expect(result.payment?.paymentMethods).toEqual(['card', 'bank']);
      expect(result.general?.currency).toBe('EUR');
    });

    it('should use first currency from accepted_currencies', async () => {
      mockKnex._mockChain.first.mockResolvedValue({
        venue_id: 'venue-123',
        accepted_currencies: ['GBP', 'EUR'],
      });

      const result = await settingsModel.getVenueSettings('venue-123');

      expect(result.general?.currency).toBe('GBP');
      expect(result.payment?.currency).toBe('GBP');
    });
  });

  describe('settingsToRow (private - tested via updateVenueSettings)', () => {
    it('should map maxTicketsPerOrder to max_tickets_per_order', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);
      mockKnex._mockChain.update.mockResolvedValue(1);

      await settingsModel.updateVenueSettings('venue-123', {
        ticketing: { maxTicketsPerOrder: 15 },
      });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.max_tickets_per_order).toBe(15);
    });

    it('should map paymentMethods to payment_methods', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);
      mockKnex._mockChain.update.mockResolvedValue(1);

      await settingsModel.updateVenueSettings('venue-123', {
        payment: { paymentMethods: ['card', 'crypto'] },
      });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.payment_methods).toEqual(['card', 'crypto']);
    });

    it('should map payment currency to accepted_currencies', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);
      mockKnex._mockChain.update.mockResolvedValue(1);

      await settingsModel.updateVenueSettings('venue-123', {
        payment: { currency: 'EUR' },
      });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.accepted_currencies).toEqual(['EUR']);
    });

    it('should map general currency to accepted_currencies', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);
      mockKnex._mockChain.update.mockResolvedValue(1);

      await settingsModel.updateVenueSettings('venue-123', {
        general: { currency: 'CAD' },
      });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.accepted_currencies).toEqual(['CAD']);
    });
  });
});
