import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

interface CustomerPreferences {
  customerId: string;
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  timezone: string;
  language: string;
  quietHours: {
    enabled: boolean;
    start: number;
    end: number;
  };
}

export class PreferenceService {
  async getPreferences(customerId: string): Promise<CustomerPreferences> {
    const prefs = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (!prefs) {
      // Return defaults
      return this.getDefaultPreferences(customerId);
    }

    return {
      customerId: prefs.customer_id,
      email: JSON.parse(prefs.email_preferences),
      sms: JSON.parse(prefs.sms_preferences),
      timezone: prefs.timezone,
      language: prefs.language,
      quietHours: JSON.parse(prefs.quiet_hours),
    };
  }

  async updatePreferences(
    customerId: string,
    updates: Partial<CustomerPreferences>
  ): Promise<void> {
    const existing = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (existing) {
      await db('customer_preferences')
        .where('customer_id', customerId)
        .update({
          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
          timezone: updates.timezone || existing.timezone,
          language: updates.language || existing.language,
          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
          updated_at: new Date(),
        });
    } else {
      const defaults = this.getDefaultPreferences(customerId);
      const merged = { ...defaults, ...updates };

      await db('customer_preferences').insert({
        id: uuidv4(),
        customer_id: customerId,
        email_preferences: JSON.stringify(merged.email),
        sms_preferences: JSON.stringify(merged.sms),
        timezone: merged.timezone,
        language: merged.language,
        quiet_hours: JSON.stringify(merged.quietHours),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    logger.info('Customer preferences updated', { customerId });
  }

  async getUnsubscribeToken(customerId: string): Promise<string> {
    const token = Buffer.from(
      JSON.stringify({
        customerId,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      })
    ).toString('base64url');

    return token;
  }

  async processUnsubscribe(token: string, channel?: 'email' | 'sms'): Promise<void> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      
      if (decoded.expires < Date.now()) {
        throw new Error('Unsubscribe link expired');
      }

      const preferences = await this.getPreferences(decoded.customerId);
      
      if (channel) {
        preferences[channel].enabled = false;
      } else {
        // Unsubscribe from all
        preferences.email.enabled = false;
        preferences.sms.enabled = false;
      }

      await this.updatePreferences(decoded.customerId, preferences);

      // Add to suppression list
      await db('suppression_list').insert({
        id: uuidv4(),
        identifier: decoded.customerId,
        identifier_hash: decoded.customerId, // Should be hashed in production
        channel: channel || 'all',
        reason: 'customer_unsubscribe',
        suppressed_at: new Date(),
        created_at: new Date(),
      });

      logger.info('Customer unsubscribed', { 
        customerId: decoded.customerId, 
        channel 
      });
    } catch (error) {
      logger.error('Failed to process unsubscribe', { token, error });
      throw error;
    }
  }

  private getDefaultPreferences(customerId: string): CustomerPreferences {
    return {
      customerId,
      email: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional', 'marketing'],
      },
      sms: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional'],
      },
      timezone: 'America/Chicago',
      language: 'en',
      quietHours: {
        enabled: false,
        start: 22,
        end: 8,
      },
    };
  }

  async exportCustomerData(customerId: string): Promise<any> {
    // GDPR compliance - export all customer notification data
    const [
      preferences,
      consents,
      notifications,
      engagements,
    ] = await Promise.all([
      this.getPreferences(customerId),
      db('consent_records').where('customer_id', customerId),
      db('notification_tracking').where('recipient_id', customerId).limit(100),
      db('engagement_events')
        .join('notification_tracking', 'engagement_events.notification_id', 'notification_tracking.id')
        .where('notification_tracking.recipient_id', customerId)
        .select('engagement_events.*'),
    ]);

    return {
      exportDate: new Date(),
      customerId,
      preferences,
      consents,
      notificationHistory: notifications,
      engagementHistory: engagements,
    };
  }
}

export const preferenceService = new PreferenceService();
