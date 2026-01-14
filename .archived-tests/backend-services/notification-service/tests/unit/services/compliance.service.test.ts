import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ComplianceService } from '../../../src/services/compliance.service';
import { consentModel } from '../../../src/models/consent.model';
import { suppressionModel } from '../../../src/models/suppression.model';
import { env } from '../../../src/config/env';

// Mock dependencies
jest.mock('../../../src/models/consent.model');
jest.mock('../../../src/models/suppression.model');
jest.mock('../../../src/config/env');

const mockConsentModel = consentModel as any;
const mockSuppressionModel = suppressionModel as any;
const mockEnv = env as any;

describe('ComplianceService', () => {
  let service: ComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ComplianceService();
    
    // Default env settings
    mockEnv.ENABLE_CONSENT_CHECK = true;
    mockEnv.ENABLE_SUPPRESSION_CHECK = true;
    mockEnv.SMS_TIME_RESTRICTION_START = 8;
    mockEnv.SMS_TIME_RESTRICTION_END = 21;
    mockEnv.DEFAULT_TIMEZONE = 'America/New_York';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkCompliance()', () => {
    const mockRequest = {
      venueId: 'venue-123',
      recipientId: 'user-123',
      recipient: {
        id: 'user-123',
        email: 'test@example.com',
        phone: '+1234567890',
        name: 'Test User'
      },
      channel: 'email' as const,
      type: 'marketing' as const,
      template: 'newsletter',
      priority: 'low' as const,
      data: {}
    };

    it('should pass compliance for valid marketing request with consent', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(true);

      const result = await service.checkCompliance(mockRequest);

      expect(result.isCompliant).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(mockSuppressionModel.isSuppressed).toHaveBeenCalledWith('test@example.com', 'email');
      expect(mockConsentModel.hasConsent).toHaveBeenCalledWith('user-123', 'email', 'marketing', 'venue-123');
    });

    it('should block notification if recipient is suppressed', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(true);

      const result = await service.checkCompliance(mockRequest);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toBe('Recipient is on suppression list');
      expect(mockConsentModel.hasConsent).not.toHaveBeenCalled();
    });

    it('should block marketing notification without consent', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(false);

      const result = await service.checkCompliance(mockRequest);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toBe('No consent for marketing communications');
    });

    it('should skip compliance checks when disabled', async () => {
      mockEnv.ENABLE_CONSENT_CHECK = false;
      mockEnv.ENABLE_SUPPRESSION_CHECK = false;

      const result = await service.checkCompliance(mockRequest);

      expect(result.isCompliant).toBe(true);
      expect(mockSuppressionModel.isSuppressed).not.toHaveBeenCalled();
      expect(mockConsentModel.hasConsent).not.toHaveBeenCalled();
    });

    it('should skip consent check for transactional messages', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);

      const transactionalRequest = {
        ...mockRequest,
        type: 'transactional' as const
      };

      const result = await service.checkCompliance(transactionalRequest);

      expect(result.isCompliant).toBe(true);
      expect(mockConsentModel.hasConsent).not.toHaveBeenCalled();
    });

    it('should check SMS time restrictions', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(true);

      const smsRequest = {
        ...mockRequest,
        channel: 'sms' as const,
        recipient: {
          ...mockRequest.recipient,
          timezone: 'America/New_York'
        }
      };

      // Mock current time to be outside SMS window (e.g., 2 AM)
      const mockDate = new Date('2024-01-15T02:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await service.checkCompliance(smsRequest);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toContain('Outside SMS delivery hours');
    });

    it('should allow SMS during valid time window', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(true);

      const smsRequest = {
        ...mockRequest,
        channel: 'sms' as const,
        recipient: {
          ...mockRequest.recipient,
          timezone: 'America/New_York'
        }
      };

      // Mock current time to be inside SMS window (e.g., 2 PM)
      const mockDate = new Date('2024-01-15T14:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await service.checkCompliance(smsRequest);

      expect(result.isCompliant).toBe(true);
    });

    it('should handle compliance check errors gracefully', async () => {
      mockSuppressionModel.isSuppressed.mockRejectedValue(new Error('Database error'));

      const result = await service.checkCompliance(mockRequest);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toBe('Compliance check failed');
    });

    it('should check suppression for phone numbers with SMS', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(true);

      const smsRequest = {
        ...mockRequest,
        channel: 'sms' as const
      };

      await service.checkCompliance(smsRequest);

      expect(mockSuppressionModel.isSuppressed).toHaveBeenCalledWith('+1234567890', 'sms');
    });
  });

  describe('recordConsent()', () => {
    it('should record consent with all parameters', async () => {
      mockConsentModel.create.mockResolvedValue(undefined);

      await service.recordConsent(
        'user-123',
        'email',
        'marketing',
        'web_form',
        'venue-123',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockConsentModel.create).toHaveBeenCalledWith({
        customerId: 'user-123',
        venueId: 'venue-123',
        channel: 'email',
        type: 'marketing',
        status: 'granted',
        grantedAt: expect.any(Date),
        source: 'web_form',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });
    });

    it('should record consent without optional parameters', async () => {
      mockConsentModel.create.mockResolvedValue(undefined);

      await service.recordConsent(
        'user-123',
        'sms',
        'marketing',
        'api'
      );

      expect(mockConsentModel.create).toHaveBeenCalledWith({
        customerId: 'user-123',
        venueId: undefined,
        channel: 'sms',
        type: 'marketing',
        status: 'granted',
        grantedAt: expect.any(Date),
        source: 'api',
        ipAddress: undefined,
        userAgent: undefined
      });
    });
  });

  describe('revokeConsent()', () => {
    it('should revoke consent for specific type', async () => {
      mockConsentModel.revoke.mockResolvedValue(undefined);

      await service.revokeConsent('user-123', 'email', 'marketing', 'venue-123');

      expect(mockConsentModel.revoke).toHaveBeenCalledWith('user-123', 'email', 'marketing', 'venue-123');
    });

    it('should revoke consent for all types', async () => {
      mockConsentModel.revoke.mockResolvedValue(undefined);

      await service.revokeConsent('user-123', 'email');

      expect(mockConsentModel.revoke).toHaveBeenCalledWith('user-123', 'email', undefined, undefined);
    });
  });

  describe('addToSuppressionList()', () => {
    it('should add email to suppression list', async () => {
      mockSuppressionModel.add.mockResolvedValue(undefined);

      await service.addToSuppressionList(
        'test@example.com',
        'email',
        'User unsubscribed',
        'admin-user'
      );

      expect(mockSuppressionModel.add).toHaveBeenCalledWith({
        identifier: 'test@example.com',
        channel: 'email',
        reason: 'User unsubscribed',
        suppressedAt: expect.any(Date),
        suppressedBy: 'admin-user'
      });
    });

    it('should add phone to suppression list', async () => {
      mockSuppressionModel.add.mockResolvedValue(undefined);

      await service.addToSuppressionList(
        '+1234567890',
        'sms',
        'Invalid number'
      );

      expect(mockSuppressionModel.add).toHaveBeenCalledWith({
        identifier: '+1234567890',
        channel: 'sms',
        reason: 'Invalid number',
        suppressedAt: expect.any(Date),
        suppressedBy: undefined
      });
    });
  });

  describe('removeFromSuppressionList()', () => {
    it('should remove from suppression list for specific channel', async () => {
      mockSuppressionModel.remove.mockResolvedValue(undefined);

      await service.removeFromSuppressionList('test@example.com', 'email');

      expect(mockSuppressionModel.remove).toHaveBeenCalledWith('test@example.com', 'email');
    });

    it('should remove from suppression list for all channels', async () => {
      mockSuppressionModel.remove.mockResolvedValue(undefined);

      await service.removeFromSuppressionList('test@example.com');

      expect(mockSuppressionModel.remove).toHaveBeenCalledWith('test@example.com', undefined);
    });
  });

  describe('SMS Time Window Edge Cases', () => {
    it('should respect timezone for SMS time restrictions', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(true);

      const smsRequest = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          email: 'test@example.com',
          phone: '+1234567890',
          name: 'Test User',
          timezone: 'America/Los_Angeles'
        },
        channel: 'sms' as const,
        type: 'marketing' as const,
        template: 'newsletter',
        priority: 'low' as const,
        data: {}
      };

      // Test with Pacific timezone (3 hours behind Eastern)
      const mockDate = new Date('2024-01-15T11:00:00Z'); // 6 AM EST, 3 AM PST
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await service.checkCompliance(smsRequest);

      // Should be blocked in PST (3 AM)
      expect(result.isCompliant).toBe(false);
    });

    it('should use default timezone when not provided', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent.mockResolvedValue(true);

      const smsRequest = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          phone: '+1234567890',
          name: 'Test'
        },
        channel: 'sms' as const,
        type: 'marketing' as const,
        template: 'newsletter',
        priority: 'low' as const,
        data: {}
      };

      const mockDate = new Date('2024-01-15T02:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await service.checkCompliance(smsRequest);

      expect(result.isCompliant).toBe(false);
    });
  });

  describe('Multi-channel Consent', () => {
    it('should check consent separately for each channel', async () => {
      mockSuppressionModel.isSuppressed.mockResolvedValue(false);
      mockConsentModel.hasConsent
        .mockResolvedValueOnce(true)  // Email consent
        .mockResolvedValueOnce(false); // SMS consent

      const emailRequest = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          email: 'test@example.com',
          phone: '+1234567890',
          name: 'Test User'
        },
        channel: 'email' as const,
        type: 'marketing' as const,
        template: 'newsletter',
        priority: 'low' as const,
        data: {}
      };

      const smsRequest = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          email: 'test@example.com',
          phone: '+1234567890',
          name: 'Test User'
        },
        channel: 'sms' as const,
        type: 'marketing' as const,
        template: 'newsletter',
        priority: 'low' as const,
        data: {}
      };

      const emailResult = await service.checkCompliance(emailRequest);
      const smsResult = await service.checkCompliance(smsRequest);

      expect(emailResult.isCompliant).toBe(true);
      expect(smsResult.isCompliant).toBe(false);
    });
  });
});
