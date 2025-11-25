import { SettingsModel } from '../../../src/models/settings.model';

describe('SettingsModel', () => {
  let settingsModel: SettingsModel;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    settingsModel = new SettingsModel(mockDb);
  });

  // =============================================================================
  // getVenueSettings() - 3 test cases
  // =============================================================================

  describe('getVenueSettings()', () => {
    it('should return venue settings if they exist', async () => {
      const mockSettings = {
        general: { timezone: 'America/Los_Angeles' },
        ticketing: { allowRefunds: false },
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: mockSettings });

      const result = await settingsModel.getVenueSettings('venue-1');

      expect(result).toEqual(mockSettings);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'venue-1' });
    });

    it('should return default settings if venue has no settings', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: null });

      const result = await settingsModel.getVenueSettings('venue-1');

      expect(result).toEqual(settingsModel.getDefaultSettings());
    });

    it('should exclude soft-deleted venues', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      await settingsModel.getVenueSettings('venue-1');

      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  // =============================================================================
  // updateVenueSettings() - 4 test cases
  // =============================================================================

  describe('updateVenueSettings()', () => {
    it('should merge new settings with existing settings', async () => {
      const currentSettings = {
        general: { timezone: 'America/New_York', currency: 'USD' },
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: currentSettings });

      const updates = {
        general: { timezone: 'America/Los_Angeles' },
      };

      const result = await settingsModel.updateVenueSettings('venue-1', updates);

      expect(result.general?.timezone).toBe('America/Los_Angeles');
      expect(result.general?.currency).toBe('USD'); // Preserved
    });

    it('should update database with new settings', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: {} });

      const updates = { general: { timezone: 'UTC' } };

      await settingsModel.updateVenueSettings('venue-1', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.any(Object),
          updated_at: expect.any(Date),
        })
      );
    });

    it('should set updated_at timestamp', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: {} });

      await settingsModel.updateVenueSettings('venue-1', {});

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });

    it('should return merged settings', async () => {
      const currentSettings = settingsModel.getDefaultSettings();
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: currentSettings });

      const updates = { ticketing: { allowRefunds: false } };

      const result = await settingsModel.updateVenueSettings('venue-1', updates);

      expect(result.ticketing?.allowRefunds).toBe(false);
      expect(result.general?.timezone).toBe('America/New_York'); // From defaults
    });
  });

  // =============================================================================
  // updateSettingSection() - 3 test cases
  // =============================================================================

  describe('updateSettingSection()', () => {
    it('should update specific settings section', async () => {
      const currentSettings = settingsModel.getDefaultSettings();
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: currentSettings });

      const sectionUpdates = { allowRefunds: false, maxTicketsPerOrder: 5 };

      const result = await settingsModel.updateSettingSection(
        'venue-1',
        'ticketing',
        sectionUpdates
      );

      expect(result.ticketing?.allowRefunds).toBe(false);
      expect(result.ticketing?.maxTicketsPerOrder).toBe(5);
    });

    it('should preserve other sections', async () => {
      const currentSettings = settingsModel.getDefaultSettings();
      mockDb._mockQueryBuilder.first.mockResolvedValue({ settings: currentSettings });

      await settingsModel.updateSettingSection('venue-1', 'ticketing', {
        allowRefunds: false,
      });

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            general: expect.any(Object),
            notifications: expect.any(Object),
          }),
        })
      );
    });

    it('should update database', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        settings: settingsModel.getDefaultSettings(),
      });

      await settingsModel.updateSettingSection('venue-1', 'branding', {
        primaryColor: '#FF0000',
      });

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'venue-1' });
      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getDefaultSettings() - 2 test cases
  // =============================================================================

  describe('getDefaultSettings()', () => {
    it('should return complete default settings', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.general).toBeDefined();
      expect(defaults.ticketing).toBeDefined();
      expect(defaults.notifications).toBeDefined();
      expect(defaults.branding).toBeDefined();
      expect(defaults.payment).toBeDefined();
      expect(defaults.features).toBeDefined();
    });

    it('should have sensible default values', () => {
      const defaults = settingsModel.getDefaultSettings();

      expect(defaults.general?.timezone).toBe('America/New_York');
      expect(defaults.general?.currency).toBe('USD');
      expect(defaults.ticketing?.allowRefunds).toBe(true);
      expect(defaults.features?.nftEnabled).toBe(true);
    });
  });

  // =============================================================================
  // validateSettings() - 5 test cases
  // =============================================================================

  describe('validateSettings()', () => {
    it('should validate valid settings', async () => {
      const settings = settingsModel.getDefaultSettings();

      const result = await settingsModel.validateSettings(settings);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid currency', async () => {
      const settings = {
        general: { currency: 'INVALID' },
      };

      const result = await settingsModel.validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid currency code');
    });

    it('should reject invalid color format', async () => {
      const settings = {
        branding: { primaryColor: 'not-a-color' },
      };

      const result = await settingsModel.validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid primary color format');
    });

    it('should reject invalid webhook URL', async () => {
      const settings = {
        notifications: { webhookUrl: 'not-a-url' },
      };

      const result = await settingsModel.validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid webhook URL');
    });

    it('should accept valid webhook URL', async () => {
      const settings = {
        notifications: { webhookUrl: 'https://example.com/webhook' },
      };

      const result = await settingsModel.validateSettings(settings);

      expect(result.valid).toBe(true);
    });
  });
});
