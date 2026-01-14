/**
 * Preference Service for Notification Service
 * 
 * AUDIT FIX MT-2: All queries now require tenant_id filter
 */

import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentTenantId } from '../middleware/tenant-context';

interface CustomerPreferences {
  customerId: string;
  tenantId: string;
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
  /**
   * AUDIT FIX MT-2: Get tenant ID from context or parameter
   */
  private getTenantId(tenantId?: string): string {
    const tid = tenantId || getCurrentTenantId();
    if (!tid) {
      throw new Error('Tenant ID is required for preference operations');
    }
    return tid;
  }

  /**
   * AUDIT FIX MT-2: Added tenant_id filter to query
   */
  async getPreferences(customerId: string, tenantId?: string): Promise<CustomerPreferences> {
    const tid = this.getTenantId(tenantId);
    
    // AUDIT FIX MT-2: Include tenant_id in WHERE clause
    const prefs = await db('customer_preferences')
      .where('customer_id', customerId)
      .where('tenant_id', tid)  // AUDIT FIX MT-2
      .first();

    if (!prefs) {
      // Return defaults
      return this.getDefaultPreferences(customerId, tid);
    }

    return {
      customerId: prefs.customer_id,
      tenantId: prefs.tenant_id,
      email: JSON.parse(prefs.email_preferences),
      sms: JSON.parse(prefs.sms_preferences),
      timezone: prefs.timezone,
      language: prefs.language,
      quietHours: JSON.parse(prefs.quiet_hours),
    };
  }

  /**
   * AUDIT FIX MT-2: Added tenant_id filter to update/insert
   */
  async updatePreferences(
    customerId: string,
    updates: Partial<CustomerPreferences>,
    tenantId?: string
  ): Promise<void> {
    const tid = this.getTenantId(tenantId);
    
    // AUDIT FIX MT-2: Include tenant_id in WHERE clause
    const existing = await db('customer_preferences')
      .where('customer_id', customerId)
      .where('tenant_id', tid)  // AUDIT FIX MT-2
      .first();

    if (existing) {
      // AUDIT FIX MT-2: Include tenant_id in WHERE clause
      await db('customer_preferences')
        .where('customer_id', customerId)
        .where('tenant_id', tid)  // AUDIT FIX MT-2
        .update({
          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
          timezone: updates.timezone || existing.timezone,
          language: updates.language || existing.language,
          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
          updated_at: new Date(),
        });
    } else {
      const defaults = this.getDefaultPreferences(customerId, tid);
      const merged = { ...defaults, ...updates };

      // AUDIT FIX MT-2: Include tenant_id in insert
      await db('customer_preferences').insert({
        id: uuidv4(),
        tenant_id: tid,  // AUDIT FIX MT-2
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

    logger.info('Customer preferences updated', { customerId, tenantId: tid });
  }

  async getUnsubscribeToken(customerId: string, tenantId?: string): Promise<string> {
    const tid = this.getTenantId(tenantId);
    
    const token = Buffer.from(
      JSON.stringify({
        customerId,
        tenantId: tid,  // AUDIT FIX MT-2: Include tenant in token
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

      // AUDIT FIX MT-2: Use tenant from token
      const tenantId = decoded.tenantId;
      if (!tenantId) {
        throw new Error('Invalid unsubscribe token: missing tenant');
      }

      const preferences = await this.getPreferences(decoded.customerId, tenantId);
      
      if (channel) {
        preferences[channel].enabled = false;
      } else {
        // Unsubscribe from all
        preferences.email.enabled = false;
        preferences.sms.enabled = false;
      }

      await this.updatePreferences(decoded.customerId, preferences, tenantId);

      // AUDIT FIX MT-2: Include tenant_id in suppression list
      await db('suppression_list').insert({
        id: uuidv4(),
        tenant_id: tenantId,  // AUDIT FIX MT-2
        identifier: decoded.customerId,
        identifier_hash: decoded.customerId, // Should be hashed in production
        channel: channel || 'all',
        reason: 'customer_unsubscribe',
        suppressed_at: new Date(),
        created_at: new Date(),
      });

      logger.info('Customer unsubscribed', { 
        customerId: decoded.customerId, 
        tenantId,
        channel 
      });
    } catch (error) {
      logger.error('Failed to process unsubscribe', { token, error });
      throw error;
    }
  }

  private getDefaultPreferences(customerId: string, tenantId: string): CustomerPreferences {
    return {
      customerId,
      tenantId,
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

  /**
   * AUDIT FIX MT-2: Added tenant_id filter to all queries
   */
  async exportCustomerData(customerId: string, tenantId?: string): Promise<any> {
    const tid = this.getTenantId(tenantId);
    
    // GDPR compliance - export all customer notification data
    // AUDIT FIX MT-2: All queries include tenant_id
    const [
      preferences,
      consents,
      notifications,
      engagements,
    ] = await Promise.all([
      this.getPreferences(customerId, tid),
      db('consent_records')
        .where('customer_id', customerId)
        .where('tenant_id', tid),  // AUDIT FIX MT-2
      db('notification_tracking')
        .where('recipient_id', customerId)
        .where('tenant_id', tid)  // AUDIT FIX MT-2
        .limit(100),
      db('engagement_events')
        .join('notification_tracking', 'engagement_events.notification_id', 'notification_tracking.id')
        .where('notification_tracking.recipient_id', customerId)
        .where('notification_tracking.tenant_id', tid)  // AUDIT FIX MT-2
        .select('engagement_events.*'),
    ]);

    return {
      exportDate: new Date(),
      customerId,
      tenantId: tid,
      preferences,
      consents,
      notificationHistory: notifications,
      engagementHistory: engagements,
    };
  }

  /**
   * AUDIT FIX MT-2: Check if customer is suppressed for a channel
   */
  async isCustomerSuppressed(
    customerId: string, 
    channel: 'email' | 'sms' | 'all',
    tenantId?: string
  ): Promise<boolean> {
    const tid = this.getTenantId(tenantId);
    
    // AUDIT FIX MT-2: Include tenant_id in query
    const suppression = await db('suppression_list')
      .where('identifier', customerId)
      .where('tenant_id', tid)  // AUDIT FIX MT-2
      .where(function() {
        this.where('channel', channel).orWhere('channel', 'all');
      })
      .first();
    
    return !!suppression;
  }
}

export const preferenceService = new PreferenceService();
