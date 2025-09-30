import { db } from '../config/database';
import { SuppressionRecord, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import crypto from 'crypto';

export class SuppressionModel {
  private readonly tableName = 'suppression_list';

  async add(suppression: Omit<SuppressionRecord, 'id'>): Promise<SuppressionRecord> {
    // Hash the identifier for privacy
    const hashedIdentifier = this.hashIdentifier(suppression.identifier);

    const [record] = await db(this.tableName)
      .insert({
        ...suppression,
        id: db.raw('gen_random_uuid()'),
        identifier_hash: hashedIdentifier,
        created_at: new Date(),
      })
      .returning('*');
    
    logger.info('Added to suppression list', { 
      channel: suppression.channel,
      reason: suppression.reason 
    });
    
    return this.mapToSuppressionRecord(record);
  }

  async isSuppressed(identifier: string, channel: NotificationChannel): Promise<boolean> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    const result = await db(this.tableName)
      .where('identifier_hash', hashedIdentifier)
      .andWhere('channel', channel)
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      })
      .first();

    return !!result;
  }

  async remove(identifier: string, channel?: NotificationChannel): Promise<void> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    let query = db(this.tableName)
      .where('identifier_hash', hashedIdentifier);

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    await query.delete();

    logger.info('Removed from suppression list', { channel });
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<SuppressionRecord[]> {
    const records = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return records.map(this.mapToSuppressionRecord);
  }

  private hashIdentifier(identifier: string): string {
    return crypto
      .createHash('sha256')
      .update(identifier.toLowerCase().trim())
      .digest('hex');
  }

  private mapToSuppressionRecord(row: any): SuppressionRecord {
    return {
      id: row.id,
      identifier: row.identifier, // Note: This might be null for privacy
      channel: row.channel,
      reason: row.reason,
      suppressedAt: row.suppressed_at || row.created_at,
      suppressedBy: row.suppressed_by,
      expiresAt: row.expires_at,
    };
  }
}

export const suppressionModel = new SuppressionModel();
