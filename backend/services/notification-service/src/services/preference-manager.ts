import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

export interface UserPreferences {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  
  // Category preferences
  emailPayment: boolean;
  emailMarketing: boolean;
  emailEventUpdates: boolean;
  emailAccount: boolean;
  
  smsCriticalOnly: boolean;
  smsPayment: boolean;
  smsEventReminders: boolean;
  
  pushPayment: boolean;
  pushEventUpdates: boolean;
  pushMarketing: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  
  // Limits
  maxEmailsPerDay: number;
  maxSmsPerDay: number;
  
  unsubscribeToken?: string;
  unsubscribedAt?: Date;
}

export class PreferenceManager {
  private cache: Map<string, UserPreferences> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  async getPreferences(userId: string): Promise<UserPreferences> {
    // Check cache first
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId)!;
      return cached;
    }
    
    // Get from database
    let prefs = await db('notification_preferences')
      .where('user_id', userId)
      .first();
    
    // Create default preferences if not exists
    if (!prefs) {
      prefs = await this.createDefaultPreferences(userId);
    }
    
    const preferences = this.mapToPreferences(prefs);
    
    // Cache it
    this.cache.set(userId, preferences);
    setTimeout(() => this.cache.delete(userId), this.CACHE_TTL);
    
    return preferences;
  }
  
  async updatePreferences(
    userId: string, 
    updates: Partial<UserPreferences>,
    changedBy?: string,
    reason?: string
  ): Promise<UserPreferences> {
    // Record current state for history
    const current = await this.getPreferences(userId);
    
    // Map updates to database columns
    const dbUpdates = this.mapToDatabase(updates);
    
    // Update database
    const [updated] = await db('notification_preferences')
      .where('user_id', userId)
      .update({
        ...dbUpdates,
        updated_at: new Date()
      })
      .returning('*');
    
    // Record history
    await this.recordHistory(userId, current, updates, changedBy, reason);
    
    // Clear cache
    this.cache.delete(userId);
    
    const newPrefs = this.mapToPreferences(updated);
    
    logger.info('Preferences updated', {
      userId,
      changes: Object.keys(updates)
    });
    
    return newPrefs;
  }
  
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push',
    type: string
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    
    // Check if completely unsubscribed
    if (prefs.unsubscribedAt) {
      return false;
    }
    
    // Check channel enabled
    if (channel === 'email' && !prefs.emailEnabled) return false;
    if (channel === 'sms' && !prefs.smsEnabled) return false;
    if (channel === 'push' && !prefs.pushEnabled) return false;
    
    // Check category preferences
    if (channel === 'email') {
      if (type === 'payment' && !prefs.emailPayment) return false;
      if (type === 'marketing' && !prefs.emailMarketing) return false;
      if (type === 'event_update' && !prefs.emailEventUpdates) return false;
      if (type === 'account' && !prefs.emailAccount) return false;
    }
    
    if (channel === 'sms') {
      if (prefs.smsCriticalOnly && !this.isCritical(type)) return false;
      if (type === 'payment' && !prefs.smsPayment) return false;
      if (type === 'event_reminder' && !prefs.smsEventReminders) return false;
    }
    
    if (channel === 'push') {
      if (type === 'payment' && !prefs.pushPayment) return false;
      if (type === 'event_update' && !prefs.pushEventUpdates) return false;
      if (type === 'marketing' && !prefs.pushMarketing) return false;
    }
    
    // Check quiet hours
    if (prefs.quietHoursEnabled && this.isQuietHours(prefs)) {
      if (!this.isCritical(type)) {
        return false;
      }
    }
    
    // Check daily limits
    const todayCount = await this.getTodayCount(userId, channel);
    if (channel === 'email' && todayCount >= prefs.maxEmailsPerDay) return false;
    if (channel === 'sms' && todayCount >= prefs.maxSmsPerDay) return false;
    
    return true;
  }
  
  async unsubscribe(token: string): Promise<boolean> {
    const [updated] = await db('notification_preferences')
      .where('unsubscribe_token', token)
      .update({
        email_enabled: false,
        sms_enabled: false,
        push_enabled: false,
        unsubscribed_at: new Date(),
        updated_at: new Date()
      })
      .returning('user_id');
    
    if (updated) {
      this.cache.delete(updated.user_id);
      logger.info('User unsubscribed', { userId: updated.user_id });
      return true;
    }
    
    return false;
  }
  
  async generateUnsubscribeLink(userId: string): Promise<string> {
    const prefs = await this.getPreferences(userId);
    const baseUrl = process.env.FRONTEND_URL || 'https://app.tickettoken.com';
    return `${baseUrl}/unsubscribe/${prefs.unsubscribeToken}`;
  }
  
  private async createDefaultPreferences(userId: string): Promise<any> {
    const [created] = await db('notification_preferences')
      .insert({
        user_id: userId,
        unsubscribe_token: crypto.randomBytes(32).toString('hex'),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return created;
  }
  
  private mapToPreferences(row: any): UserPreferences {
    return {
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      
      emailPayment: row.email_payment,
      emailMarketing: row.email_marketing,
      emailEventUpdates: row.email_event_updates,
      emailAccount: row.email_account,
      
      smsCriticalOnly: row.sms_critical_only,
      smsPayment: row.sms_payment,
      smsEventReminders: row.sms_event_reminders,
      
      pushPayment: row.push_payment,
      pushEventUpdates: row.push_event_updates,
      pushMarketing: row.push_marketing,
      
      quietHoursEnabled: row.quiet_hours_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      timezone: row.timezone,
      
      maxEmailsPerDay: row.max_emails_per_day,
      maxSmsPerDay: row.max_sms_per_day,
      
      unsubscribeToken: row.unsubscribe_token,
      unsubscribedAt: row.unsubscribed_at
    };
  }
  
  private mapToDatabase(prefs: Partial<UserPreferences>): any {
    const mapped: any = {};
    
    if (prefs.emailEnabled !== undefined) mapped.email_enabled = prefs.emailEnabled;
    if (prefs.smsEnabled !== undefined) mapped.sms_enabled = prefs.smsEnabled;
    if (prefs.pushEnabled !== undefined) mapped.push_enabled = prefs.pushEnabled;
    
    if (prefs.emailPayment !== undefined) mapped.email_payment = prefs.emailPayment;
    if (prefs.emailMarketing !== undefined) mapped.email_marketing = prefs.emailMarketing;
    if (prefs.emailEventUpdates !== undefined) mapped.email_event_updates = prefs.emailEventUpdates;
    if (prefs.emailAccount !== undefined) mapped.email_account = prefs.emailAccount;
    
    if (prefs.smsCriticalOnly !== undefined) mapped.sms_critical_only = prefs.smsCriticalOnly;
    if (prefs.smsPayment !== undefined) mapped.sms_payment = prefs.smsPayment;
    if (prefs.smsEventReminders !== undefined) mapped.sms_event_reminders = prefs.smsEventReminders;
    
    if (prefs.pushPayment !== undefined) mapped.push_payment = prefs.pushPayment;
    if (prefs.pushEventUpdates !== undefined) mapped.push_event_updates = prefs.pushEventUpdates;
    if (prefs.pushMarketing !== undefined) mapped.push_marketing = prefs.pushMarketing;
    
    if (prefs.quietHoursEnabled !== undefined) mapped.quiet_hours_enabled = prefs.quietHoursEnabled;
    if (prefs.quietHoursStart !== undefined) mapped.quiet_hours_start = prefs.quietHoursStart;
    if (prefs.quietHoursEnd !== undefined) mapped.quiet_hours_end = prefs.quietHoursEnd;
    if (prefs.timezone !== undefined) mapped.timezone = prefs.timezone;
    
    if (prefs.maxEmailsPerDay !== undefined) mapped.max_emails_per_day = prefs.maxEmailsPerDay;
    if (prefs.maxSmsPerDay !== undefined) mapped.max_sms_per_day = prefs.maxSmsPerDay;
    
    return mapped;
  }
  
  private async recordHistory(
    userId: string,
    before: UserPreferences,
    after: Partial<UserPreferences>,
    changedBy?: string,
    reason?: string
  ): Promise<void> {
    const changes: any = {};
    
    for (const [key, value] of Object.entries(after)) {
      if ((before as any)[key] !== value) {
        changes[key] = {
          from: (before as any)[key],
          to: value
        };
      }
    }
    
    if (Object.keys(changes).length > 0) {
      await db('notification_preference_history').insert({
        user_id: userId,
        changed_by: changedBy,
        changes: JSON.stringify(changes),
        reason,
        created_at: new Date()
      });
    }
  }
  
  private isQuietHours(prefs: UserPreferences): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }
    
    // Convert to user's timezone and check
    // For now, simple implementation
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(prefs.quietHoursStart.split(':')[0]);
    const endHour = parseInt(prefs.quietHoursEnd.split(':')[0]);
    
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Overnight quiet hours
      return currentHour >= startHour || currentHour < endHour;
    }
  }
  
  private isCritical(type: string): boolean {
    return ['payment_failed', 'account_security', 'urgent'].includes(type);
  }
  
  private async getTodayCount(userId: string, channel: string): Promise<number> {
    const result = await db('notification_history')
      .where('user_id', userId)
      .where('channel', channel)
      .where('created_at', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
      .count('id as count')
      .first();
    
    return Number(result?.count) || 0;
  }
}

export const preferenceManager = new PreferenceManager();
