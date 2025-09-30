import { db } from '../config/database';
import { ConsentRecord, NotificationChannel, NotificationType } from '../types/notification.types';
import { logger } from '../config/logger';

export class ConsentModel {
  private readonly tableName = 'consent_records';

  async create(consent: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const [record] = await db(this.tableName)
      .insert({
        customer_id: consent.customerId,
        venue_id: consent.venueId,
        channel: consent.channel,
        type: consent.type,
        status: consent.status,
        granted_at: consent.grantedAt,
        source: consent.source,
        ip_address: consent.ipAddress,
        user_agent: consent.userAgent,
        id: db.raw('gen_random_uuid()'),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    
    logger.info('Consent record created', { 
      customerId: consent.customerId, 
      channel: consent.channel,
      status: consent.status 
    });
    
    return this.mapToConsentRecord(record);
  }

  async findByCustomer(
    customerId: string, 
    channel?: NotificationChannel, 
    type?: NotificationType
  ): Promise<ConsentRecord[]> {
    let query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('status', 'granted');

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    if (type) {
      query = query.andWhere('type', type);
    }

    const records = await query;
    return records.map(this.mapToConsentRecord);
  }

  async hasConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    venueId?: string
  ): Promise<boolean> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('type', type)
      .andWhere('status', 'granted')
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      });

    if (venueId) {
      query.andWhere(function() {
        this.whereNull('venue_id')
          .orWhere('venue_id', venueId);
      });
    }

    const result = await query.first();
    return !!result;
  }

  async revoke(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('status', 'granted');

    if (type) {
      query.andWhere('type', type);
    }

    if (venueId) {
      query.andWhere('venue_id', venueId);
    }

    await query.update({
      status: 'revoked',
      revoked_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Consent revoked', { customerId, channel, type, venueId });
  }

  async getAuditTrail(customerId: string): Promise<ConsentRecord[]> {
    const records = await db(this.tableName)
      .where('customer_id', customerId)
      .orderBy('created_at', 'desc');
    
    return records.map(this.mapToConsentRecord);
  }

  private mapToConsentRecord(row: any): ConsentRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      venueId: row.venue_id,
      channel: row.channel,
      type: row.type,
      status: row.status,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      source: row.source,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}

export const consentModel = new ConsentModel();
