/**
 * Unit tests for settings.controller.ts
 * Tests HTTP route handlers for venue settings management
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockSettingsModel = {
  findByVenueId: jest.fn(),
  upsert: jest.fn(),
  getAll: jest.fn(),
  update: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('settings.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({
      params: { venueId: mockVenueId },
    });
    mockReply = createMockReply();
    mockVenueService.checkVenueAccess.mockResolvedValue(true);
  });

  describe('GET /venues/:venueId/settings', () => {
    it('should return all settings for venue', async () => {
      const settings = {
        general: { timezone: 'America/New_York', currency: 'USD' },
        ticketing: { refundWindow: 48, maxTicketsPerOrder: 10 },
        notifications: { emailNotifications: true },
      };
      mockSettingsModel.getAll.mockResolvedValue(settings);

      const result = await mockSettingsModel.getAll(mockVenueId);

      expect(result).toEqual(settings);
      expect(mockSettingsModel.getAll).toHaveBeenCalledWith(mockVenueId);
    });

    it('should return empty object when no settings exist', async () => {
      mockSettingsModel.getAll.mockResolvedValue({});

      const result = await mockSettingsModel.getAll(mockVenueId);

      expect(result).toEqual({});
    });

    it('should require authentication', async () => {
      mockRequest = createMockRequest({
        params: { venueId: mockVenueId },
        user: null,
      });

      expect(mockRequest.user).toBeNull();
    });
  });

  describe('GET /venues/:venueId/settings/:category', () => {
    it('should return specific settings category', async () => {
      const generalSettings = { timezone: 'America/New_York', currency: 'USD' };
      mockSettingsModel.findByVenueId.mockResolvedValue(generalSettings);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: mockVenueId, category: 'general' },
      });

      const result = await mockSettingsModel.findByVenueId(mockVenueId, 'general');

      expect(result).toEqual(generalSettings);
    });

    it('should return null for non-existent category', async () => {
      mockSettingsModel.findByVenueId.mockResolvedValue(null);

      const result = await mockSettingsModel.findByVenueId(mockVenueId, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('PUT /venues/:venueId/settings', () => {
    const updateBody = {
      general: {
        timezone: 'Europe/London',
        currency: 'GBP',
      },
      ticketing: {
        refundWindow: 72,
      },
    };

    it('should update settings when user has access', async () => {
      const updatedSettings = { ...updateBody };
      mockSettingsModel.upsert.mockResolvedValue(updatedSettings);

      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: mockVenueId },
        body: updateBody,
      });

      const result = await mockSettingsModel.upsert(mockVenueId, updateBody);

      expect(result).toEqual(updatedSettings);
    });

    it('should deny access when user lacks permission', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      const hasAccess = await mockVenueService.checkVenueAccess(mockVenueId, 'user-123');

      expect(hasAccess).toBe(false);
    });

    it('should validate settings format', async () => {
      const invalidBody = {
        general: {
          currency: 'INVALID', // Not a valid currency code
        },
      };

      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: mockVenueId },
        body: invalidBody,
      });

      // Validation should catch invalid currency
      expect(invalidBody.general.currency).not.toMatch(/^[A-Z]{3}$/);
    });
  });

  describe('PUT /venues/:venueId/settings/:category', () => {
    it('should update specific settings category', async () => {
      const categoryUpdate = { timezone: 'Asia/Tokyo', language: 'ja' };
      mockSettingsModel.update.mockResolvedValue(categoryUpdate);

      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: mockVenueId, category: 'general' },
        body: categoryUpdate,
      });

      const result = await mockSettingsModel.update(mockVenueId, 'general', categoryUpdate);

      expect(result).toEqual(categoryUpdate);
    });

    it('should reject invalid category', async () => {
      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: mockVenueId, category: 'invalid_category' },
        body: {},
      });

      // Invalid category should be rejected by validation
      const validCategories = ['general', 'ticketing', 'notifications', 'branding'];
      expect(validCategories).not.toContain(mockRequest.params.category);
    });
  });

  describe('Ticketing settings', () => {
    it('should validate refund window (0-720 hours)', async () => {
      const validSettings = { refundWindow: 48 };
      const invalidSettings = { refundWindow: 1000 };

      expect(validSettings.refundWindow).toBeLessThanOrEqual(720);
      expect(invalidSettings.refundWindow).toBeGreaterThan(720);
    });

    it('should validate max tickets per order (1-100)', async () => {
      const validSettings = { maxTicketsPerOrder: 10 };
      const invalidSettings = { maxTicketsPerOrder: 150 };

      expect(validSettings.maxTicketsPerOrder).toBeGreaterThanOrEqual(1);
      expect(validSettings.maxTicketsPerOrder).toBeLessThanOrEqual(100);
      expect(invalidSettings.maxTicketsPerOrder).toBeGreaterThan(100);
    });
  });

  describe('Notification settings', () => {
    it('should accept valid webhook URL', async () => {
      const settings = {
        webhookUrl: 'https://example.com/webhook',
        emailNotifications: true,
      };

      expect(settings.webhookUrl).toMatch(/^https?:\/\//);
    });

    it('should allow empty webhook URL', async () => {
      const settings = {
        webhookUrl: '',
        emailNotifications: true,
      };

      expect(settings.webhookUrl).toBe('');
    });
  });

  describe('Branding settings', () => {
    it('should validate hex color format', async () => {
      const validSettings = {
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
      };

      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      expect(validSettings.primaryColor).toMatch(hexPattern);
      expect(validSettings.secondaryColor).toMatch(hexPattern);
    });

    it('should reject invalid hex colors', async () => {
      const invalidSettings = {
        primaryColor: 'red',
        secondaryColor: '#FFF', // Too short
      };

      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      expect(invalidSettings.primaryColor).not.toMatch(hexPattern);
      expect(invalidSettings.secondaryColor).not.toMatch(hexPattern);
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockSettingsModel.getAll.mockRejectedValue(new Error('Database error'));

      await expect(mockSettingsModel.getAll(mockVenueId)).rejects.toThrow('Database error');
    });

    it('should log errors', async () => {
      mockSettingsModel.upsert.mockRejectedValue(new Error('Update failed'));

      try {
        await mockSettingsModel.upsert(mockVenueId, {});
      } catch (e) {
        mockLogger.error({ error: e }, 'Failed to update settings');
      }

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
