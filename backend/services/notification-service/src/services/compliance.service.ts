import { consentModel } from '../models/consent.model';
import { suppressionModel } from '../models/suppression.model';
import { NotificationChannel, NotificationType, NotificationRequest } from '../types/notification.types';
import { logger } from '../config/logger';
import { env } from '../config/env';

export class ComplianceService {
  async checkCompliance(request: NotificationRequest): Promise<{
    isCompliant: boolean;
    reason?: string;
  }> {
    try {
      // Skip compliance checks if disabled (NOT recommended for production)
      if (!env.ENABLE_CONSENT_CHECK && !env.ENABLE_SUPPRESSION_CHECK) {
        return { isCompliant: true };
      }

      // Check suppression list first (highest priority)
      if (env.ENABLE_SUPPRESSION_CHECK) {
        const identifier = request.channel === 'email' 
          ? request.recipient.email 
          : request.recipient.phone;

        if (identifier && await suppressionModel.isSuppressed(identifier, request.channel)) {
          logger.warn('Notification blocked: recipient is suppressed', {
            channel: request.channel,
            venueId: request.venueId,
          });
          return { 
            isCompliant: false, 
            reason: 'Recipient is on suppression list' 
          };
        }
      }

      // Check consent for marketing messages
      if (env.ENABLE_CONSENT_CHECK && request.type === 'marketing') {
        const hasConsent = await consentModel.hasConsent(
          request.recipientId,
          request.channel,
          request.type,
          request.venueId
        );

        if (!hasConsent) {
          logger.warn('Notification blocked: no consent', {
            recipientId: request.recipientId,
            channel: request.channel,
            type: request.type,
            venueId: request.venueId,
          });
          return { 
            isCompliant: false, 
            reason: 'No consent for marketing communications' 
          };
        }
      }

      // Check SMS time restrictions
      if (request.channel === 'sms' && !this.isWithinSmsTimeWindow(request.recipient.timezone)) {
        return { 
          isCompliant: false, 
          reason: 'Outside SMS delivery hours (8am-9pm recipient time)' 
        };
      }

      return { isCompliant: true };
    } catch (error) {
      logger.error('Compliance check failed', error);
      // Fail closed - if we can't verify compliance, don't send
      return { 
        isCompliant: false, 
        reason: 'Compliance check failed' 
      };
    }
  }

  private isWithinSmsTimeWindow(timezone?: string): boolean {
    const tz = timezone || env.DEFAULT_TIMEZONE;
    const now = new Date();
    
    // Convert to recipient's timezone
    const recipientTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = recipientTime.getHours();

    return hour >= env.SMS_TIME_RESTRICTION_START && hour < env.SMS_TIME_RESTRICTION_END;
  }

  async recordConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    source: string,
    venueId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await consentModel.create({
      customerId,
      venueId,
      channel,
      type,
      status: 'granted',
      grantedAt: new Date(),
      source,
      ipAddress,
      userAgent,
    });
  }

  async revokeConsent(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    await consentModel.revoke(customerId, channel, type, venueId);
  }

  async addToSuppressionList(
    identifier: string,
    channel: NotificationChannel,
    reason: string,
    suppressedBy?: string
  ): Promise<void> {
    await suppressionModel.add({
      identifier,
      channel,
      reason,
      suppressedAt: new Date(),
      suppressedBy,
    });
  }

  async removeFromSuppressionList(
    identifier: string,
    channel?: NotificationChannel
  ): Promise<void> {
    await suppressionModel.remove(identifier, channel);
  }
}

export const complianceService = new ComplianceService();
