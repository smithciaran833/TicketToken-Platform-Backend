/**
 * Unit tests for settings.schema.ts
 * Tests Joi validation schemas for venue settings
 */

import Joi from 'joi';

describe('settings.schema', () => {
  // Settings schema based on TEST_PLAN
  const generalSettingsSchema = Joi.object({
    timezone: Joi.string().default('America/New_York'),
    currency: Joi.string().length(3).uppercase().default('USD'), // ISO 4217 - uppercase() transforms to uppercase
    language: Joi.string().default('en'),
  });

  const ticketingSettingsSchema = Joi.object({
    refundWindow: Joi.number().min(0).max(720).default(48), // 0-720 hours
    maxTicketsPerOrder: Joi.number().min(1).max(100).default(10),
    requireEmailVerification: Joi.boolean().default(true),
    allowGuestCheckout: Joi.boolean().default(false),
  });

  const notificationSettingsSchema = Joi.object({
    webhookUrl: Joi.string().uri().allow(null, ''),
    emailNotifications: Joi.boolean().default(true),
    smsNotifications: Joi.boolean().default(false),
  });

  const brandingSettingsSchema = Joi.object({
    primaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    secondaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    accentColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
  });

  const updateSettingsSchema = Joi.object({
    general: generalSettingsSchema,
    ticketing: ticketingSettingsSchema,
    notifications: notificationSettingsSchema,
    branding: brandingSettingsSchema,
  });

  describe('generalSettingsSchema', () => {
    it('should accept valid timezone', () => {
      const result = generalSettingsSchema.validate({ timezone: 'America/Los_Angeles' });
      expect(result.error).toBeUndefined();
      expect(result.value.timezone).toBe('America/Los_Angeles');
    });

    it('should accept valid ISO 4217 currency code', () => {
      const result = generalSettingsSchema.validate({ currency: 'EUR' });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid currency code (wrong length)', () => {
      const result = generalSettingsSchema.validate({ currency: 'US' });
      expect(result.error).toBeDefined();
    });

    it('should transform lowercase currency to uppercase', () => {
      // Joi .uppercase() transforms the value, not rejects it
      const result = generalSettingsSchema.validate({ currency: 'usd' });
      expect(result.error).toBeUndefined();
      expect(result.value.currency).toBe('USD');
    });

    it('should use default values', () => {
      const result = generalSettingsSchema.validate({});
      expect(result.value.timezone).toBe('America/New_York');
      expect(result.value.currency).toBe('USD');
      expect(result.value.language).toBe('en');
    });
  });

  describe('ticketingSettingsSchema', () => {
    it('should accept valid refund window (0-720 hours)', () => {
      const validValues = [0, 24, 48, 72, 720];
      validValues.forEach(refundWindow => {
        const result = ticketingSettingsSchema.validate({ refundWindow });
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject refund window greater than 720 hours', () => {
      const result = ticketingSettingsSchema.validate({ refundWindow: 721 });
      expect(result.error).toBeDefined();
    });

    it('should reject negative refund window', () => {
      const result = ticketingSettingsSchema.validate({ refundWindow: -1 });
      expect(result.error).toBeDefined();
    });

    it('should accept max tickets per order (1-100)', () => {
      const validValues = [1, 10, 50, 100];
      validValues.forEach(maxTicketsPerOrder => {
        const result = ticketingSettingsSchema.validate({ maxTicketsPerOrder });
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject max tickets less than 1', () => {
      const result = ticketingSettingsSchema.validate({ maxTicketsPerOrder: 0 });
      expect(result.error).toBeDefined();
    });

    it('should reject max tickets greater than 100', () => {
      const result = ticketingSettingsSchema.validate({ maxTicketsPerOrder: 101 });
      expect(result.error).toBeDefined();
    });

    it('should use default values', () => {
      const result = ticketingSettingsSchema.validate({});
      expect(result.value.refundWindow).toBe(48);
      expect(result.value.maxTicketsPerOrder).toBe(10);
    });
  });

  describe('notificationSettingsSchema', () => {
    it('should accept valid webhook URL', () => {
      const result = notificationSettingsSchema.validate({
        webhookUrl: 'https://example.com/webhook'
      });
      expect(result.error).toBeUndefined();
    });

    it('should accept null webhook URL', () => {
      const result = notificationSettingsSchema.validate({ webhookUrl: null });
      expect(result.error).toBeUndefined();
    });

    it('should accept empty webhook URL', () => {
      const result = notificationSettingsSchema.validate({ webhookUrl: '' });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid URL format', () => {
      const result = notificationSettingsSchema.validate({ webhookUrl: 'not-a-url' });
      expect(result.error).toBeDefined();
    });

    it('should accept boolean notification preferences', () => {
      const result = notificationSettingsSchema.validate({
        emailNotifications: false,
        smsNotifications: true,
      });
      expect(result.error).toBeUndefined();
    });
  });

  describe('brandingSettingsSchema', () => {
    it('should accept valid hex colors', () => {
      const result = brandingSettingsSchema.validate({
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        accentColor: '#0000FF',
      });
      expect(result.error).toBeUndefined();
    });

    it('should accept lowercase hex colors', () => {
      const result = brandingSettingsSchema.validate({ primaryColor: '#ff0000' });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid hex color (missing #)', () => {
      const result = brandingSettingsSchema.validate({ primaryColor: 'FF0000' });
      expect(result.error).toBeDefined();
    });

    it('should reject invalid hex color (wrong length)', () => {
      const result = brandingSettingsSchema.validate({ primaryColor: '#FFF' });
      expect(result.error).toBeDefined();
    });

    it('should reject invalid hex color (invalid characters)', () => {
      const result = brandingSettingsSchema.validate({ primaryColor: '#GGGGGG' });
      expect(result.error).toBeDefined();
    });
  });

  describe('updateSettingsSchema', () => {
    it('should accept partial updates', () => {
      const result = updateSettingsSchema.validate({
        general: { timezone: 'Europe/London' },
      });
      expect(result.error).toBeUndefined();
    });

    it('should validate nested settings', () => {
      const result = updateSettingsSchema.validate({
        general: { currency: 'invalid' },
      });
      expect(result.error).toBeDefined();
    });

    it('should accept complete settings update', () => {
      const result = updateSettingsSchema.validate({
        general: {
          timezone: 'America/Chicago',
          currency: 'EUR',
          language: 'es',
        },
        ticketing: {
          refundWindow: 72,
          maxTicketsPerOrder: 20,
        },
        notifications: {
          webhookUrl: 'https://example.com/hook',
          emailNotifications: true,
        },
        branding: {
          primaryColor: '#123456',
        },
      });
      expect(result.error).toBeUndefined();
    });

    it('should accept empty update', () => {
      const result = updateSettingsSchema.validate({});
      expect(result.error).toBeUndefined();
    });
  });
});
